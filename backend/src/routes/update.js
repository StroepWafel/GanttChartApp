import express from 'express';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { optionalAuth, requireAdmin } from '../auth.js';
import { fetchFullBackup } from './admin.js';
import db from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();
router.use(optionalAuth, requireAdmin);

const DB_PATH = resolve(process.env.DB_PATH || join(__dirname, '../../data/gantt.db'));
const BACKUPS_DIR = join(dirname(DB_PATH), 'backups');
const UPDATE_RESTARTING_FLAG = join(dirname(DB_PATH), 'update-restarting.flag');
const ROOT_DIR = resolve(join(__dirname, '../../..'));
const PACKAGE_JSON = join(ROOT_DIR, 'package.json');

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function getDebugInfo() {
  let pkgVersion = '1.0.0';
  let pkgError = null;
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    pkgVersion = pkg.version || '1.0.0';
  } catch (e) {
    pkgError = String(e.message || e);
  }
  return {
    packageJsonPath: PACKAGE_JSON,
    packageJsonExists: existsSync(PACKAGE_JSON),
    packageJsonVersion: pkgVersion,
    packageJsonError: pkgError,
    rootDir: ROOT_DIR,
    processCwd: process.cwd(),
    hasGit: existsSync(join(ROOT_DIR, '.git')),
    hasUpdateScript: existsSync(join(ROOT_DIR, 'scripts', 'update.sh')),
    hasUpdateZipScript: existsSync(join(ROOT_DIR, 'scripts', 'update-zip.sh')),
  };
}

/** Normalize version string: strip leading v/V and non-digits, e.g. vV1.0.2 -> 1.0.2 */
function normalizeVersion(v) {
  if (!v || typeof v !== 'string') return '0.0.0';
  const s = v.replace(/^[vV]+/, '').replace(/^[^0-9.]+/, '');
  return s || '0.0.0';
}

/** Compare semver strings; returns 1 if a>b, -1 if a<b, 0 if equal */
function compareVersions(a, b) {
  const parts = (v) => normalizeVersion(v).split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** GitHub token from env or system_settings (increases rate limit to 5,000/hr when set) */
function getGitHubToken() {
  const fromEnv = process.env.GITHUB_TOKEN;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('github_token');
    if (!row?.value) return null;
    const v = typeof row.value === 'string' ? (() => { try { return JSON.parse(row.value); } catch { return row.value; } })() : row.value;
    const token = String(v ?? '').trim();
    return token || null;
  } catch {
    return null;
  }
}

router.get('/check-update', async (req, res) => {
  const debug = req.query.debug === '1' || req.query.debug === 'true';
  try {
    const debugInfo = getDebugInfo();
    const currentVersion = debugInfo.packageJsonVersion;
    const repo = process.env.GITHUB_REPO || 'StroepWafel/GanttChartApp';
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const token = getGitHubToken();
    const headers = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    console.log('[update] check-update: packageJsonPath=%s currentVersion=%s', PACKAGE_JSON, currentVersion);

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      console.error('[update] GitHub API failed: %s %s', resp.status, resp.statusText);
      let errorMessage = 'Failed to fetch releases';
      const resetHeader = resp.headers.get('x-ratelimit-reset') || resp.headers.get('X-RateLimit-Reset');
      if ((resp.status === 403 || resp.status === 429) && resetHeader) {
        const resetSeconds = parseInt(resetHeader, 10);
        if (!Number.isNaN(resetSeconds)) {
          const resetDate = new Date(resetSeconds * 1000);
          const resetStr = resetDate.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
          errorMessage = `GitHub API rate limited. Limit resets at ${resetStr} UTC. Try again after that.`;
        }
      }
      const repo = process.env.GITHUB_REPO || 'StroepWafel/GanttChartApp';
      return res.json({
        updateAvailable: false,
        currentVersion,
        error: errorMessage,
        releasesUrl: `https://github.com/${repo}/releases`,
        ...(debug && { _debug: debugInfo }),
      });
    }
    const data = await resp.json();
    const latestTag = data.tag_name?.replace(/^v/, '') || data.name || '';
    if (!latestTag) {
      const repo = process.env.GITHUB_REPO || 'StroepWafel/GanttChartApp';
      return res.json({
        updateAvailable: false,
        currentVersion,
        releasesUrl: `https://github.com/${repo}/releases`,
        ...(debug && { _debug: debugInfo }),
      });
    }
    const updateAvailable = compareVersions(latestTag, currentVersion) > 0;
    console.log('[update] check-update: latestTag=%s updateAvailable=%s', latestTag, updateAvailable);

    const repo = process.env.GITHUB_REPO || 'StroepWafel/GanttChartApp';
    res.json({
      updateAvailable,
      currentVersion: normalizeVersion(currentVersion),
      latestVersion: normalizeVersion(latestTag),
      releaseName: data.name || null,
      releaseUrl: data.html_url,
      releasesUrl: `https://github.com/${repo}/releases`,
      ...(debug && { _debug: debugInfo }),
    });
  } catch (err) {
    console.error('[update] check-update error:', err);
    res.status(500).json({ error: err.message });
  }
});

