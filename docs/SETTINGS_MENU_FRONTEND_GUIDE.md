# Settings Menu - Frontend Integration Guide

## Overview

This guide explains how to integrate the backend Settings API endpoints into your frontend application to create a fully functional settings menu.

---

## Backend Status: ✅ READY

All settings API endpoints are **properly configured, mounted, and accessible** in the backend:

- ✅ Settings routes registered in `index.cjs`
- ✅ Authentication middleware applied
- ✅ Permission checks in place (superadmin/admin/dev role)
- ✅ Server running and endpoints accessible
- ✅ Database schema supports all settings features

---

## Available Settings API Endpoints

### 1. Approval Thresholds Settings
**Base URL:** `/api/settings/approvals`

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/thresholds` | List all approval thresholds | Authenticated |
| GET | `/thresholds/by-entity/:entityType` | List thresholds by entity type | Authenticated |
| GET | `/thresholds/:id` | Get threshold details | Authenticated |
| POST | `/thresholds` | Create new threshold | `settings_manage` |
| PUT | `/thresholds/:id` | Update threshold | `settings_manage` |
| DELETE | `/thresholds/:id` | Delete/deactivate threshold | `settings_manage` |
| POST | `/thresholds/:id/test` | Test threshold matching | Authenticated |
| GET | `/thresholds/match/:entityType/:value` | Find matching threshold | Authenticated |

**Example Response:**
```json
{
  "thresholds": [
    {
      "id": "th_123",
      "entityType": "CONTRACT",
      "name": "Small Contracts",
      "minValue": 0,
      "maxValue": 50000,
      "approvalSteps": [
        { "role": "PROJECT_MANAGER", "stage": 1 },
        { "role": "FINANCE_MANAGER", "stage": 2 }
      ],
      "requiresRiskAssessment": false,
      "requiresDesignReview": false,
      "requiresHSQE": true,
      "requiresClientApproval": false,
      "targetApprovalDays": 5,
      "sequence": 1,
      "isActive": true
    }
  ]
}
```

---

### 2. Email Templates Settings
**Base URL:** `/api/settings/email-templates`

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/` | List all email templates | Admin only |
| GET | `/:id` | Get template details | Admin only |
| POST | `/` | Create new template | Admin only |
| PUT | `/:id` | Update template | Admin only |
| DELETE | `/:id` | Delete template | Admin only |

**Example Response:**
```json
{
  "templates": [
    {
      "id": "tpl_456",
      "type": "TENDER_INVITATION",
      "name": "Standard Tender Invitation",
      "subject": "Invitation to Tender: {{projectName}}",
      "bodyHtml": "<p>Dear {{supplierName}},...</p>",
      "isDefault": true,
      "tenantId": "tenant_123"
    }
  ]
}
```

---

### 3. Tender Templates Settings
**Base URL:** `/api/settings/tender-templates`

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/` | List all tender templates | Admin only |
| GET | `/:id` | Get template with sections/questions | Admin only |
| POST | `/` | Create new template | Admin only |
| PUT | `/:id` | Update template | Admin only |
| DELETE | `/:id` | Delete template | Admin only |

**Example Response:**
```json
{
  "templates": [
    {
      "id": "tt_789",
      "name": "Standard RFQ Template",
      "description": "Standard Request for Quotation template",
      "sections": [
        {
          "id": "sec_001",
          "title": "Company Information",
          "orderIndex": 1,
          "questions": [
            {
              "id": "q_001",
              "questionText": "Company Name",
              "questionType": "TEXT",
              "isRequired": true,
              "orderIndex": 1
            }
          ]
        }
      ]
    }
  ]
}
```

---

### 4. General Tenant Settings
**Base URL:** `/api/v1/settings`

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/taxonomies` | List all taxonomies | Authenticated |
| GET | `/taxonomies/:key` | Get taxonomy details | Authenticated |
| POST | `/taxonomies` | Create new taxonomy | Authenticated |
| POST | `/taxonomies/:key/terms` | Update taxonomy terms | Authenticated |
| PATCH | `/taxonomies/:key` | Update taxonomy metadata | Authenticated |
| GET | `/tenant` | Get tenant settings | Authenticated |
| PATCH | `/tenant` | Update tenant settings | Authenticated |
| PATCH | `/tenant/self-supplier` | Set self-supplier ID | Authenticated |

