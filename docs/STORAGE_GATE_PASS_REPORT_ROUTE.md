# Storage Gate Pass Report Route Documentation

## Overview
The `/report` route is a **GET** endpoint that retrieves all storage gate pass records for an authenticated store admin's cold storage without pagination. This endpoint returns comprehensive report data with optional date range filtering.

---

## Route Definition

### URL Path
```
GET /report
```

### HTTP Method
`GET`

### Authentication
**Required** - Uses JWT bearer token authentication via the `authenticate` middleware

### Rate Limiting
- **Limit**: 60 requests
- **Window**: 1 minute

---

## Query Parameters

All query parameters are **optional** and used for date range filtering.

| Parameter | Type | Format | Description | Example |
|-----------|------|--------|-------------|---------|
| `dateFrom` | string | ISO date | Filter by date range start (inclusive). Must be in ISO date format YYYY-MM-DD. Start time is set to 00:00:00 UTC. | `2026-03-01` |
| `dateTo` | string | ISO date | Filter by date range end (inclusive). Must be in ISO date format YYYY-MM-DD. End time is set to 23:59:59 UTC. | `2026-03-07` |

### Date Range Behavior
- Both parameters are **optional**
- If `dateFrom` is provided without `dateTo`, all records from that date onwards are returned
- If `dateTo` is provided without `dateFrom`, all records up to that date are returned
- If both are provided, records within the inclusive date range are returned
- If neither is provided, all records for the cold storage are returned
- Date validation is strict - must follow ISO date format (YYYY-MM-DD)

### Query Examples
```
/report
/report?dateFrom=2026-03-01
/report?dateTo=2026-03-07
/report?dateFrom=2026-03-01&dateTo=2026-03-07
```

---

## Request Headers

```
Authorization: Bearer <jwt-token>
```

The JWT token must contain a valid `coldStorageId` in the user claims.

---

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "storageGatePasses": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "gatePassNo": 101,
        "manualGatePassNumber": 1001,
        "date": "2026-03-15T00:00:00.000Z",
        "variety": "Rice",
        "storageCategory": "Premium",
        "stage": "Completed",
        "remarks": "Quality check passed",
        "bagSizes": [
          {
            "size": "50kg",
            "bagType": "JUTE",
            "currentQuantity": 95,
            "initialQuantity": 100,
            "chamber": "C1",
            "floor": "F2",
            "row": "R3"
          },
          {
            "size": "25kg",
            "bagType": "POLYPROPYLENE",
            "currentQuantity": 48,
            "initialQuantity": 50,
            "chamber": "C1",
            "floor": "F2",
            "row": "R3"
          }
        ],
        "totalBags": 150,
        "farmerStorageLinkId": {
          "_id": "507f1f77bcf86cd799439012",
          "accountNumber": 12345,
          "farmerId": {
            "_id": "507f1f77bcf86cd799439013",
            "accountNumber": 12345,
            "name": "John Farmer",
            "address": "123 Farm Lane, Village, State 12345"
          }
        },
        "createdBy": {
          "_id": "507f1f77bcf86cd799439014",
          "name": "Admin User"
        }
      }
    ]
  }
}
```

### Response Data Structure

#### Root Response Object
| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` for successful responses |
| `data` | object | Contains the report data |

#### Data Object
| Field | Type | Description |
|-------|------|-------------|
| `storageGatePasses` | array | Array of storage gate pass report rows |

#### StorageGatePass Report Row Object
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | string | Yes | Unique identifier for the storage gate pass record |
| `gatePassNo` | number | Yes | System-generated gate pass number (auto-incremented) |
| `manualGatePassNumber` | number | No | Optional manual gate pass number for reference |
| `date` | string (ISO 8601) | Yes | Date and time of the gate pass in ISO format |
| `variety` | string | Yes | Type of produce variety (e.g., "Rice", "Wheat") |
| `storageCategory` | string | Yes | Storage category classification |
| `stage` | string | No | Processing stage (e.g., "Completed", "In Progress") |
| `remarks` | string | No | Additional notes or remarks |
| `bagSizes` | array | Yes | Array of bag size records (see below) |
| `totalBags` | number | Yes | Total number of bags (sum of all initialQuantity) |
| `farmerStorageLinkId` | object | Yes | Reference to the farmer-storage link (see below) |
| `createdBy` | object | No | Information about the user who created this record |

