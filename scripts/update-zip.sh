#!/usr/bin/env bash
# Zip-based update for deployments without git. Run from app root.
# Requires: curl, unzip. PM2 for auto-restart.
# Logs to data/backups/update.log

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOG_FILE="${ROOT}/data/backups/update.log"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

log "=== update-zip.sh started ==="
log "ROOT=$ROOT REPO=${GITHUB_REPO:-StroepWafel/GanttChartApp}"

REPO="${GITHUB_REPO:-StroepWafel/GanttChartApp}"
TMP_DIR="$(mktemp -d)"
trap "rm -rf '$TMP_DIR'" EXIT

echo "=== Fetching latest release ==="
API_JSON=$(curl -sS "https://api.github.com/repos/${REPO}/releases/latest" \
  -H "Accept: application/vnd.github.v3+json")
ZIP_URL=$(node -e "
  const d = JSON.parse(process.argv[1]);
  const a = d.assets?.find(x => x.name?.endsWith('.zip'));
  if (!a?.browser_download_url) process.exit(1);
  console.log(a.browser_download_url);
" "$API_JSON")
if [ -z "$ZIP_URL" ]; then
  log "ERROR: Could not find zip asset in latest release"
  echo "Could not find zip asset in latest release"
  exit 1
fi
log "ZIP_URL=$ZIP_URL"

echo "=== Downloading ==="
log "Downloading release"
curl -sSL -o "$TMP_DIR/release.zip" "$ZIP_URL"

echo "=== Extracting ==="
log "Extracting zip"
unzip -o -q "$TMP_DIR/release.zip" -d "$TMP_DIR/extract"

echo "=== Applying update ==="
log "Copying files to $ROOT"
EXTRACTED="$TMP_DIR/extract"
[ -f "$EXTRACTED/package.json" ] && cp "$EXTRACTED/package.json" "$ROOT/"
[ -d "$EXTRACTED/backend" ] && rm -rf "$ROOT/backend" && cp -r "$EXTRACTED/backend" "$ROOT/"
if [ -d "$EXTRACTED/dist" ]; then
  mkdir -p "$ROOT/frontend"
  rm -rf "$ROOT/frontend/dist"
  cp -r "$EXTRACTED/dist" "$ROOT/frontend/"
elif [ -d "$EXTRACTED/frontend" ]; then
  rm -rf "$ROOT/frontend"
  cp -r "$EXTRACTED/frontend" "$ROOT/"
fi
[ -f "$EXTRACTED/package-lock.json" ] && cp "$EXTRACTED/package-lock.json" "$ROOT/" || true
[ -f "$EXTRACTED/ecosystem.config.cjs" ] && cp "$EXTRACTED/ecosystem.config.cjs" "$ROOT/" || true
[ -d "$EXTRACTED/scripts" ] && rm -rf "$ROOT/scripts" && cp -r "$EXTRACTED/scripts" "$ROOT/" || true
log "Version in package.json after copy: $(node -p "require('./package.json').version" 2>/dev/null || echo 'read failed')"

echo "=== Installing backend dependencies ==="
log "Running npm install in backend"
(cd "$ROOT/backend" && npm install --omit=dev) || npm --prefix "$ROOT/backend" install --omit=dev || true

echo "=== Restarting (PM2) ==="
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