**Example Response:**
```json
{
  "default_rfx_scoring_set": "standard",
  "default_contract_family": "NEC",
  "award_override_reason_required": true,
  "selfSupplierId": 123
}
```

---

## Frontend Integration Steps

### Step 1: Create Settings Menu Structure

Your frontend should have a settings menu with the following sections:

```jsx
// Suggested Settings Menu Structure
const settingsMenuSections = [
  {
    id: 'approvals',
    title: 'Approval Framework',
    icon: 'CheckCircleIcon',
    description: 'Configure approval thresholds and workflows',
    path: '/settings/approvals',
    permission: 'settings_manage' // or role: 'admin'/'dev'
  },
  {
    id: 'email-templates',
    title: 'Email Templates',
    icon: 'MailIcon',
    description: 'Manage email templates for automated communications',
    path: '/settings/email-templates',
    permission: 'admin'
  },
  {
    id: 'tender-templates',
    title: 'Tender Templates',
    icon: 'DocumentIcon',
    description: 'Create and manage tender question templates',
    path: '/settings/tender-templates',
    permission: 'admin'
  },
  {
    id: 'taxonomies',
    title: 'Taxonomies',
    icon: 'TagIcon',
    description: 'Manage system taxonomies and classifications',
    path: '/settings/taxonomies',
    permission: 'authenticated'
  },
  {
    id: 'tenant',
    title: 'Tenant Settings',
    icon: 'CogIcon',
    description: 'General system settings for your organization',
    path: '/settings/tenant',
    permission: 'admin'
  }
];
```

---

### Step 2: Create Settings API Service

Create a service to interact with the backend:

