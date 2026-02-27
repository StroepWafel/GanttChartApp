#!/usr/bin/env bash
# Build mobile app (PWA) with hardcoded server URL. Run from repo root or via npm run build:mobile.
# Requires: .env with PUBLIC_URL and MOBILE_APP_ENABLED=true

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOG_FILE="${ROOT}/data/backups/update.log"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

# Load .env
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env" 2>/dev/null || true
  set +a
fi

MOBILE_APP_ENABLED="${MOBILE_APP_ENABLED:-false}"
PUBLIC_URL="${PUBLIC_URL:-}"

if [ "$MOBILE_APP_ENABLED" != "true" ]; then
  log "build-mobile: MOBILE_APP_ENABLED is not true, skipping"
  exit 0
fi

if [ -z "$PUBLIC_URL" ] || [ "$PUBLIC_URL" = "null" ]; then
  log "build-mobile: PUBLIC_URL is not set, skipping"
  exit 0
fi

# Trim trailing slash
PUBLIC_URL="${PUBLIC_URL%/}"
log "build-mobile: Building mobile app for $PUBLIC_URL"

# Check we have frontend source
if [ ! -d "$ROOT/frontend/src" ] || [ ! -f "$ROOT/frontend/package.json" ]; then
  log "build-mobile: frontend source not found, skipping"
  exit 0
fi

# Build frontend with mobile config
echo "=== Building mobile app ==="
log "Building frontend with VITE_API_URL=$PUBLIC_URL VITE_BASE_PATH=/mobile-app/"
(cd "$ROOT/frontend" && VITE_API_URL="$PUBLIC_URL" VITE_BASE_PATH=/mobile-app/ npm run build) || {
  log "build-mobile: Frontend build failed"
  exit 1
}

# Copy to mobile/dist
mkdir -p "$ROOT/mobile/dist"
rm -rf "$ROOT/mobile/dist"
cp -r "$ROOT/frontend/dist" "$ROOT/mobile/dist"
log "Copied build to mobile/dist"

# Create PWA manifest
MANIFEST="$ROOT/mobile/dist/manifest.json"
cat > "$MANIFEST" << EOF
{
  "name": "Gantt Chart",
  "short_name": "Gantt",
  "description": "Gantt chart app",
  "start_url": "${PUBLIC_URL}/mobile-app/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#333333"
}
EOF
log "Created manifest.json"

# Inject manifest link into index.html (cross-platform)
if [ -f "$ROOT/mobile/dist/index.html" ]; then
  if ! grep -q 'rel="manifest"' "$ROOT/mobile/dist/index.html" 2>/dev/null; then
    node -e "
      const fs=require('fs');
      const f=process.argv[1];
      let h=fs.readFileSync(f,'utf8');
      h=h.replace('<head>','<head>\n    <link rel=\"manifest\" href=\"/mobile-app/manifest.json\">');
      fs.writeFileSync(f,h);
    " "$ROOT/mobile/dist/index.html"
  fi
fi

echo "=== Mobile app build complete ==="
log "build-mobile: Mobile app built to mobile/dist"
