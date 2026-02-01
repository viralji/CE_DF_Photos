#!/bin/bash
# Run against a running server: npm run start (or dev) then ./scripts/test-api.sh
# Or: npm run start & sleep 5 && ./scripts/test-api.sh
BASE="${1:-http://127.0.0.1:3001}"
COOKIE="dev-bypass-auth=true"
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local extra="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE" $extra "$url")
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    echo "✓ $name ($code)"
  else
    echo "✗ $name ($code)"
    FAIL=1
  fi
}

echo "Testing $BASE (cookie: $COOKIE)"
check "GET /" "$BASE/"
check "GET /api/routes" "$BASE/api/routes"
check "GET /api/checkpoints" "$BASE/api/checkpoints"
check "GET /api/entities" "$BASE/api/entities"
check "GET /api/photos" "$BASE/api/photos?routeId=1&subsectionId=1&limit=10"
check "GET /api/review/summary" "$BASE/api/review/summary"
check "GET /api/subsections" "$BASE/api/subsections?route_id=1"

# Unauthorized (no cookie) should get 401 for protected APIs
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/routes")
if [ "$code" = "401" ]; then
  echo "✓ GET /api/routes without cookie returns 401"
else
  echo "✗ GET /api/routes without cookie expected 401 got $code"
  FAIL=1
fi

# POST route (create a test route; use unique id to avoid 500 on duplicate)
ROUTE_ID="e2e-$(date +%s)"
body="{\"route_id\":\"$ROUTE_ID\",\"route_name\":\"Test Route E2E\"}"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$body" -b "$COOKIE" "$BASE/api/routes")
if [ "$code" = "200" ] || [ "$code" = "201" ]; then
  echo "✓ POST /api/routes ($code)"
else
  echo "✗ POST /api/routes ($code)"
  FAIL=1
fi

if [ $FAIL -eq 0 ]; then
  echo ""
  echo "All API tests passed."
  exit 0
else
  echo ""
  echo "Some tests failed."
  exit 1
fi
