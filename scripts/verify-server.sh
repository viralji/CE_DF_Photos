#!/usr/bin/env bash
# Quick server health check. Usage: ./scripts/verify-server.sh https://your-domain.com
# Or: ./scripts/verify-server.sh http://your-droplet-ip:3001
set -e
BASE="${1:?Usage: $0 <base-url>}"
echo "Checking $BASE ..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
if [ "$CODE" = "200" ] || [ "$CODE" = "307" ]; then
  echo "✓ GET / → $CODE"
else
  echo "✗ GET / → $CODE (expected 200 or 307)"
  exit 1
fi
# Without cookie, protected API should 401
CODE_API=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/routes")
if [ "$CODE_API" = "401" ]; then
  echo "✓ GET /api/routes (no cookie) → 401"
else
  echo "○ GET /api/routes → $CODE_API (401 expected when not signed in)"
fi
echo "Server is responding. Sign in in the browser and check Dashboard, Capture, Gallery, Review, Map."
