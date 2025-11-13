# Analytics Dashboard & Reporting Documentation

## Overview

This document provides comprehensive documentation for the analytics and reporting system, including API endpoints and example frontend components.

## Backend API Endpoints

### 1. GET /analytics/tenders

Get comprehensive tender analytics with various metrics and trends.

**Query Parameters:**
- `timeRange` (optional): Time range for analytics
  - Values: `1month`, `3months`, `6months`, `1year`, `all`
  - Default: `6months`
- `projectId` (optional): Filter by specific project ID

**Response Structure:**
```json
{
  "overview": {
    "totalTenders": 45,
    "totalPackages": 120,
    "totalResponses": 340,
    "totalAwards": 38,
    "totalAwardedValue": 8500000,
    "avgResponsesPerPackage": 2.83,
    "avgTimeToAward": 45.5
  },
  "tendersByStatus": [
    { "status": "draft", "_count": 5 },
    { "status": "published", "_count": 25 },
    { "status": "closed", "_count": 15 }
  ],
  "packagesByPricingMode": [
    {
      "mode": "lumpsum",
      "_count": 50,
      "_avg": { "estimatedValue": 250000 }
    },
    {
      "mode": "scheduleOfRates",
      "_count": 40,
      "_avg": { "estimatedValue": 180000 }
    }
  ],
  "responsesByStatus": [
    { "status": "draft", "_count": 45 },
    { "status": "submitted", "_count": 295 }
  ],
  "awardsByStatus": [
    { "status": "pending", "_count": 5 },
    { "status": "approved", "_count": 33 }
  ],
  "topSuppliers": [
    {
      "awardedSupplierId": 123,
      "_count": 12,
      "_sum": { "awardedValue": 1500000 },
      "_avg": { "awardedValue": 125000 },
      "supplier": {
        "id": 123,
        "name": "ABC Construction Ltd"
      }
    }
  ],
  "pricesByTrade": [
    {
      "trade": "Groundworks",
      "response_count": 45,
      "avg_package_total": 350000,
      "min_package_total": 150000,
      "max_package_total": 650000
    }
  ],
  "monthlyTrends": [
    {
      "month": "2025-09-01T00:00:00.000Z",
      "tender_count": 8
    }
  ],
  "monthlyAwards": [
    {
      "month": "2025-09-01T00:00:00.000Z",
      "award_count": 6,
      "total_value": 750000
    }
  ],
  "responseRateData": [
    {
      "packageName": "Package A",
      "trade": "Groundworks",
      "totalInvited": 5,
      "totalSubmitted": 4,
      "responseRate": "80.0"
    }
  ],
  "pricingModeStats": [
    {
      "pricingMode": "lumpsum",
      "response_count": 150,
      "submitted_count": 135,
      "avg_price": 285000
    }
  ],
  "timeRange": "6months",
  "startDate": "2025-04-30T00:00:00.000Z",
  "endDate": "2025-10-30T00:00:00.000Z"
}
```

**Example Request:**
```bash
curl -X GET 'http://localhost:3000/analytics/tenders?timeRange=6months' \
  -H 'x-tenant-id: tenant1'
```

---

### 2. GET /analytics/suppliers/:supplierId

Get detailed analytics for a specific supplier.

**Path Parameters:**
- `supplierId`: ID of the supplier

**Response Structure:**
```json
{
  "id": 123,
  "name": "ABC Construction Ltd",
  "email": "contact@abcconstruction.com",
  "contactPerson": "John Smith",
  "phone": "+44 20 1234 5678",
  "metrics": {
    "totalAwards": 12,
    "totalValue": 1500000,
    "avgAwardValue": 125000,
    "totalSubmissions": 34,
    "winRate": "35.3",
    "avgScore": "82.5"
  },
  "awardsByTrade": {
    "Groundworks": {
      "count": 5,
      "value": 650000
    },
    "MEP": {
      "count": 4,
      "value": 550000
    }
  },
  "recentAwards": [
    {
      "id": 456,
      "packageName": "Groundworks Package",
      "trade": "Groundworks",
      "awardedValue": 150000,
      "awardedAt": "2025-10-15T10:00:00.000Z",
      "status": "approved"
    }
  ]
}
```

**Example Request:**
```bash
curl -X GET 'http://localhost:3000/analytics/suppliers/123' \
  -H 'x-tenant-id: tenant1'
```

---

### 3. GET /analytics/projects/:projectId

Get analytics for a specific project.

**Path Parameters:**
- `projectId`: ID of the project

**Response Structure:**
```json
{
  "project": {
    "id": 1,
    "name": "London Office Development",
    "status": "active",
    "tenantId": "tenant1"
  },
  "metrics": {
    "tenderCount": 8,
    "packageCount": 25,
    "awardCount": 20
  }
}
```

