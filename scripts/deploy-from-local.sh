#!/usr/bin/env bash
# Run from your LOCAL machine. Pushes code then SSHs to Digital Ocean and runs deploy script.
# Usage:
#   First time: set SERVER and optionally APP_PATH, then run:
#     SERVER=root@your-droplet-ip ./scripts/deploy-from-local.sh
#   Or with app path: SERVER=root@123.45.67.89 APP_PATH=/var/www/CE_DF_Photos ./scripts/deploy-from-local.sh
# Prerequisites: code committed and pushed (so server can git pull). SSH key access to SERVER.
set -e
SERVER="${SERVER:?Set SERVER=e.g. root@your-droplet-ip}"
APP_PATH="${APP_PATH:-CE_DF_Photos}"
APP_PORT="${APP_PORT:-13001}"

echo "=== Pushing from local (ensure server can pull) ==="
git push

echo "=== Deploying on server $SERVER (path: $APP_PATH, health check port: $APP_PORT) ==="
ssh "$SERVER" "cd $APP_PATH && APP_PORT=$APP_PORT ./scripts/deploy-and-verify-on-server.sh"

echo "=== Deploy finished. Check your app URL. ==="