#### BagSize Object (within bagSizes array)
| Field | Type | Description |
|-------|------|-------------|
| `size` | string | Bag size (e.g., "50kg", "25kg") |
| `bagType` | string | Type of bag material (e.g., "JUTE", "POLYPROPYLENE") |
| `initialQuantity` | number | Original number of bags of this size |
| `currentQuantity` | number | Current number of bags (may differ due to usage/damage) |
| `chamber` | string | Storage chamber identifier |
| `floor` | string | Floor level within the chamber |
| `row` | string | Row position on the floor |

#### FarmerStorageLink Reference Object
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | string | Yes | Farmer storage link ID |
| `accountNumber` | number | No | Associated account number |
| `farmerId` | object | No | Farmer details (populated if available) |

#### FarmerId Object (nested within farmerStorageLinkId)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | string | Yes | Farmer ID |
| `accountNumber` | number | No | Farmer's account number |
| `name` | string | Yes | Farmer's name |
| `address` | string | Yes | Farmer's address |

#### CreatedBy Object
| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | User ID who created the record |
| `name` | string | User's display name |

---

## Error Responses

### 401 Unauthorized

**Scenario**: Missing or invalid authentication token, or cold storage not found in token

```json
{
  "success": false,
  "error": {
    "code": "MISSING_COLD_STORAGE",
    "message": "Cold storage not found in token"
  }
}
```

**Possible Error Codes**:
- `MISSING_COLD_STORAGE` - Cold storage ID not in JWT token
- `UNAUTHORIZED` - Invalid or expired token

---

### 400 Bad Request

**Scenario 1**: Invalid date format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_DATE_FROM",
    "message": "Invalid dateFrom format. Use ISO date, e.g. 2026-03-01"
  }
}
```

**Scenario 2**: Invalid cold storage ID format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_COLD_STORAGE_ID",
    "message": "Invalid cold storage ID format"
  }
}
```

**Possible Error Codes**:
- `INVALID_DATE_FROM` - dateFrom parameter is not a valid ISO date
- `INVALID_DATE_TO` - dateTo parameter is not a valid ISO date
- `INVALID_COLD_STORAGE_ID` - Cold storage ID is not a valid MongoDB ObjectId

---

### 500 Internal Server Error

```json
{
  "success": false,
  "error": {
    "code": "GET_STORAGE_GATE_PASS_REPORT_ERROR",
    "message": "Failed to retrieve storage gate pass report"
  }
}
```

---

## Implementation Details

### Backend Processing Flow

#### 1. Route Handler (`getStorageGatePassReportHandler`)
- Extracts `coldStorageId` from authenticated JWT token
- Parses `dateFrom` and `dateTo` query parameters
- Calls service function with parameters
- Returns formatted response

#### 2. Service Logic (`getStorageGatePassReport`)

**Step 1: Validation**
- Validates cold storage ID is a valid MongoDB ObjectId
- Validates date formats if provided (must be ISO date: YYYY-MM-DD)

**Step 2: Data Retrieval**
- Queries all `FarmerStorageLink` records belonging to the cold storage
- Extracts their IDs to filter storage gate passes
- Builds MongoDB query filter:
  ```javascript
  {
    farmerStorageLinkId: { $in: [link IDs] },
    date: { $gte: dateFrom, $lte: dateTo } // if date range provided
  }
  ```

**Step 3: Database Query**
- Executes MongoDB `find()` query with:
  - **Population**: 
    - `farmerStorageLinkId` - populated with accountNumber and nested farmerId (name, address)
    - `createdBy` - populated with name field
  - **Sorting**: By gate pass number descending (`gatePassNo: -1`), then by date descending
  - **Lean Query**: Returns plain JavaScript objects (no Mongoose document overhead)

**Step 4: Data Transformation**
- Maps each database record to report format using `mapStorageGatePassToReport()`
- Converts MongoDB ObjectIds to strings
- Calculates `totalBags` as sum of all initial quantities
- Includes optional fields only if they exist:
  - `manualGatePassNumber`
  - `stage`
  - `remarks`
  - `createdBy`
  - `farmerId` (within farmerStorageLinkId)

**Step 5: Response**
- Returns array of transformed report records
- No pagination applied

#### 3. Date Range Handling

