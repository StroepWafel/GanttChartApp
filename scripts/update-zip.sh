#!/usr/bin/env bash
# Zip-based update for deployments without git. Run from app root.
# Requires: curl, unzip. PM2 for auto-restart.

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
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
  echo "Could not find zip asset in latest release"
  exit 1
fi

echo "=== Downloading ==="
curl -sSL -o "$TMP_DIR/release.zip" "$ZIP_URL"

echo "=== Extracting ==="
unzip -o -q "$TMP_DIR/release.zip" -d "$TMP_DIR/extract"

echo "=== Applying update ==="
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

echo "=== Installing backend dependencies ==="
(cd "$ROOT/backend" && npm install --omit=dev 2>/dev/null) || npm --prefix "$ROOT/backend" install --omit=dev || true

echo "=== Restarting (PM2 only) ==="
if command -v pm2 &>/dev/null; then
  pm2 restart gantt-api 2>/dev/null || true
  echo "PM2 restart requested."
else
  echo "PM2 not found. Restart the app manually."
fi

echo "=== Update complete ==="
