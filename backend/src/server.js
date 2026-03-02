import './load-env.js';
import path from 'path';
import crypto from 'crypto';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';

import db from './db.js';
import { optionalAuth, isAuthEnabled } from './auth.js';
import categoriesRouter from './routes/categories.js';
import projectsRouter from './routes/projects.js';
import tasksRouter from './routes/tasks.js';
import ganttExpandedRouter from './routes/gantt-expanded.js';
import clearRouter from './routes/clear.js';
import backupRouter from './routes/backup.js';
import authRouter from './routes/auth.js';
import passwordResetRouter from './routes/password-reset.js';
import usersRouter from './routes/users.js';
import userPreferencesRouter from './routes/user-preferences.js';
import adminRouter from './routes/admin.js';
import settingsRouter from './routes/settings.js';
import spacesRouter from './routes/spaces.js';
import sharesRouter from './routes/shares.js';
import updateRouter from './routes/update.js';
import apiRouter from './routes/api.js';
import mobileAppRouter from './routes/mobile-app.js';
import statisticsRouter, { sendPeriodicStats } from './routes/statistics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Path for "server is restarting" flag (cleared on startup so new process does not report updating)
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'gantt.db');
const UPDATE_RESTARTING_FLAG = path.join(path.dirname(process.env.DB_PATH || DEFAULT_DB_PATH), 'update-restarting.flag');

try {
  if (existsSync(UPDATE_RESTARTING_FLAG)) {
    unlinkSync(UPDATE_RESTARTING_FLAG);
    console.log('[server] Cleared update-restarting flag');
  }
} catch (e) {
  console.warn('[server] Could not clear update flag:', e?.message);
}

// Per-process id so clients can detect when this process restarted (new boot = new id)
const SERVER_BOOT_ID = crypto.randomUUID();

// Frontend dist: when running from backend/, it's ../frontend/dist
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const mobileReleasesDir = path.resolve(__dirname, '../../mobile/releases');
const apkPath = path.join(mobileReleasesDir, 'app.apk');
const ipaPath = path.join(mobileReleasesDir, 'app.ipa');

const app = express();
// Trust proxy when behind nginx/Cloudflare etc. (avoids ERR_ERL_UNEXPECTED_X_FORWARDED_FOR from rate-limit)
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy !== undefined && trustProxy !== '') {
  const n = parseInt(trustProxy, 10);
  app.set('trust proxy', Number.isNaN(n) ? true : n);
}
app.use(cors());
app.use(express.json());

