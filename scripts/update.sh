#!/usr/bin/env bash
# Backup-first update script. Run from repo root.
# Automatic restarts only work when deployed with PM2.

set -e
cd "$(dirname "$0")/.."

echo "=== Creating backup ==="
mkdir -p data/backups
BACKUP_FILE="data/backups/gantt-backup-pre-update-$(date -u +%Y%m%d-%H%M%S).json"
# Backup is created by the API before this script runs; this is a fallback DB copy
if [ -f "backend/data/gantt.db" ]; then
  cp "backend/data/gantt.db" "data/backups/gantt.db.bak-$(date -u +%Y%m%d-%H%M%S)" 2>/dev/null || true
fi

echo "=== Fetching updates ==="
git fetch origin
LATEST_TAG=$(git tag -l 'v*' | sort -V | tail -1)
if [ -n "$LATEST_TAG" ]; then
  git checkout "$LATEST_TAG" 2>/dev/null || git pull origin main
else
  git pull origin main
fi

echo "=== Installing dependencies ==="
npm run install:all

echo "=== Building ==="
npm run build

echo "=== Restarting (PM2 only) ==="
if command -v pm2 &>/dev/null; then
  pm2 restart gantt-api 2>/dev/null || true
  echo "PM2 restart requested."
else
  echo "PM2 not found. Restart the app manually."
fi

echo "=== Update complete ==="