**Example Request:**
```bash
curl -X GET 'http://localhost:3000/analytics/projects/1' \
  -H 'x-tenant-id: tenant1'
```

---

## Frontend Components (React)

The following are example React components that can be used with the analytics API. These components are designed to work with the backend API endpoints.

### Installation

First, install the required dependencies:

```bash
npm install recharts lucide-react
```

### Component Files

Create the following component files in your React/Next.js project:

#### 1. `components/analytics/TenderAnalyticsDashboard.jsx`

See the full component code in the task specification above. This component provides:

- **KPI Cards**: Display key metrics (total tenders, packages, awards, awarded value)
- **Status Distributions**: Pie and bar charts showing tenders and responses by status
- **Pricing Analysis**: Charts showing packages by pricing mode
- **Monthly Trends**: Line chart tracking tender activity over time
- **Top Suppliers**: Ranked list of suppliers by awards and value
- **Price Analysis by Trade**: Bar chart of average prices per trade
- **Response Rates**: Visual representation of supplier response rates
- **Pricing Mode Effectiveness**: Table showing submission rates by pricing mode
- **Key Insights**: Summary cards with important metrics

**Features:**
- Time range selector (1 month, 3 months, 6 months, 1 year, all time)
- Refresh button to reload data
- Export functionality to CSV
- Responsive design
- Real-time data updates

**Usage:**
```jsx
import TenderAnalyticsDashboard from '@/components/analytics/TenderAnalyticsDashboard';

function AnalyticsPage() {
  return (
    <div className="container mx-auto p-6">
      <TenderAnalyticsDashboard />
    </div>
  );
}
```

#### 2. `components/analytics/SupplierAnalytics.jsx`

See the full component code in the task specification above. This component provides:

- **Supplier Header**: Display supplier name, contact info, and rating
- **Performance KPIs**: Total awards, total value, win rate, average score
- **Performance Radar Chart**: Visual representation of supplier performance across multiple metrics
- **Recent Awards**: List of recent contract awards

**Usage:**
```jsx
import SupplierAnalytics from '@/components/analytics/SupplierAnalytics';

function SupplierDetailsPage({ supplierId }) {
  return (
    <div className="container mx-auto p-6">
      <SupplierAnalytics supplierId={supplierId} />
    </div>
  );
}
```

### UI Components Required

The example components use shadcn/ui components. Install them:

```bash
npx shadcn-ui@latest add card button select badge
```

Or create basic versions:

#### `components/ui/card.jsx`
```jsx
export function Card({ className, ...props }) {
  return (
    <div className={`rounded-lg border bg-white shadow-sm ${className}`} {...props} />
  );
}

export function CardHeader({ className, ...props }) {
  return (
    <div className={`flex flex-col space-y-1.5 p-6 ${className}`} {...props} />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h3 className={`text-2xl font-semibold leading-none tracking-tight ${className}`} {...props} />
  );
}

export function CardContent({ className, ...props }) {
  return (
    <div className={`p-6 pt-0 ${className}`} {...props} />
  );
}
```

#### `components/ui/button.jsx`
```jsx
export function Button({ className, variant = 'default', size = 'default', ...props }) {
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';

  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-gray-300 bg-white hover:bg-gray-100',
  };

  const sizes = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 px-3 text-sm',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
```

#### `components/ui/select.jsx`
```jsx
export function Select({ children, value, onValueChange }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      >
        {children}
      </select>
    </div>
  );
}

export function SelectTrigger({ className, children }) {
  return <div className={className}>{children}</div>;
}

export function SelectContent({ children }) {
  return <>{children}</>;
}

export function SelectItem({ value, children }) {
  return <option value={value}>{children}</option>;
}

export function SelectValue() {
  return null;
}
```

#### `components/ui/badge.jsx`
```jsx
export function Badge({ className, ...props }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
      {...props}
    />
  );
}
```

---

## Integration Examples

### React Router Integration

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TenderAnalyticsDashboard from './components/analytics/TenderAnalyticsDashboard';
import SupplierAnalytics from './components/analytics/SupplierAnalytics';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/analytics" element={<TenderAnalyticsDashboard />} />
        <Route path="/suppliers/:supplierId/analytics" element={<SupplierAnalyticsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function SupplierAnalyticsPage() {
  const { supplierId } = useParams();
  return <SupplierAnalytics supplierId={parseInt(supplierId)} />;
}
```

### Next.js App Router Integration

```jsx
// app/analytics/page.jsx
import TenderAnalyticsDashboard from '@/components/analytics/TenderAnalyticsDashboard';

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Analytics Dashboard</h1>
      <TenderAnalyticsDashboard />
    </div>
  );
}