// APK download - explicit route so it's never caught by static/SPA fallback (e.g. when behind proxy with base path)
app.get('/api/mobile-app/download', (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('mobile_app_enabled');
    let enabled = false;
    if (row?.value != null && row.value !== '') {
      try {
        const v = JSON.parse(row.value);
        enabled = v === true || v === 'true';
      } catch {
        enabled = row.value === 'true' || row.value === true;
      }
    }
    if (!enabled) return res.status(403).send('Mobile app is not enabled.');
    if (!existsSync(apkPath)) return res.status(404).send('APK not available.');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="gantt-chart.apk"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(apkPath);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Auth status (no auth required)
app.use('/api/auth', authRouter);
app.use('/api/auth', passwordResetRouter);

// User management
app.use('/api/users', optionalAuth, usersRouter);

// User preferences
app.use('/api/user-preferences', optionalAuth, userPreferencesRouter);

// Admin-only routes
app.use('/api/admin', adminRouter);
app.use('/api/admin/update', updateRouter);
app.use('/api/settings', optionalAuth, settingsRouter);
app.use('/api/statistics', optionalAuth, statisticsRouter);

// Version (public for update check UI) - reads root package.json; includes updating: true when server is about to restart
app.get('/api/version', (req, res) => {
  try {
    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const version = pkg.version || '1.0.0';
    if (process.env.NODE_ENV !== 'production') {
      console.log('[version] path=%s version=%s', pkgPath, version);
    }
    const updating = existsSync(UPDATE_RESTARTING_FLAG);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.json({ version, bootId: SERVER_BOOT_ID, ...(updating && { updating: true }) });
  } catch (err) {
    console.error('[version] read failed:', err?.message);
    res.json({ version: '1.0.0' });
  }
});

// Read-only IoT API (username + api_key required)
app.use('/api/readonly', apiRouter);

// Mobile app status (public, no auth)
app.use('/api/mobile-app', mobileAppRouter);

// Protected routes
app.use('/api/categories', optionalAuth, categoriesRouter);
app.use('/api/projects', optionalAuth, projectsRouter);
app.use('/api/tasks', optionalAuth, tasksRouter);
app.use('/api/spaces', spacesRouter);
app.use('/api/shares', optionalAuth, sharesRouter);
app.use('/api/gantt-expanded', optionalAuth, ganttExpandedRouter);
app.use('/api/clear', optionalAuth, clearRouter);
app.use('/api/backup', optionalAuth, backupRouter);

// Serve mobile app landing page and APK at /mobile-app when enabled
function isMobileAppEnabled() {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('mobile_app_enabled');
    const raw = row?.value;
    if (raw == null || raw === '') return false;
    try {
      const v = JSON.parse(raw);
      return v === true || v === 'true';
    } catch {
      return raw === 'true' || raw === true;
    }
  } catch {
    return false;
  }
}

const mobileLandingPath = path.join(__dirname, 'mobile-landing.html');
let mobileLandingTemplate = '';
try {
  if (existsSync(mobileLandingPath)) {
    mobileLandingTemplate = readFileSync(mobileLandingPath, 'utf8');
  }
} catch (e) {
  console.warn('[server] Could not load mobile-landing.html:', e?.message);
}

// Serve landing page at /mobile-app and /mobile-app/
app.get(['/mobile-app', '/mobile-app/'], (req, res) => {
  if (!isMobileAppEnabled()) {
    return res.status(503).send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mobile app</title></head><body style="font-family:system-ui,sans-serif;margin:2rem;max-width:480px"><h1>Mobile app</h1><p>The mobile app is not enabled.</p><p>An admin can enable and build it in <strong>Settings → App</strong>.</p><p><a href="/">← Back to app</a></p></body></html>`
    );
  }
  const apkAvailable = existsSync(apkPath);
  const iosAvailable = existsSync(ipaPath);
  const apkSection = apkAvailable
    ? '<a href="/api/mobile-app/download" class="btn" download="gantt-chart.apk">Download Android app (APK)</a>'
    : '<p><em>APK available after build. Use "Build now" in Settings → App or run the GitHub workflow.</em></p>';
  const iosSection = iosAvailable
    ? '<a href="/api/mobile-app/download-ios" class="btn" download="gantt-chart.ipa" style="margin-left: 0.5rem;">Download iOS app (IPA)</a>'
    : '<p><em>iOS build: build on Mac/CI, then upload via Settings → App.</em></p>';
  const html = mobileLandingTemplate
    .replace('{{APK_SECTION}}', apkSection)
    .replace('{{IOS_SECTION}}', iosSection);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Redirect other /mobile-app paths to landing page
app.get('/mobile-app/*', (req, res) => {
  res.redirect(302, '/mobile-app/');
});

// Serve main frontend
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, HOST, () => {
  const addr = HOST === '0.0.0.0' ? `http://localhost:${PORT} (and all interfaces)` : `http://${HOST}:${PORT}`;
  console.log(`Gantt Chart API running on ${addr}`);
  if (isAuthEnabled()) console.log('Auth: enabled');
  else console.log('Auth: disabled');

  const STATS_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
  setTimeout(() => sendPeriodicStats().catch(() => {}), 5 * 60 * 1000);
  setInterval(() => sendPeriodicStats().catch(() => {}), STATS_INTERVAL_MS);
});
