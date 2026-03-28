#!/usr/bin/env bash
# Rollback the last deploy on the production server.
# Run from repo root on your LOCAL machine.
# Usage:
#   ./scripts/rollback.sh           — rolls back to the previous commit (HEAD~1)
#   ./scripts/rollback.sh <sha>     — rolls back to a specific commit SHA
set -e

SERVER="root@64.227.174.91"
SSH_KEY="$HOME/.ssh/do_64.227.174.91"
APP_PATH="/var/www/CE_DF_Photos"
APP_PORT="13001"
TARGET="${1:-HEAD~1}"

if [ ! -f "$SSH_KEY" ]; then
  echo "✗ SSH key not found: $SSH_KEY"
  exit 1
fi

echo "=== Rolling back to: $TARGET on $SERVER ==="
echo "    This will rebuild and restart the app."
read -p "    Continue? (y/N) " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

ssh -i "$SSH_KEY" "$SERVER" bash <<EOF
set -e
cd $APP_PATH

echo "--- Current commit: \$(git rev-parse --short HEAD)"
echo "--- Rolling back to: $TARGET"
git reset --hard $TARGET

echo "--- Installing dependencies ---"
npm ci

echo "--- Building ---"
npm run build || { echo "Build failed after rollback"; exit 1; }

echo "--- DB setup (idempotent) ---"
npm run db:setup

echo "--- Restarting PM2 ---"
pm2 restart ce-df-photos
pm2 save

echo "--- Health check ---"
sleep 5
CODE=\$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${APP_PORT}/" || true)
if [ "\$CODE" = "200" ] || [ "\$CODE" = "307" ]; then
  echo "✓ App healthy after rollback (\$CODE)"
else
  echo "✗ Health check failed (\$CODE) — check: pm2 logs ce-df-photos"
  exit 1
fi

echo "--- Rolled back to: \$(git rev-parse --short HEAD) ---"

echo ""
echo "=== DB BACKUPS (most recent first) ==="
ls -lt $APP_PATH/data/backups/ | head -8
echo ""
echo "To also restore a DB backup:"
echo "  cp $APP_PATH/data/backups/<chosen>.db $APP_PATH/data/ce_df_photos.db && pm2 restart ce-df-photos"
EOF

echo "=== Rollback complete ==="
