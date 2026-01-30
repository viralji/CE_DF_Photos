#!/usr/bin/env bash
# Run this ON the server (e.g. after SSH). Deploys and runs health + API tests.
# Usage: cd /path/to/CE_DF_Photos && ./scripts/deploy-and-verify-on-server.sh
set -e
APP_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"
echo "=== Deploy in $APP_DIR ==="
git pull
npm ci
npm run build
echo "=== Restart PM2 ==="
if pm2 describe ce-df-photos &>/dev/null; then
  pm2 restart ce-df-photos
else
  pm2 start ecosystem.config.js
fi
pm2 save
echo "=== Wait for app ==="
sleep 5
echo "=== Health check (localhost:3001) ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/ || true)
if [ "$CODE" = "200" ] || [ "$CODE" = "307" ]; then
  echo "✓ GET / → $CODE"
else
  echo "✗ GET / → $CODE (check: pm2 logs ce-df-photos)"
  exit 1
fi
echo "=== API test (dev-bypass cookie) ==="
if node scripts/test-api-full.mjs http://127.0.0.1:3001; then
  echo "✓ All API tests passed"
else
  echo "○ Some API tests failed (expected if dev-bypass is not enabled on server)"
fi
echo "=== Done. Check: pm2 status && pm2 logs ce-df-photos ==="