**dateFrom Processing**:
```javascript
const from = new Date(options.dateFrom);
from.setUTCHours(0, 0, 0, 0); // Set to start of day
dateConditions.$gte = from;
```

**dateTo Processing**:
```javascript
const to = new Date(options.dateTo);
to.setUTCHours(23, 59, 59, 999); // Set to end of day
dateConditions.$lte = to;
```

---

## Data Access Control

### Cold Storage Isolation
- The endpoint automatically filters records to only the authenticated user's cold storage
- Achieved by:
  1. Extracting `coldStorageId` from JWT token
  2. Finding all `FarmerStorageLink` records for that cold storage
  3. Filtering `StorageGatePass` records by these farmer-storage links

### Multi-Tenancy
- Each store admin only sees data for their cold storage
- Impossible to query data across cold storages

---

## Sorting Behavior

Results are sorted by:
1. **Primary**: Gate pass number (descending - newest first)
2. **Secondary**: Date (descending - newest first)

MongoDB sort: `{ gatePassNo: -1, date: -1 }`

---

## Pagination Behavior

**No pagination applied** - All matching records are returned in a single response.

### Considerations for Implementation
- For cold storages with large numbers of gate passes (>10,000), this may impact performance
- Consider client-side pagination or implementing server-side pagination if needed
- Alternative: Use the main GET `/` endpoint which supports pagination

---

## Schema Validation

### Query String Schema
```typescript
{
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be an ISO date, e.g. 2026-03-01')
    .optional(),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be an ISO date, e.g. 2026-03-07')
    .optional()
}
```

---

## Usage Examples

### Example 1: Get all storage gate passes for a cold storage

```bash
curl -X GET "https://api.example.com/storage-gate-pass/report" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Example 2: Get storage gate passes within a date range

```bash
curl -X GET "https://api.example.com/storage-gate-pass/report?dateFrom=2026-03-01&dateTo=2026-03-07" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Example 3: Get storage gate passes from a specific date onwards

```bash
curl -X GET "https://api.example.com/storage-gate-pass/report?dateFrom=2026-03-15" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Example 4: JavaScript/TypeScript Fetch

```typescript
const response = await fetch('/api/storage-gate-pass/report?dateFrom=2026-03-01&dateTo=2026-03-07', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
// data.data.storageGatePasses contains the report array
```

---

## Performance Considerations

### Database Query Efficiency
- Uses MongoDB `distinct()` to get farmer-storage link IDs (indexed query)
- Uses `lean()` for performance optimization (no Mongoose document instantiation)
- Indexes should be present on:
  - `StorageGatePass.farmerStorageLinkId`
  - `StorageGatePass.date`
  - `FarmerStorageLink.coldStorageId`

### Recommendations
- For large datasets (>10,000 records), consider adding pagination
- Cache report data if refresh frequency can tolerate staleness
- Consider date range filtering to reduce result size
- Implement connection pooling for MongoDB queries

---

## Logging

Each report request is logged with:
```typescript
{
  coldStorageId: string,
  count: number,        // Number of records returned
  dateFrom?: string,
  dateTo?: string
}
```

Errors are logged with full error context:
```typescript
{
  error: Error object,
  coldStorageId: string
}
```

---

## Related Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Paginated storage gate passes with sorting and filtering |
| `/edits` | GET | Audit trail of edits with pagination |
| `/farmer-storage-link/:id` | GET | Gate passes for specific farmer-storage link |
| `/search` | POST | Search by gate pass number |
| `/` | POST | Create new storage gate pass |

---

## Key Implementation Points for Similar Routes

When implementing a similar report route in another project:

1. **Authentication First**: Extract user context (tenant/organization ID) from JWT
2. **Tenant Isolation**: Build filter query based on user's tenant/organization context
3. **Optional Date Range**: Use inclusive date ranges with UTC time boundaries
4. **No Pagination**: Return all filtered records for reporting use cases
5. **Population/Joins**: Include related entity data (creator, references) for complete reporting
6. **Data Transformation**: Map database records to report format (exclude sensitive fields if needed)
7. **Error Handling**: Validate formats early and throw specific error codes
8. **Sorting**: Sort by primary identifier descending (newest first) then by timestamp
9. **Lean Queries**: Use lean() for report endpoints to improve performance
10. **Logging**: Log request parameters and result count for auditing

---

## Version History

- **v1.0** - Initial implementation with date range filtering and optional pagination disabled

