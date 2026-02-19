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

# STOP PM2 FIRST - prevents race when spawned from in-app (process.exit triggers PM2 restart)
if command -v pm2 &>/dev/null; then
  echo "=== Stopping app (PM2) ==="
  log "Stopping gantt-api"
  pm2 stop gantt-api 2>/dev/null || true
fi

echo "=== Creating backup ==="
log "Creating backup"
mkdir -p data/backups

# Resolve DB path: .env DB_PATH, or fallback to data/gantt.db
DB_FILE=""
if [ -f ".env" ]; then
  DB_FILE=$(grep -E '^DB_PATH=' .env 2>/dev/null | cut -d= -f2- | sed 's/^["'\'' ]*//;s/["'\'' ]*$//')
fi
[ -z "$DB_FILE" ] && DB_FILE="data/gantt.db"
[[ "$DB_FILE" != /* ]] && DB_FILE="$ROOT/$DB_FILE"

if [ -f "$DB_FILE" ] && [ -s "$DB_FILE" ]; then
  cp "$DB_FILE" "data/backups/gantt.db.bak-$(date -u +%Y%m%d-%H%M%S)" 2>/dev/null && log "DB backup: $DB_FILE" || log "DB backup failed"
elif [ -f "data/gantt.db" ] && [ -s "data/gantt.db" ]; then
  cp "data/gantt.db" "data/backups/gantt.db.bak-$(date -u +%Y%m%d-%H%M%S)" 2>/dev/null && log "DB backup: data/gantt.db" || log "DB backup failed"
fi

echo "=== Fetching updates ==="
log "Fetching from git"
git fetch origin
LATEST_TAG=$(git tag -l 'v*' | sort -V | tail -1)
log "LATEST_TAG=$LATEST_TAG"

if [ -n "$LATEST_TAG" ]; then
  log "Checking out $LATEST_TAG"
  git checkout "$LATEST_TAG" 2>/dev/null || git pull origin main
  # Normalize tag to valid semver: strip leading v/V, handle vV1.0.2 -> 1.0.2
  TAG_VER=$(echo "$LATEST_TAG" | sed 's/^[vV]*//' | sed 's/^[^0-9]*//')
  [ -z "$TAG_VER" ] && TAG_VER="0.0.0"
  for f in package.json backend/package.json frontend/package.json; do
    if [ -f "$f" ]; then
      node -e "
        const f=process.argv[1], tag=process.argv[2];
        const fs=require('fs');
        const p=JSON.parse(fs.readFileSync(f,'utf8'));
        if (p.version !== tag) { p.version=tag; fs.writeFileSync(f,JSON.stringify(p,null,2)); }
      " "$f" "$TAG_VER" 2>/dev/null && log "Synced $f to $TAG_VER" || true
    fi
  done
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

echo "=== Starting (PM2) ==="
if command -v pm2 &>/dev/null; then
  pm2 start gantt-api 2>/dev/null || pm2 restart gantt-api 2>/dev/null || true
  echo "PM2 start/restart requested."
  log "PM2 start/restart requested"
else
  echo "PM2 not found. Restart the app manually."
  log "PM2 not found - restart manually"
fi

log "=== Update complete ==="
echo "=== Update complete ==="
