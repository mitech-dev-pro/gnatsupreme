#!/usr/bin/env bash
set -euo pipefail

SRC=/opt/gnatsupreme/src
DEPLOY_TARGET=/var/www/gnatsupreme-portal

echo "==> Pulling latest source"
git -C "$SRC" pull

cd "$SRC/frontend"

echo "==> Installing dependencies"
npm ci

echo "==> Building"
npm run build

echo "==> Publishing static build"
rsync -a --delete dist/ "$DEPLOY_TARGET/"

echo "==> Frontend deploy complete"
