import express from 'express';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { optionalAuth, requireAdmin } from '../auth.js';
import { fetchFullBackup } from './admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();
router.use(optionalAuth, requireAdmin);

const DB_PATH = resolve(process.env.DB_PATH || join(__dirname, '../../data/gantt.db'));
const BACKUPS_DIR = join(dirname(DB_PATH), 'backups');
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

/** Compare semver strings; returns 1 if a>b, -1 if a<b, 0 if equal */
function compareVersions(a, b) {
  const parts = (v) => (v || '0').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
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

router.get('/check-update', async (req, res) => {
  const debug = req.query.debug === '1' || req.query.debug === 'true';
  try {
    const debugInfo = getDebugInfo();
    const currentVersion = debugInfo.packageJsonVersion;
    const repo = process.env.GITHUB_REPO || 'StroepWafel/GanttChartApp';
    const url = `https://api.github.com/repos/${repo}/releases/latest`;

    console.log('[update] check-update: packageJsonPath=%s currentVersion=%s', PACKAGE_JSON, currentVersion);

    const resp = await fetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!resp.ok) {
      console.error('[update] GitHub API failed: %s %s', resp.status, resp.statusText);
      return res.json({ updateAvailable: false, currentVersion, error: 'Failed to fetch releases', ...(debug && { _debug: debugInfo }) });
    }
    const data = await resp.json();
    const latestTag = data.tag_name?.replace(/^v/, '') || data.name || '';
    if (!latestTag) {
      return res.json({ updateAvailable: false, currentVersion, ...(debug && { _debug: debugInfo }) });
    }
    const updateAvailable = compareVersions(latestTag, currentVersion) > 0;
    console.log('[update] check-update: latestTag=%s updateAvailable=%s', latestTag, updateAvailable);

    res.json({
      updateAvailable,
      currentVersion,
      latestVersion: latestTag,
      releaseUrl: data.html_url,
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
  const proc = spawn('bash', [scriptPath], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    detached: true,
    env: { ...process.env, GITHUB_REPO: repo, PM2_HOME: process.env.PM2_HOME || '' },
  });
  proc.unref();
  process.exit(0);
}

router.post('/apply-update', async (req, res) => {
  const debug = req.query.debug === '1' || req.query.debug === 'true';
  try {
    const debugInfo = getDebugInfo();
    console.log('[update] apply-update: ROOT_DIR=%s packageJson=%s', ROOT_DIR, PACKAGE_JSON);

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
        const proc = spawn('bash', [scriptPath], {
          cwd: ROOT_DIR,
          stdio: 'inherit',
          detached: true,
          env: { ...process.env, PM2_HOME: process.env.PM2_HOME || '' },
        });
        proc.unref();
        process.exit(0);
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
