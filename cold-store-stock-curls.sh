#!/usr/bin/env bash
# Cold store stock curls.
# Auth: Authorization Bearer token from POST /api/v1/store-admin/login
#   { "mobileNumber": "9876543210", "password": "your-password" }
# The response field is "token". Cold storage comes from that token.

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
TOKEN="${TOKEN:-paste-jwt-here}"
STOCK_ID="${STOCK_ID:-paste-stock-id-here}"

# Create one stock row for a variety and size.
# 409 if this cold store already has that variety and size.
curl -sS -X POST "$BASE_URL/api/v1/cold-store-stock" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "variety": "Jyoti",
    "stockFilter": "seed",
    "size": {
      "name": "50kg",
      "currentQuantity": 120,
      "initialQuantity": 120
    }
  }'

echo

# List stock for the authenticated cold storage.
curl -sS -X GET "$BASE_URL/api/v1/cold-store-stock" \
  -H "Authorization: Bearer $TOKEN"

echo

# List stock filtered by variety.
curl -sS -G "$BASE_URL/api/v1/cold-store-stock" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "variety=Jyoti"

echo

# List stock filtered by stockFilter.
curl -sS -G "$BASE_URL/api/v1/cold-store-stock" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "stockFilter=seed"

echo

# Get one stock row by id.
curl -sS -X GET "$BASE_URL/api/v1/cold-store-stock/$STOCK_ID" \
  -H "Authorization: Bearer $TOKEN"

echo

# Update current quantity, initial quantity, variety, size name, or stock filter.
# Send only the fields you want to change. Still one row per variety and size.
curl -sS -X PUT "$BASE_URL/api/v1/cold-store-stock/$STOCK_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "variety": "Jyoti",
    "stockFilter": "seed",
    "size": {
      "name": "50kg",
      "currentQuantity": 80,
      "initialQuantity": 120
    }
  }'

echo

# Delete one stock row.
curl -sS -X DELETE "$BASE_URL/api/v1/cold-store-stock/$STOCK_ID" \
  -H "Authorization: Bearer $TOKEN"

echo
