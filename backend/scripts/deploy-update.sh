#!/usr/bin/env bash
set -euo pipefail

SRC=/opt/gnatsupreme/src
DEPLOY=/opt/gnatsupreme/backend
ENV_FILE=/etc/gnatsupreme/backend.env
SERVICE=gnatsupreme-backend

echo "==> Pulling latest source"
git -C "$SRC" pull

echo "==> Syncing backend/ into $DEPLOY"
rsync -a --delete --exclude node_modules --exclude dist "$SRC/backend/" "$DEPLOY/"

cd "$DEPLOY"

echo "==> Installing dependencies"
npm ci

echo "==> Building"
npm run build

echo "==> Running migrations"
set -a
source "$ENV_FILE"
set +a
npm run migrate:deploy

echo "==> Restarting $SERVICE"
sudo systemctl restart "$SERVICE"

echo "==> Health check"
sleep 2
curl --fail "$FRONTEND_ORIGIN/api/health"

echo "==> Backend deploy complete"
