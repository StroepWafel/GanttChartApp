#!/usr/bin/env bash
# Backup-first update script. Run from repo root.
# Automatic restarts only work when deployed with PM2.
# Logs to data/backups/update.log

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOG_FILE="${ROOT}/data/backups/update.log"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

log "=== update.sh started ==="
log "ROOT=$ROOT"

echo "=== Creating backup ==="
log "Creating backup"
mkdir -p data/backups
BACKUP_FILE="data/backups/gantt-backup-pre-update-$(date -u +%Y%m%d-%H%M%S).json"
# Backup is created by the API before this script runs; this is a fallback DB copy
if [ -f "backend/data/gantt.db" ]; then
  cp "backend/data/gantt.db" "data/backups/gantt.db.bak-$(date -u +%Y%m%d-%H%M%S)" 2>/dev/null || true
fi

echo "=== Fetching updates ==="
log "Fetching from git"
git fetch origin
LATEST_TAG=$(git tag -l 'v*' | sort -V | tail -1)
log "LATEST_TAG=$LATEST_TAG"
if [ -n "$LATEST_TAG" ]; then
  log "Checking out $LATEST_TAG"
  git checkout "$LATEST_TAG" 2>/dev/null || git pull origin main
else
  log "Pulling main"
  git pull origin main
fi
log "Version in package.json after checkout: $(node -p "require('./package.json').version" 2>/dev/null || echo '?')"

echo "=== Installing dependencies ==="
log "Running npm run install:all"
npm run install:all

echo "=== Building ==="
log "Running npm run build"
npm run build

echo "=== Restarting (PM2 only) ==="
if command -v pm2 &>/dev/null; then
  pm2 restart gantt-api 2>/dev/null || true
  echo "PM2 restart requested."
  log "PM2 restart requested"
else
  echo "PM2 not found. Restart the app manually."
  log "PM2 not found - restart manually"
fi

log "=== Update complete ==="
echo "=== Update complete ==="
