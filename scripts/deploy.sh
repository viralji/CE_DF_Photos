#!/usr/bin/env bash
# Deploy CE DF Photos to production.
# Run from repo root on your LOCAL machine (not on the server).
# Usage: ./scripts/deploy.sh
# No args needed — server details are hardcoded below.
set -e

SERVER="root@64.227.174.91"
SSH_KEY="$HOME/.ssh/do_64.227.174.91"
APP_PATH="/var/www/CE_DF_Photos"
APP_PORT="13001"

# Verify SSH key exists
if [ ! -f "$SSH_KEY" ]; then
  echo "✗ SSH key not found: $SSH_KEY"
  echo "  Ask the team for the key or check ~/.ssh/"
  exit 1
fi

echo "=== Pushing to GitHub ==="
git push

echo "=== Deploying on $SERVER (path: $APP_PATH, port: $APP_PORT) ==="
ssh -i "$SSH_KEY" "$SERVER" "cd $APP_PATH && APP_PORT=$APP_PORT ./scripts/deploy-and-verify-on-server.sh"

echo "=== Deploy complete. Live at https://dfphotos.cloudextel.com ==="
