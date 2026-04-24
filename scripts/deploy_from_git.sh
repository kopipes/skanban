#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/board}"
BRANCH="${BRANCH:-master}"
SERVICE_NAME="${SERVICE_NAME:-board.service}"

cd "$APP_DIR"

mkdir -p backups
if [[ -f skanban.db ]]; then
  ts="$(date +%Y%m%d_%H%M%S)"
  cp -p skanban.db "backups/skanban_${ts}.db"
fi

if [[ ! -d .git ]]; then
  git init -b "$BRANCH"
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin https://github.com/kopipes/skanban.git
else
  git remote add origin https://github.com/kopipes/skanban.git
fi

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

sudo systemctl restart "$SERVICE_NAME"
sudo systemctl is-active "$SERVICE_NAME"

echo "Deployed branch: $BRANCH"
git rev-parse --short HEAD
