# Fix for Settings Menu Not Showing

## Problem
After upgrading to superadmin role, settings menu items are not visible in the left navigation.

## Root Cause
Your browser has cached the old JWT token with the old `role: 'user'` instead of the new `role: 'dev'` (superadmin).

## Solution

### Option 1: Logout and Login (Recommended)
1. **Logout** from the application
2. **Login** again with your credentials
3. New JWT token will be issued with `role: 'dev'`
4. Settings menu should now appear

### Option 2: Clear Browser Storage
1. Open **Developer Tools** (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Clear **Local Storage** and **Session Storage**
4. Refresh the page
5. Login again

### Option 3: Clear Specific Token
1. Open **Developer Tools** (F12)
2. Go to **Console** tab
3. Run:
```javascript
localStorage.clear();
sessionStorage.clear();
// Or specifically:
localStorage.removeItem('token');
localStorage.removeItem('auth_token');
sessionStorage.removeItem('token');
```
4. Refresh and login again

### Option 4: Hard Refresh
1. **Windows/Linux:** `Ctrl + Shift + R` or `Ctrl + F5`
2. **Mac:** `Cmd + Shift + R`
3. This clears cache and reloads the page

---

## Verify the Fix

After logging back in, check your JWT token:

### In Developer Console:
```javascript
// Get token from localStorage
const token = localStorage.getItem('token') || sessionStorage.getItem('token');

// Decode JWT (without verification - just to see contents)
const base64Url = token.split('.')[1];
const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
const payload = JSON.parse(window.atob(base64));

console.log('Role:', payload.role);
// Should show: role: "dev"
```

Or use jwt.io:
1. Go to https://jwt.io
2. Paste your token
3. Check the payload section
4. Should show `"role": "dev"`

---

## Backend Verification

To verify the backend is working correctly:

### Test with cURL:
```bash
# 1. Login to get new token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "yourpassword",
    "tenantId": "demo"
  }'

# Save the token from response

# 2. Check your user info
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Should show role: "dev"

# 3. Test settings access
curl http://localhost:3001/api/settings/approvals/thresholds \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Should return data without 403 errors
```

---

## If Still Not Working

If the settings menu still doesn't appear after logout/login, the issue might be in the frontend code itself. Check:

### 1. Frontend Menu Configuration
The frontend might be hardcoding which roles can see settings. Look for:
- `src/components/Navigation.jsx` or similar
- `src/config/menu.js` or similar
- Any file that defines navigation items

### 2. Frontend Permission Checks
Look for code like:
```javascript
// Example of problematic code
if (user.role === 'admin') {
  showSettingsMenu();
}
```

This should be changed to:
```javascript
// Fixed code
if (user.role === 'dev' || user.role === 'admin') {
  showSettingsMenu();
}
```

Or better yet, remove role checks entirely for superadmin:
```javascript
// Even better
const isSuperAdmin = user.role === 'dev' || user.role === 'admin';
if (isSuperAdmin) {
  showAllMenus();
}
```

### 3. Frontend API Calls
The frontend might be calling an endpoint to check permissions. If so, verify:
- The endpoint returns correct permissions for 'dev' role
- The frontend correctly interprets the response

---

## Quick Test

Try this in your browser console while logged in:

```javascript
// Check current user
fetch('/api/auth/me', {
  headers: {
    'Authorization': 'Bearer ' + (localStorage.getItem('token') || sessionStorage.getItem('token'))
  }
})
.then(r => r.json())
.then(data => console.log('Current user:', data));

// Should show role: "dev"
```

---

## Summary

**Most likely solution:** Simply **logout and login** again to get a fresh JWT token with the updated `role: 'dev'`.

If that doesn't work, the issue is in the frontend code and needs to be fixed there.
