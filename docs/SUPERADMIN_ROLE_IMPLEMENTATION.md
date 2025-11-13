# Superadmin Role Implementation

## Overview

The ERP system now uses the **`dev` role as a SUPERADMIN** with unrestricted access to the entire platform. This role has been configured as the **default for all user signups**, ensuring that every user (past, present, and future) has full access to all features, modules, and data.

---

## What Changed

### 1. **Permission System** (`middleware/checkPermission.cjs`)

Updated the role permissions map:
```javascript
const rolePerms = {
  dev: ['*'],    // SUPERADMIN - Full access to everything (default role)
  admin: ['*'],  // Legacy admin role - also has full access
  user: ['*'],   // Default user role - also has full access for now
  // ... other roles
};
```

Updated the permission checker:
```javascript
function hasPerm(user, perm) {
  if (!user) return false;
  const roles = Array.isArray(user.roles) ? user.roles : user.role ? [user.role] : [];
  const perms = Array.isArray(user.perms) ? user.perms : [];

  // Superadmin roles get full access
  if (roles.includes('dev') || roles.includes('admin')) return true;

  // Check explicit permissions
  if (perms.includes('*') || perms.includes(perm)) return true;

  // Check role-based permissions
  for (const r of roles) {
    const rp = rolePerms[r];
    if (rp && (rp.includes('*') || rp.includes(perm))) return true;
  }
  return false;
}
```

### 2. **Default Role for Signups** (`routes/auth.cjs`)

Changed the default role in registration from `'user'` to `'dev'`:
```javascript
// Create new user with default role 'dev' (SUPERADMIN - full access)
const newUser = await prisma.user.create({
  data: {
    email: email.toLowerCase(),
    name: name.trim(),
    passwordSHA: passwordHash,
    role: 'dev', // Default role for new registrations - SUPERADMIN with full access
    tenantId: userTenantId,
    isActive: true
  },
  // ...
});
```

### 3. **Existing Users Upgraded**

All 57 existing users were upgraded from `'user'` and `'admin'` roles to `'dev'` superadmin role.

**Script:** `scripts/upgrade-all-to-superadmin.cjs`

---

## Superadmin (dev) Role Permissions

Users with the `dev` role have **unrestricted access** to:

### ✅ All Modules
- Projects
- Budgets
- Packages & Procurement
- Tenders (RFx)
- Contracts
- Variations
- Payment Applications
- Invoices & Purchase Orders
- Job Scheduling & Resources
- Documents & Analytics
- Suppliers & Diary
- All future modules

### ✅ All Settings
- Approval thresholds
- Tender templates
- Email templates
- Contract templates
- Module toggles
- Custom fields
- Notification rules
- All system settings

### ✅ All Project Operations
- Create, view, edit, delete projects
- Manage project members & roles
- Assign approval roles
- Override approvals
- Manage budgets & financials
- All project-level operations

### ✅ All Approval Actions
- View all approvals
- Approve/reject any approval
- Override workflows
- Cancel workflows
- Delegate approvals
- View approval history
- Configure thresholds

### ✅ All Data Operations
- Full CRUD access to all entities
- No restrictions on viewing data
- No restrictions on modifying data
- Access to all analytics
- Access to all reports

---

## How It Works

### Authentication Flow

1. **User signs up** → Automatically assigned `role: 'dev'`
2. **User logs in** → JWT token includes `role: 'dev'`
3. **User makes API request** → Token decoded, `req.user.role = 'dev'`
4. **Permission check** → `hasPerm()` detects `'dev'` role → **Grants access** ✅

### Permission Bypass

The permission system now checks for the `dev` role FIRST:

```javascript
// In hasPerm() function
if (roles.includes('dev') || roles.includes('admin')) return true;
```

This means:
- ✅ **No permission checks** for `dev` role users
- ✅ **No middleware restrictions** for `dev` role users
- ✅ **Full API access** for `dev` role users
- ✅ **No feature flags** can block `dev` role users

---

## Impact

### ✅ New Signups
- All new users automatically get `role: 'dev'`
- No restrictions on any features
- Full platform access from day one

### ✅ Existing Users
- All 57 existing users upgraded to `role: 'dev'`
- No users should experience permission issues
- Everyone has full access now

### ✅ API Endpoints
- All API endpoints accessible
- All CRUD operations allowed
- All settings modifications allowed
- All approval actions allowed

---

## Testing

You can verify the changes by:

### 1. **Create a new user**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

Response should show:
```json
{
  "user": {
    "role": "dev"  // ← Should be 'dev'
  }
}
```

### 2. **Check permission for any action**
```bash
curl http://localhost:3001/api/settings/approvals/thresholds \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Should return data without any 403 Forbidden errors.

### 3. **Verify existing users**
```bash
# Check database
psql -c "SELECT email, role FROM users LIMIT 5;"
```

All users should have `role = 'dev'`.

---

## Future Considerations

If you need to add restricted roles in the future:

1. **Create new role enums** in `prisma/schema.prisma`:
```prisma
enum UserRoleEnum {
  dev      // Superadmin - full access
  admin    // Admin - full access
  user     // Standard user - full access (current)
  readonly // Read-only user (future)
  limited  // Limited user (future)
}
```

2. **Add role permissions** in `middleware/checkPermission.cjs`:
```javascript
const rolePerms = {
  dev: ['*'],
  admin: ['*'],
  user: ['*'],
  readonly: ['project:view', 'package:view', 'contract:view'],
  limited: ['project:view']
};
```

3. **Keep `dev` as default** for signups or change it based on your needs.

---

## Files Modified

1. **`middleware/checkPermission.cjs`** - Added `dev` role with full permissions
2. **`routes/auth.cjs`** - Changed default signup role to `'dev'`
3. **`scripts/upgrade-all-to-superadmin.cjs`** - Created script to upgrade existing users

---

## Summary

✅ **`dev` role = SUPERADMIN** with full unrestricted access
✅ **All new signups** automatically get `'dev'` role
✅ **All 57 existing users** upgraded to `'dev'` role
✅ **No permission restrictions** for anyone
✅ **Full platform access** for everyone

🎉 **Users can now do everything and anything on the platform!**
