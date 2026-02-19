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
const ROOT_DIR = join(__dirname, '../../..');
const PACKAGE_JSON = join(ROOT_DIR, 'package.json');

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

router.get('/check-update', async (req, res) => {
  try {
    const currentVersion = getVersion();
    const repo = process.env.GITHUB_REPO || 'StroepWafel/GanttChartApp';
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!resp.ok) {
      return res.json({ updateAvailable: false, currentVersion, error: 'Failed to fetch releases' });
    }
    const data = await resp.json();
    const latestTag = data.tag_name?.replace(/^v/, '') || data.name || '';
    if (!latestTag) {
      return res.json({ updateAvailable: false, currentVersion });
    }
    const updateAvailable = latestTag !== currentVersion;
    res.json({
      updateAvailable,
      currentVersion,
      latestVersion: latestTag,
      releaseUrl: data.html_url,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/apply-update', async (req, res) => {
  try {
    if (!existsSync(join(ROOT_DIR, '.git'))) {
      return res.status(400).json({ error: 'Not a git repository; cannot auto-update. Use manual git pull.' });
    }
    if (!existsSync(BACKUPS_DIR)) {
      mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const backup = fetchFullBackup();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(BACKUPS_DIR, `gantt-backup-pre-update-${timestamp}.json`);
    writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');

    const scriptPath = join(ROOT_DIR, 'scripts', 'update.sh');
    const hasUpdateScript = existsSync(scriptPath);
    if (!hasUpdateScript) {
      return res.status(400).json({
        error: 'scripts/update.sh not found. Create it or run update manually.',
        backupCreated: backupPath,
      });
    }

    res.json({
      ok: true,
      message: 'Backup created. Starting update... (PM2 will restart automatically if deployed with PM2)',
      backupPath,
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
