#!/usr/bin/env bash
set -euo pipefail

SRC=/opt/gnatsupreme/src
DEPLOY=/opt/gnatsupreme/backend
ENV_FILE=/etc/gnatsupreme/backend.env

echo "==> Pulling latest source"
git -C "$SRC" pull

echo "==> Syncing backend/ into $DEPLOY"
rsync -a --delete --exclude node_modules --exclude dist --exclude .env "$SRC/backend/" "$DEPLOY/"

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

echo "==> Verifying performance configuration, cache, indexes, and query plans"
npm run verify:performance

echo "==> Restarting API and worker"
pm2 restart gnatsupreme-backend gnatsupreme-worker

echo "==> Health check"
sleep 2
curl --fail "$FRONTEND_ORIGIN/api/health"

echo "==> Backend deploy complete"
