# Construction ERP Backend - Analytics Module

A lightweight Express backend server providing analytics and reporting capabilities for construction tender management.

## Features

- **Tender Analytics**: Comprehensive metrics including status distributions, package analysis, and trends
- **Supplier Analytics**: Performance tracking, win rates, and award history
- **Project Analytics**: Project-specific metrics and statistics
- **Time-Based Filtering**: Analyze data across different time periods
- **Export Capabilities**: CSV export support for analytics data

## Prerequisites

- Node.js 16+
- PostgreSQL database
- Prisma ORM setup

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
# Create .env file
DATABASE_URL="postgresql://user:password@localhost:5432/erp_db"
PORT=3000
NODE_ENV=development
```

3. Initialize Prisma (if not already done):
```bash
npx prisma generate
npx prisma db push
```

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check
```bash
GET /health
```

### Tenders Routes
```bash
POST /tenders/create
GET /tenders/list
```

### Packages Routes
```bash
# See routes/packages.cjs for available endpoints
```

### Contracts Routes
```bash
# See routes/contracts.cjs for available endpoints
```

### Analytics Routes

#### Get Tender Analytics
```bash
GET /analytics/tenders?timeRange=6months&projectId=1
```

Query Parameters:
- `timeRange`: `1month`, `3months`, `6months`, `1year`, `all` (default: `6months`)
- `projectId`: Optional project filter

#### Get Supplier Analytics
```bash
GET /analytics/suppliers/:supplierId
```

#### Get Project Analytics
```bash
GET /analytics/projects/:projectId
```

## Testing the Analytics API

### Using cURL

**Test Tender Analytics:**
```bash
curl -X GET 'http://localhost:3000/analytics/tenders?timeRange=6months' \
  -H 'x-tenant-id: tenant1'
```

**Test Supplier Analytics:**
```bash
curl -X GET 'http://localhost:3000/analytics/suppliers/1' \
  -H 'x-tenant-id: tenant1'
```

**Test Project Analytics:**
```bash
curl -X GET 'http://localhost:3000/analytics/projects/1' \
  -H 'x-tenant-id: tenant1'
```

### Expected Response Format

**Tender Analytics Response:**
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
  "tendersByStatus": [...],
  "packagesByPricingMode": [...],
  "responsesByStatus": [...],
  "topSuppliers": [...],
  "pricesByTrade": [...],
  "monthlyTrends": [...],
  "timeRange": "6months",
  "startDate": "2025-04-30T00:00:00.000Z",
  "endDate": "2025-10-30T00:00:00.000Z"
}
```

## Project Structure

```
.
├── index.cjs                 # Main server file
├── lib/
│   ├── safety.cjs           # Prisma client and utilities
│   └── sourcing.cjs         # Package sourcing logic
├── middleware/
│   ├── auth.cjs             # Authentication middleware
│   └── tenant.cjs           # Multi-tenancy support
├── routes/
│   ├── analytics.cjs        # Analytics endpoints
│   ├── tenders.cjs          # Tender management
│   ├── packages.cjs         # Package management
│   └── contracts.cjs        # Contract management
├── package.json
└── README.md
```

## Authentication

Currently using mock authentication for development. In production, replace with:
- JWT token verification
- Session-based authentication
- OAuth2/OIDC integration

The tenant ID is passed via header `x-tenant-id` for multi-tenancy support.

## Database Schema

The analytics module requires these Prisma models:
- `Tender`
- `Package`
- `PackageResponse`
- `TenderAward`
- `Supplier`
- `Project`

Ensure your schema includes appropriate relationships and indexes for optimal performance.

## Frontend Integration

See `ANALYTICS_DOCUMENTATION.md` for:
- Complete API documentation
- React component examples
- Integration guides
- UI component code

## Development Notes

### Adding New Analytics

To add new analytics endpoints:

1. Edit `routes/analytics.cjs`
2. Add new route handler
3. Implement analytics logic using Prisma
4. Return structured JSON response
5. Document in ANALYTICS_DOCUMENTATION.md

### Performance Optimization

- Use database indexes on frequently queried fields
- Implement caching for expensive queries
- Consider pagination for large datasets
- Use database views for complex aggregations

## Troubleshooting

**Port already in use:**
```bash
# Change PORT in .env or kill existing process
lsof -ti:3000 | xargs kill -9
```

**Prisma errors:**
```bash
# Regenerate Prisma client
npx prisma generate

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

**CORS issues:**
```bash
# CORS is enabled by default
# Configure allowed origins in index.cjs if needed
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/erp_db

# Server
PORT=3000
NODE_ENV=development

# Frontend (for CORS)
FRONTEND_URL=http://localhost:5173
```

## Scripts

```json
{
  "dev": "nodemon index.cjs",
  "start": "node index.cjs"
}
```

## Dependencies

- `express`: Web framework
- `cors`: CORS middleware
- `@prisma/client`: Database ORM

## License

MIT

## Support

For questions or issues, please check:
- API endpoint responses for error details
- Server logs for debugging information
- ANALYTICS_DOCUMENTATION.md for detailed API documentation