```javascript
// services/settingsApi.js
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Get auth token from localStorage/sessionStorage
const getAuthHeaders = () => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

export const settingsApi = {
  // Approval Thresholds
  approvals: {
    list: (params = {}) =>
      axios.get(`${API_BASE_URL}/api/settings/approvals/thresholds`, {
        params,
        headers: getAuthHeaders()
      }),

    getById: (id) =>
      axios.get(`${API_BASE_URL}/api/settings/approvals/thresholds/${id}`, {
        headers: getAuthHeaders()
      }),

    create: (data) =>
      axios.post(`${API_BASE_URL}/api/settings/approvals/thresholds`, data, {
        headers: getAuthHeaders()
      }),

    update: (id, data) =>
      axios.put(`${API_BASE_URL}/api/settings/approvals/thresholds/${id}`, data, {
        headers: getAuthHeaders()
      }),

    delete: (id) =>
      axios.delete(`${API_BASE_URL}/api/settings/approvals/thresholds/${id}`, {
        headers: getAuthHeaders()
      })
  },

  // Email Templates
  emailTemplates: {
    list: (params = {}) =>
      axios.get(`${API_BASE_URL}/api/settings/email-templates`, {
        params,
        headers: getAuthHeaders()
      }),

    getById: (id) =>
      axios.get(`${API_BASE_URL}/api/settings/email-templates/${id}`, {
        headers: getAuthHeaders()
      }),

    create: (data) =>
      axios.post(`${API_BASE_URL}/api/settings/email-templates`, data, {
        headers: getAuthHeaders()
      }),

    update: (id, data) =>
      axios.put(`${API_BASE_URL}/api/settings/email-templates/${id}`, data, {
        headers: getAuthHeaders()
      }),

    delete: (id) =>
      axios.delete(`${API_BASE_URL}/api/settings/email-templates/${id}`, {
        headers: getAuthHeaders()
      })
  },

  // Tender Templates
  tenderTemplates: {
    list: () =>
      axios.get(`${API_BASE_URL}/api/settings/tender-templates`, {
        headers: getAuthHeaders()
      }),

    getById: (id) =>
      axios.get(`${API_BASE_URL}/api/settings/tender-templates/${id}`, {
        headers: getAuthHeaders()
      }),

    create: (data) =>
      axios.post(`${API_BASE_URL}/api/settings/tender-templates`, data, {
        headers: getAuthHeaders()
      }),

    update: (id, data) =>
      axios.put(`${API_BASE_URL}/api/settings/tender-templates/${id}`, data, {
        headers: getAuthHeaders()
      }),

    delete: (id) =>
      axios.delete(`${API_BASE_URL}/api/settings/tender-templates/${id}`, {
        headers: getAuthHeaders()
      })
  },

  // Taxonomies
  taxonomies: {
    list: () =>
      axios.get(`${API_BASE_URL}/api/v1/settings/taxonomies`, {
        headers: getAuthHeaders()
      }),

    getByKey: (key) =>
      axios.get(`${API_BASE_URL}/api/v1/settings/taxonomies/${key}`, {
        headers: getAuthHeaders()
      }),

    create: (data) =>
      axios.post(`${API_BASE_URL}/api/v1/settings/taxonomies`, data, {
        headers: getAuthHeaders()
      }),

    updateTerms: (key, terms) =>
      axios.post(`${API_BASE_URL}/api/v1/settings/taxonomies/${key}/terms`, terms, {
        headers: getAuthHeaders()
      }),

    update: (key, data) =>
      axios.patch(`${API_BASE_URL}/api/v1/settings/taxonomies/${key}`, data, {
        headers: getAuthHeaders()
      })
  },

  // Tenant Settings
  tenant: {
    get: () =>
      axios.get(`${API_BASE_URL}/api/v1/settings/tenant`, {
        headers: getAuthHeaders()
      }),

    update: (data) =>
      axios.patch(`${API_BASE_URL}/api/v1/settings/tenant`, data, {
        headers: getAuthHeaders()
      }),

    setSelfSupplier: (supplierId) =>
      axios.patch(`${API_BASE_URL}/api/v1/settings/tenant/self-supplier`,
        { supplierId },
        { headers: getAuthHeaders() }
      )
  }
};
```

---

### Step 3: Create Settings Menu Component

```jsx
// components/settings/SettingsMenu.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  CheckCircleIcon,
  MailIcon,
  DocumentIcon,
  TagIcon,
  CogIcon
} from '@heroicons/react/outline';

const settingsMenuSections = [
  {
    id: 'approvals',
    title: 'Approval Framework',
    icon: CheckCircleIcon,
    description: 'Configure approval thresholds and workflows',
    path: '/settings/approvals'
  },
  {
    id: 'email-templates',
    title: 'Email Templates',
    icon: MailIcon,
    description: 'Manage email templates for automated communications',
    path: '/settings/email-templates'
  },
  {
    id: 'tender-templates',
    title: 'Tender Templates',
    icon: DocumentIcon,
    description: 'Create and manage tender question templates',
    path: '/settings/tender-templates'
  },
  {
    id: 'taxonomies',
    title: 'Taxonomies',
    icon: TagIcon,
    description: 'Manage system taxonomies and classifications',
    path: '/settings/taxonomies'
  },
  {
    id: 'tenant',
    title: 'General Settings',
    icon: CogIcon,
    description: 'General system settings for your organization',
    path: '/settings/tenant'
  }
];

export default function SettingsMenu() {
  const location = useLocation();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-600">
          Manage your system configuration and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {settingsMenuSections.map((section) => {
          const Icon = section.icon;
          const isActive = location.pathname === section.path;

          return (
            <Link
              key={section.id}
              to={section.path}
              className={`
                block p-6 rounded-lg border-2 transition-all hover:shadow-lg
                ${isActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-blue-300'
                }
              `}
            >
              <div className="flex items-start">
                <Icon className={`
                  h-8 w-8 flex-shrink-0
                  ${isActive ? 'text-blue-600' : 'text-gray-400'}
                `} />
                <div className="ml-4">
                  <h3 className={`
                    text-lg font-semibold
                    ${isActive ? 'text-blue-900' : 'text-gray-900'}
                  `}>
                    {section.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    {section.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

---

### Step 4: Create Approval Thresholds Page (Example)

```jsx
// pages/settings/ApprovalsPage.jsx
import React, { useState, useEffect } from 'react';
import { settingsApi } from '../../services/settingsApi';

