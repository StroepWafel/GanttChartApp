#!/usr/bin/env node
/**
 * Build mobile app (PWA) with hardcoded server URL. Run from repo root via npm run build:mobile.
 * Requires: .env with PUBLIC_URL and MOBILE_APP_ENABLED=true
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

require('dotenv').config({ path: path.join(ROOT, '.env') });
const env = { ...process.env };
const MOBILE_APP_ENABLED = env.MOBILE_APP_ENABLED === 'true';
let PUBLIC_URL = (env.PUBLIC_URL || '').trim().replace(/\/$/, '');

if (!MOBILE_APP_ENABLED) {
  console.log('build-mobile: MOBILE_APP_ENABLED is not true, skipping');
  process.exit(0);
}

if (!PUBLIC_URL || PUBLIC_URL === 'null') {
  console.log('build-mobile: PUBLIC_URL is not set, skipping');
  process.exit(0);
}

const frontendDir = path.join(ROOT, 'frontend');
const mobileDistDir = path.join(ROOT, 'mobile', 'dist');

if (!fs.existsSync(path.join(frontendDir, 'src')) || !fs.existsSync(path.join(frontendDir, 'package.json'))) {
  console.log('build-mobile: frontend source not found, skipping');
  process.exit(0);
}

console.log('=== Building mobile app ===');
console.log('Building frontend with VITE_API_URL=' + PUBLIC_URL + ' VITE_BASE_PATH=/mobile-app/');

try {
  execSync('npm run build', {
    cwd: frontendDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: PUBLIC_URL, VITE_BASE_PATH: '/mobile-app/' },
  });
} catch (e) {
  console.error('build-mobile: Frontend build failed');
  process.exit(1);
}

if (fs.existsSync(mobileDistDir)) fs.rmSync(mobileDistDir, { recursive: true });
fs.cpSync(path.join(frontendDir, 'dist'), mobileDistDir, { recursive: true });
console.log('Copied build to mobile/dist');

const manifest = {
  name: 'Gantt Chart',
  short_name: 'Gantt',
  description: 'Gantt chart app',
  start_url: PUBLIC_URL + '/mobile-app/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#333333',
};
fs.writeFileSync(path.join(mobileDistDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Created manifest.json');

const indexPath = path.join(mobileDistDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes('rel="manifest"')) {
    html = html.replace('<head>', '<head>\n    <link rel="manifest" href="/mobile-app/manifest.json">');
    fs.writeFileSync(indexPath, html);
  }
}

console.log('=== Mobile app build complete ===');