function runZipUpdate() {
  const repo = process.env.GITHUB_REPO || 'StroepWafel/GanttChartApp';
  const scriptPath = join(ROOT_DIR, 'scripts', 'update-zip.sh');
  const proc = spawn('bash', ['-c', 'nohup bash "$UPDATE_SCRIPT" </dev/null >>/dev/null 2>&1 &'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    detached: true,
    env: { ...process.env, GITHUB_REPO: repo, PM2_HOME: process.env.PM2_HOME || '', UPDATE_SCRIPT: scriptPath },
  });
  proc.unref();
  // Do NOT process.exit: server must stay up so clients can poll
  // data.updating for ~20s. The update script will pm2 stop after that.
  // nohup ensures the script survives when pm2 stop kills this process.
}

router.post('/apply-update', async (req, res) => {
  const debug = req.query.debug === '1' || req.query.debug === 'true';
  try {
    const debugInfo = getDebugInfo();
    console.log('[update] apply-update: ROOT_DIR=%s packageJson=%s', ROOT_DIR, PACKAGE_JSON);

    // Signal to all clients that the server is about to restart (so they show overlay and reload when back)
    mkdirSync(dirname(DB_PATH), { recursive: true });
    writeFileSync(UPDATE_RESTARTING_FLAG, Date.now().toString(), 'utf8');

    if (!existsSync(BACKUPS_DIR)) {
      mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const backup = fetchFullBackup();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(BACKUPS_DIR, `gantt-backup-pre-update-${timestamp}.json`);
    writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
    console.log('[update] Backup created: %s', backupPath);

    const hasGit = existsSync(join(ROOT_DIR, '.git'));
    const scriptPath = join(ROOT_DIR, 'scripts', 'update.sh');

    if (hasGit && existsSync(scriptPath)) {
      console.log('[update] Using git update script: %s', scriptPath);
      res.json({
        ok: true,
        message: 'Backup created. Starting git update... (PM2 will restart automatically if deployed with PM2)',
        backupPath,
        _debug: debug ? { ...debugInfo, scriptUsed: 'update.sh' } : undefined,
      });
      setTimeout(() => {
        const proc = spawn('bash', ['-c', 'nohup bash "$UPDATE_SCRIPT" </dev/null >>/dev/null 2>&1 &'], {
          cwd: ROOT_DIR,
          stdio: 'inherit',
          detached: true,
          env: { ...process.env, PM2_HOME: process.env.PM2_HOME || '', UPDATE_SCRIPT: scriptPath },
        });
        proc.unref();
        // Do NOT process.exit here: server must stay up so clients can poll
        // data.updating for ~20s. The update script will pm2 stop after that.
        // nohup ensures the script survives when pm2 stop kills this process.
      }, 500);
      return;
    }

    const updateZipPath = join(ROOT_DIR, 'scripts', 'update-zip.sh');
    if (!existsSync(updateZipPath)) {
      console.error('[update] No update script found. hasGit=%s update.sh=%s update-zip.sh=%s', hasGit, existsSync(scriptPath), existsSync(updateZipPath));
      return res.status(400).json({
        error: hasGit
          ? 'scripts/update.sh not found. Create it or run update manually.'
          : 'Deployed from zip: scripts/update-zip.sh not found. Re-download the latest release and extract over this install.',
        backupCreated: backupPath,
        _debug: debug ? debugInfo : undefined,
      });
    }

    console.log('[update] Using zip update script: %s', updateZipPath);
    res.json({
      ok: true,
      message: 'Backup created. Starting zip update... (PM2 will restart automatically if deployed with PM2)',
      backupPath,
      _debug: debug ? { ...debugInfo, scriptUsed: 'update-zip.sh' } : undefined,
    });

    setTimeout(runZipUpdate, 500);
  } catch (err) {
    console.error('[update] apply-update error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