export default function ApprovalsPage() {
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadThresholds();
  }, []);

  const loadThresholds = async () => {
    try {
      setLoading(true);
      const response = await settingsApi.approvals.list();
      setThresholds(response.data.thresholds);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load thresholds');
      console.error('Error loading thresholds:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this threshold?')) {
      return;
    }

    try {
      await settingsApi.approvals.delete(id);
      await loadThresholds(); // Reload list
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete threshold');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Approval Thresholds</h1>
          <p className="mt-2 text-gray-600">
            Configure approval rules based on entity type and value
          </p>
        </div>
        <button
          onClick={() => {/* Navigate to create page */}}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create Threshold
        </button>
      </div>

      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Entity Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Value Range
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Approval Steps
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {thresholds.map((threshold) => (
              <tr key={threshold.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {threshold.name}
                  </div>
                  {threshold.description && (
                    <div className="text-sm text-gray-500">
                      {threshold.description}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {threshold.entityType}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  £{threshold.minValue.toLocaleString()} -
                  {threshold.maxValue
                    ? ` £${threshold.maxValue.toLocaleString()}`
                    : ' Unlimited'
                  }
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {threshold.approvalSteps?.length || 0} steps
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`
                    inline-flex px-2 py-1 text-xs font-semibold rounded-full
                    ${threshold.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                    }
                  `}>
                    {threshold.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => {/* Navigate to edit page */}}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(threshold.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {thresholds.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No approval thresholds configured yet.</p>
            <button
              onClick={() => {/* Navigate to create page */}}
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              Create your first threshold
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### Step 5: Add Routes to Your Router

```jsx
// App.jsx or routes/index.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SettingsMenu from './components/settings/SettingsMenu';
import ApprovalsPage from './pages/settings/ApprovalsPage';
import EmailTemplatesPage from './pages/settings/EmailTemplatesPage';
import TenderTemplatesPage from './pages/settings/TenderTemplatesPage';
import TaxonomiesPage from './pages/settings/TaxonomiesPage';
import TenantSettingsPage from './pages/settings/TenantSettingsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Settings Routes */}
        <Route path="/settings" element={<SettingsMenu />} />
        <Route path="/settings/approvals" element={<ApprovalsPage />} />
        <Route path="/settings/email-templates" element={<EmailTemplatesPage />} />
        <Route path="/settings/tender-templates" element={<TenderTemplatesPage />} />
        <Route path="/settings/taxonomies" element={<TaxonomiesPage />} />
        <Route path="/settings/tenant" element={<TenantSettingsPage />} />

        {/* Other routes... */}
      </Routes>
    </BrowserRouter>
  );
}
```

---

### Step 6: Add Settings Link to Main Navigation

```jsx
// components/layout/Sidebar.jsx or Navigation.jsx
import { Link } from 'react-router-dom';
import { CogIcon } from '@heroicons/react/outline';

export default function Sidebar() {
  // Check if user has admin/dev role
  const userRole = getUserRole(); // Get from your auth context/store
  const canAccessSettings = ['admin', 'dev'].includes(userRole);

  return (
    <nav>
      {/* Other menu items */}

      {canAccessSettings && (
        <Link
          to="/settings"
          className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100"
        >
          <CogIcon className="h-5 w-5 mr-3" />
          <span>Settings</span>
        </Link>
      )}
    </nav>
  );
}
```

---

## Role-Based Access Control

The backend enforces the following permission checks:

### Superadmin/Dev Role (Full Access)
- Role: `dev` or `admin`
- Permissions: `['*']` (all permissions)
- Can access ALL settings endpoints
- No restrictions

### Regular Users
- Need specific permissions:
  - `settings_manage` - For creating/editing approval thresholds
  - `admin` - For email templates and tender templates

### Frontend Permission Checking

```javascript
// utils/permissions.js
export function checkPermission(userRole, requiredPermission) {
  // Superadmin roles have full access
  if (['dev', 'admin'].includes(userRole)) {
    return true;
  }

  // Check specific permission
  // (implement based on your permission system)
  return false;
}

// Example usage in component
function SettingsMenuItem({ section }) {
  const { user } = useAuth(); // Your auth context

  if (!checkPermission(user.role, section.permission)) {
    return null; // Hide menu item
  }

  return <Link to={section.path}>{section.title}</Link>;
}
```

---

## Testing the Integration

### 1. Test Backend Endpoints
```bash
# Get your auth token from browser console:
# localStorage.getItem('token')

# Test approval thresholds endpoint
curl http://localhost:3001/api/settings/approvals/thresholds \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test tenant settings endpoint
curl http://localhost:3001/api/v1/settings/tenant \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test email templates endpoint
curl http://localhost:3001/api/settings/email-templates \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Verify User Role in Frontend
```javascript
// In browser console:
const token = localStorage.getItem('token') || sessionStorage.getItem('token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('User role:', payload.role);
console.log('Permissions:', payload.permissions || payload.roles);

// Should show: role: "dev" for superadmin access
```

### 3. Check Settings Menu Visibility
- Make sure you're logged out and logged back in (to get new JWT with updated role)
- Check that Settings link appears in your main navigation
- Click Settings and verify all sections are visible
- Try accessing each settings page

---

## Troubleshooting

### Settings Menu Not Showing?

**Problem:** Settings link doesn't appear in navigation

**Solution:**
1. Logout and login again to get fresh JWT token with updated role
2. Check token in browser console:
   ```javascript
   const token = localStorage.getItem('token');
   const payload = JSON.parse(atob(token.split('.')[1]));
   console.log('Role:', payload.role); // Should be 'dev' for superadmin
   ```
3. Clear browser cache:
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```
4. Verify your navigation component checks for the correct role

### API Endpoints Return 403 Forbidden?

**Problem:** Backend returns 403 when calling settings endpoints

**Solution:**
1. Verify you have the correct role (dev/admin)
2. Check your JWT token is being sent in Authorization header
3. Verify token hasn't expired
4. Check backend logs for permission check failures

### API Endpoints Return 404?

**Problem:** Backend returns 404 for settings endpoints

**Solution:**
1. Verify backend server is running: `npm start` or `node index.cjs`
2. Check correct base URL (http://localhost:3001)
3. Verify routes are mounted in `index.cjs`

---

## Summary Checklist

Backend (Already Complete):
- ✅ All settings routes created and working
- ✅ Routes registered in index.cjs
- ✅ Permission middleware applied
- ✅ Server running and accessible

Frontend (To Implement):
- ❓ Create Settings menu component
- ❓ Create settings API service layer
- ❓ Create individual settings pages (Approvals, Templates, etc.)
- ❓ Add Settings link to main navigation
- ❓ Implement role-based visibility checks
- ❓ Add routes to router configuration

---

## Next Steps

1. **Implement Settings Menu Component** - Use the code examples above
2. **Create API Service Layer** - Copy the `settingsApi.js` code
3. **Build Individual Settings Pages** - Start with Approvals page example
4. **Add Navigation Link** - Update your main navigation/sidebar
5. **Test Everything** - Use the testing section above

Need help? Check these files:
- Backend routes: `/routes/settings.*.cjs`
- Backend route registration: `/index.cjs` (lines 366-369)
- Permission middleware: `/middleware/checkPermission.cjs`
- Auth middleware: `/middleware/requireAuth.cjs`

---

**Last Updated:** 2025-11-12
