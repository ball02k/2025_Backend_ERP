const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma.cjs');

const router = express.Router();

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES_IN = '7d'; // 7 day expiry
const BCRYPT_SALT_ROUNDS = 10;

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /register - Register new user with bcrypt password hashing
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, tenantId } = req.body || {};

    // Input validation
    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'Email, password, and name are required'
      });
    }

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Validate password length (minimum 8 characters)
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long'
      });
    }

    // Use provided tenantId or default to 'demo'
    const userTenantId = tenantId || 'demo';

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId: userTenantId
      }
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'User with this email already exists'
      });
    }

    // Hash password with bcrypt (salt rounds >= 10)
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Create new user with default role 'user'
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name.trim(),
        passwordSHA: passwordHash, // Using passwordSHA field as specified
        role: 'user', // Default role for new registrations
        tenantId: userTenantId,
        isActive: true
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        createdAt: true
      }
    });

    // Generate JWT token with userId, email, role
    const token = jwt.sign(
      {
        sub: newUser.id,
        email: newUser.email,
        role: newUser.role,
        tenantId: newUser.tenantId
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return 201 Created with user data and token
    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        tenantId: newUser.tenantId
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      error: 'Registration failed. Please try again.'
    });
  }
});

// POST /login - Login with email/password, return JWT token
router.post('/login', async (req, res) => {
  try {
    const { email, password, tenantId } = req.body || {};

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // Use provided tenantId or default to 'demo'
    const userTenantId = tenantId || 'demo';

    // Find user by email and tenantId
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId: userTenantId,
        isActive: true
      },
      select: {
        id: true,
        email: true,
        name: true,
        passwordSHA: true,
        role: true,
        tenantId: true
      }
    });

    // Check if user exists
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Compare password with bcrypt hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordSHA);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Generate JWT token with 7 day expiry
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return 200 OK with token and user data
    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      error: 'Login failed. Please try again.'
    });
  }
});

// GET /me - Get current user info (requires JWT auth)
router.get('/me', async (req, res) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authorization token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        error: 'Invalid or expired token'
      });
    }

    // Extract userId from token payload
    const userId = decoded.userId || decoded.sub || decoded.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Invalid token payload'
      });
    }

    // Fetch current user from database
    const user = await prisma.user.findUnique({
      where: {
        id: Number(userId)
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Check if user exists and is active
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: 'User account is inactive'
      });
    }

    // Return user information
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      error: 'Failed to fetch user information'
    });
  }
});

module.exports = router;
