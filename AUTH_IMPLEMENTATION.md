# Authentication System Implementation

## Overview
Build a complete authentication system with user registration, login, and role-based access.

## Requirements

### Backend (Node.js/Express/Prisma)

1. **User Model** (update prisma/schema.prisma):
   - Add User table if not exists with fields:
     - id (cuid)
     - email (unique)
     - password (hashed)
     - name
     - role (enum: 'dev', 'user')
     - createdAt
     - updatedAt

2. **Auth Routes** (routes/auth.cjs):
   - POST /api/auth/register - Create new user account (role='user' by default)
   - POST /api/auth/login - Login with email/password, return JWT
   - POST /api/auth/dev/login - Dev login (special dev credentials)
   - POST /api/auth/forgot-password - (SKIP FOR NOW - too complex)
   - GET /api/auth/me - Get current user info

3. **Security**:
   - Use bcrypt for password hashing
   - Use jsonwebtoken for JWT tokens
   - JWT secret from environment variable
   - Token expiry: 7 days
   - Middleware to verify JWT and attach user to req.user

4. **Dev Account**:
   - Create seed script to add dev user:
     - Email: dev@erp.com
     - Password: DevPass123!
     - Role: dev

### Frontend (React/Vite)

1. **Auth Pages**:
   - /login - Login form with "Create new account" button
   - /register - Registration form (email, password, name)
   - Redirect to /login after successful registration

2. **Auth Context** (src/contexts/AuthContext.tsx):
   - Store user state and JWT token
   - Provide login, logout, register functions
   - Check token on mount
   - Store token in localStorage

3. **Protected Routes**:
   - Wrap settings routes with role check (only 'dev' role)
   - Show/hide settings menu item based on user role

4. **UI Components**:
   - Login form with email/password
   - Register form with email/password/name/confirm password
   - Error message display
   - "Create new account" button on login page

## Current Files to Update

Backend:
- prisma/schema.prisma - Add User model
- index.cjs - Add auth middleware
- routes/auth.cjs - CREATE THIS
- prisma/seed.cjs - Add dev user creation

Frontend:
- src/pages/Login.tsx - CREATE THIS
- src/pages/Register.tsx - CREATE THIS
- src/contexts/AuthContext.tsx - CREATE THIS
- src/App.tsx - Add auth routes and protected route logic
- src/components/AppShell.jsx - Hide settings for non-dev users

## Implementation Steps

1. Update Prisma schema with User model
2. Run `npx prisma db push`
3. Create auth routes in backend
4. Create seed script for dev user
5. Run seed script
6. Create frontend auth context
7. Create login/register pages
8. Update routing to protect settings
9. Test login flow
10. Test registration flow

## Security Notes
- NEVER store passwords in plain text
- Use bcrypt with salt rounds >= 10
- JWT secret should be strong and in environment variable
- Validate email format
- Require password minimum length (8 characters)
- Add rate limiting to login/register endpoints (future enhancement)

## Environment Variables Needed

Backend (.env):
```
JWT_SECRET=your-super-secret-jwt-key-change-this
```

Frontend: No changes needed (uses existing API_BASE_URL)

## Testing

### Manual Testing Steps

1. **Registration Flow**:
   - Navigate to /register
   - Enter email: test@example.com
   - Enter name: Test User
   - Enter password: TestPass123!
   - Confirm password: TestPass123!
   - Click Register
   - Should redirect to /login with success message

2. **Login Flow**:
   - Navigate to /login
   - Enter email: test@example.com
   - Enter password: TestPass123!
   - Click Login
   - Should redirect to / (home) with user logged in
   - Settings menu should NOT be visible (regular user)

3. **Dev Login Flow**:
   - Navigate to /login
   - Enter email: dev@erp.com
   - Enter password: DevPass123!
   - Click Login
   - Should redirect to / (home) with user logged in
   - Settings menu SHOULD be visible (dev role)

4. **Protected Routes**:
   - Try to access /settings without dev role
   - Should redirect to / or show access denied

5. **Token Persistence**:
   - Login as dev user
   - Refresh the page
   - Should remain logged in
   - Settings should still be visible

6. **Logout Flow**:
   - Click Logout button
   - Token should be cleared
   - Should redirect to /login
   - Refresh page - should remain logged out

## API Response Formats

### POST /api/auth/register
Request:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

Response (201):
```json
{
  "success": true,
  "message": "User registered successfully"
}
```

Error (400):
```json
{
  "error": "Email already exists"
}
```

### POST /api/auth/login
Request:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

Response (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clxxx",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  }
}
```

Error (401):
```json
{
  "error": "Invalid credentials"
}
```

### GET /api/auth/me
Headers:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Response (200):
```json
{
  "user": {
    "id": "clxxx",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  }
}
```

Error (401):
```json
{
  "error": "Unauthorized"
}
```

## Frontend State Management

### AuthContext Structure
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  role: 'dev' | 'user';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  isDev: boolean;
}
```

### Usage in Components
```typescript
import { useAuth } from '@/contexts/AuthContext';

function SettingsPage() {
  const { user, isDev } = useAuth();

  if (!isDev) {
    return <Navigate to="/" />;
  }

  return <div>Settings Page</div>;
}
```

## Database Schema Addition

Add to prisma/schema.prisma:

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(user)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tenantId  Int      @default(1)

  @@index([email])
  @@index([tenantId])
}

enum Role {
  dev
  user
  admin
}
```

## Dependencies Check

Verify these packages are installed:

Backend:
- bcrypt or bcryptjs
- jsonwebtoken
- express-rate-limit (optional, for rate limiting)

Frontend:
- react-router-dom (already installed)
- No additional auth libraries needed

Install if missing:
```bash
# Backend
cd ~/Documents/2025_ERP/2025_Backend_ERP
npm install bcrypt jsonwebtoken

# Frontend - already has everything needed
```

## Common Issues & Solutions

1. **Issue**: "JWT secret not defined"
   - **Solution**: Add JWT_SECRET to .env file

2. **Issue**: "User table doesn't exist"
   - **Solution**: Run `npx prisma db push`

3. **Issue**: "Cannot read property 'id' of null"
   - **Solution**: Check if req.user is properly attached by auth middleware

4. **Issue**: "CORS error on login"
   - **Solution**: Ensure frontend domain is in CORS allowedOrigins

5. **Issue**: "Token not persisting after refresh"
   - **Solution**: Check localStorage is being read in AuthContext on mount

6. **Issue**: "Dev user can't login"
   - **Solution**: Run seed script to create dev user

## Next Steps After Implementation

1. Add password strength indicator on registration
2. Add "Remember Me" checkbox
3. Add password reset flow (email required)
4. Add two-factor authentication (2FA)
5. Add session management (logout all devices)
6. Add rate limiting to prevent brute force attacks
7. Add audit log for authentication events
8. Add OAuth providers (Google, GitHub, etc.)

## Production Considerations

1. **Security**:
   - Use HTTPS in production
   - Set secure cookie flags
   - Implement CSRF protection
   - Add rate limiting
   - Use strong JWT secrets (generate with: `openssl rand -base64 64`)

2. **Performance**:
   - Cache user data
   - Use Redis for session management
   - Implement token refresh logic

3. **Monitoring**:
   - Log authentication events
   - Monitor failed login attempts
   - Alert on suspicious activity

4. **Compliance**:
   - Implement password expiry policies
   - Store audit logs
   - GDPR compliance for user data
