# cURL examples: Storage analytics & Grading trend

Base URL: `http://localhost:<PORT>/api/v1/analytics` (replace `<PORT>` with your server port, e.g. `3000`).

All endpoints require authentication. Use your session cookie or Bearer token in the examples below.

---

## Storage analytics (`storage.routes.ts`)

### 1. Storage summary (per-variety with size and bag-type breakdown)

```bash
# No date filter
curl -s -X GET "http://localhost:3000/api/v1/analytics/storage-summary" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# With optional date range (YYYY-MM-DD)
curl -s -X GET "http://localhost:3000/api/v1/analytics/storage-summary?dateFrom=2024-01-01&dateTo=2024-12-31" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 2. Storage gate pass report

```bash
# Plain list (no grouping)
curl -s -X GET "http://localhost:3000/api/v1/analytics/storage-gate-pass-report" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# With date range and variety filter
curl -s -X GET "http://localhost:3000/api/v1/analytics/storage-gate-pass-report?dateFrom=2024-01-01&dateTo=2024-12-31&variety=VarietyName" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Grouped by farmer
curl -s -X GET "http://localhost:3000/api/v1/analytics/storage-gate-pass-report?groupByFarmer=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Grouped by variety
curl -s -X GET "http://localhost:3000/api/v1/analytics/storage-gate-pass-report?groupByVariety=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Grouped by variety then by farmer
curl -s -X GET "http://localhost:3000/api/v1/analytics/storage-gate-pass-report?groupByVariety=true&groupByFarmer=true&dateFrom=2024-01-01&dateTo=2024-12-31" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 3. Storage daily & monthly trend (by variety)

```bash
# No date filter
curl -s -X GET "http://localhost:3000/api/v1/analytics/storage-daily-monthly-trend" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# With date range
curl -s -X GET "http://localhost:3000/api/v1/analytics/storage-daily-monthly-trend?dateFrom=2024-01-01&dateTo=2024-12-31" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Grading trend (`grading.routes.ts`)

### 4. Grading daily & monthly trend (by grader)

```bash
# No date filter
curl -s -X GET "http://localhost:3000/api/v1/analytics/grading-daily-monthly-trend" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# With date range
curl -s -X GET "http://localhost:3000/api/v1/analytics/grading-daily-monthly-trend?dateFrom=2024-01-01&dateTo=2024-12-31" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Using a session cookie instead of Bearer token

If your app uses cookie-based auth (e.g. Better Auth session cookie), replace the header with:

```bash
-H "Cookie: better-auth.session_token=YOUR_SESSION_COOKIE_VALUE"
```

Example:

```bash
curl -s -X GET "http://localhost:3000/api/v1/analytics/storage-summary" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_COOKIE_VALUE"
```