// app/suppliers/[supplierId]/analytics/page.jsx
import SupplierAnalytics from '@/components/analytics/SupplierAnalytics';

export default function SupplierAnalyticsPage({ params }) {
  return (
    <div className="container mx-auto p-6">
      <SupplierAnalytics supplierId={parseInt(params.supplierId)} />
    </div>
  );
}
```

---

## API Configuration

Create an API configuration file to manage base URLs and authentication:

```jsx
// lib/api.js
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID || 'tenant1';

export async function fetchAnalytics(timeRange = '6months', projectId = null) {
  const params = new URLSearchParams({ timeRange });
  if (projectId) params.append('projectId', projectId);

  const response = await fetch(`${API_BASE_URL}/analytics/tenders?${params}`, {
    headers: {
      'x-tenant-id': TENANT_ID,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch analytics');
  }

  return response.json();
}

export async function fetchSupplierAnalytics(supplierId) {
  const response = await fetch(`${API_BASE_URL}/analytics/suppliers/${supplierId}`, {
    headers: {
      'x-tenant-id': TENANT_ID,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch supplier analytics');
  }

  return response.json();
}

export async function fetchProjectAnalytics(projectId) {
  const response = await fetch(`${API_BASE_URL}/analytics/projects/${projectId}`, {
    headers: {
      'x-tenant-id': TENANT_ID,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch project analytics');
  }

  return response.json();
}
```

---

## Environment Variables

Create a `.env.local` file in your frontend project:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_TENANT_ID=tenant1
```

---

## Testing the API

### Using cURL

```bash
# Get tender analytics
curl -X GET 'http://localhost:3000/analytics/tenders?timeRange=6months' \
  -H 'x-tenant-id: tenant1'

# Get supplier analytics
curl -X GET 'http://localhost:3000/analytics/suppliers/123' \
  -H 'x-tenant-id: tenant1'

# Get project analytics
curl -X GET 'http://localhost:3000/analytics/projects/1' \
  -H 'x-tenant-id: tenant1'
```

### Using Postman

1. Create a new request
2. Set method to GET
3. Set URL to `http://localhost:3000/analytics/tenders`
4. Add query parameter: `timeRange` = `6months`
5. Add header: `x-tenant-id` = `tenant1`
6. Send request

---

## Features Checklist

✅ Comprehensive tender metrics
✅ Visual charts and graphs
✅ Supplier performance tracking
✅ Price trend analysis
✅ Response rate monitoring
✅ Export capabilities (CSV)
✅ Time-based filtering
✅ Project-specific filtering
✅ Monthly trend analysis
✅ Pricing mode effectiveness tracking
✅ Top supplier rankings
✅ Performance radar charts
✅ Responsive design
✅ Real-time data updates

---

## Troubleshooting

### Common Issues

**1. CORS Errors**

If you encounter CORS errors, ensure the backend has CORS enabled:

```javascript
// In index.cjs
const cors = require('cors');
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
```

**2. Authentication Errors**

Ensure you're sending the correct tenant ID in headers:

```javascript
headers: {
  'x-tenant-id': 'your-tenant-id',
}
```

**3. Missing Data**

If charts show no data, check:
- Database has sample data
- Time range is appropriate
- Tenant ID is correct
- API endpoint is accessible

---

## Database Requirements

The analytics endpoints require the following Prisma models:

- `Tender`
- `Package`
- `PackageResponse`
- `TenderAward`
- `Supplier`
- `Project`

Ensure your Prisma schema includes these models with the appropriate relationships.

---

## Performance Considerations

1. **Pagination**: For large datasets, consider implementing pagination
2. **Caching**: Use Redis or similar to cache frequently accessed analytics
3. **Indexing**: Ensure database indexes on `tenantId`, `createdAt`, `status` fields
4. **Query Optimization**: Use database views for complex aggregations
5. **Lazy Loading**: Load charts progressively to improve initial page load

---

## Future Enhancements

- [ ] Real-time updates using WebSockets
- [ ] PDF report generation
- [ ] Email report scheduling
- [ ] Custom date range selector
- [ ] Comparison mode (compare periods)
- [ ] Drill-down capabilities
- [ ] Interactive chart filtering
- [ ] Dashboard customization
- [ ] Saved report templates
- [ ] Advanced filtering options

---

## Support

For issues or questions:
- Check the API endpoint responses for error details
- Verify database schema matches requirements
- Ensure all dependencies are installed
- Check browser console for frontend errors

---

## License

This documentation and associated code are provided as part of the construction ERP analytics system.
