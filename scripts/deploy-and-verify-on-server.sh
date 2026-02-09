#!/usr/bin/env bash
# Run this ON the server (e.g. after SSH). Deploys code, ensures DB + seed, restarts app, health check.
# Usage: cd /path/to/CE_DF_Photos && ./scripts/deploy-and-verify-on-server.sh
# If app listens on 3001 (not 13001): APP_PORT=3001 ./scripts/deploy-and-verify-on-server.sh
# See README.md "Deployment" section for full docs.
set -e
APP_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"
APP_PORT="${APP_PORT:-13001}"
echo "=== Deploy in $APP_DIR (health check port: $APP_PORT) ==="
[ -f package.json ] || { echo "Missing package.json"; exit 1; }
[ -d .git ] || { echo "Not a git repo"; exit 1; }
git pull
npm ci
npm run build || { echo "Build failed"; exit 1; }
echo "=== DB setup and seed (idempotent) ==="
# db:setup: schema from create-schema.sql (if new DB) + in-code migrations (lib/db.ts): app_settings, routes.length, subsections.length, photo_submission_comments, etc.
npm run db:setup
npm run db:seed-entities-checkpoints || echo "○ Seed failed (check checkpoints_data.json exists)"
echo "=== Restart PM2 ==="
if pm2 describe ce-df-photos &>/dev/null; then
  pm2 restart ce-df-photos
else
  pm2 start ecosystem.config.js --name ce-df-photos
fi
pm2 save
echo "=== Wait for app ==="
sleep 5
echo "=== Health check (localhost:$APP_PORT) ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${APP_PORT}/" || true)
if [ "$CODE" = "200" ] || [ "$CODE" = "307" ]; then
  echo "✓ GET / → $CODE"
else
  echo "✗ GET / → $CODE (check: pm2 logs ce-df-photos; ensure PORT=$APP_PORT in ecosystem/.env)"
  exit 1
fi
echo "=== Done. Check: pm2 status && pm2 logs ce-df-photos ==="
