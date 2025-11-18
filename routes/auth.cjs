const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { prisma } = require('../utils/prisma.cjs');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
const TENANT_DEFAULT = process.env.TENANT_DEFAULT || 'demo';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(1, 'Name is required'),
  tenantId: z.string().min(1, 'tenantId is required'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  tenantId: z.string().min(1).optional(),
});

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function respondError(res, status, error, message) {
  const payload = { error };
  if (message) payload.message = message;
  return res.status(status).json(payload);
}

async function ensureTenantExists(tenantId) {
  return prisma.tenantSettings.findFirst({ where: { tenantId } });
}

function issueToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message || 'Invalid input';
    return respondError(res, 400, 'INVALID_INPUT', message);
  }

  try {
    const { email, password, name, tenantId } = parsed.data;
    const normalizedEmail = normalizeEmail(email);
    const normalizedTenantId = tenantId.trim();

    const tenant = await ensureTenantExists(normalizedTenantId);
    if (!tenant) {
      return respondError(res, 404, 'TENANT_NOT_FOUND', 'Tenant does not exist');
    }

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return respondError(res, 409, 'USER_EXISTS', 'User already registered');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name.trim(),
        passwordSHA: passwordHash,
        tenantId: normalizedTenantId,
        role: 'user',
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const token = issueToken(created);
    return res.status(201).json({ token, user: sanitizeUser(created) });
  } catch (error) {
    console.error('[auth.register] unexpected error', error);
    return respondError(res, 500, 'REGISTRATION_FAILED', 'Registration failed. Please try again.');
  }
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message || 'Invalid input';
    return respondError(res, 400, 'INVALID_INPUT', message);
  }

  try {
    const { email, password } = parsed.data;
    const tenantId = (parsed.data.tenantId || TENANT_DEFAULT).trim();

    if (!tenantId) {
      return respondError(res, 400, 'INVALID_INPUT', 'tenantId is required');
    }

    const tenant = await ensureTenantExists(tenantId);
    if (!tenant) {
      return respondError(res, 404, 'TENANT_NOT_FOUND', 'Tenant does not exist');
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        tenantId,
        isActive: true,
      },
    });

    if (!user) {
      return respondError(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }

    const validPassword = await bcrypt.compare(password, user.passwordSHA || '');
    if (!validPassword) {
      return respondError(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }

    const token = issueToken(user);
    const safeUser = sanitizeUser(user);
    return res.json({ token, user: safeUser });
  } catch (error) {
    console.error('[auth.login] unexpected error', error);
    return respondError(res, 500, 'LOGIN_FAILED', 'Login failed. Please try again.');
  }
});

router.get('/me', async (req, res) => {
  try {
    let userId = req.user?.id;
    if (!userId) {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return respondError(res, 401, 'UNAUTHORIZED', 'Authorization token required');
      }
      const token = authHeader.slice(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.sub || decoded.userId || decoded.id;
      } catch (_) {
        return respondError(res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
      }
    }

    if (!userId) {
      return respondError(res, 401, 'UNAUTHORIZED', 'Authorization token required');
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return respondError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }

    if (!user.isActive) {
      return respondError(res, 401, 'USER_INACTIVE', 'User account is inactive');
    }

    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('[auth.me] unexpected error', error);
    return respondError(res, 500, 'FETCH_USER_FAILED', 'Failed to fetch user information');
  }
});

module.exports = router;
