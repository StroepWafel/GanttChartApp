import express from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apkPath = path.resolve(__dirname, '../../../mobile/releases/app.apk');

const router = express.Router();

/** Serve APK - under /api so it's never caught by static/catch-all */
router.get('/download', (req, res) => {
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
    res.sendFile(apkPath);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/** Public endpoint: returns whether mobile app download is enabled and if APK is available */
router.get('/status', (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('mobile_app_enabled');
    const raw = row?.value;
    let enabled = false;
    if (raw != null && raw !== '') {
      try {
        const v = JSON.parse(raw);
        enabled = v === true || v === 'true';
      } catch {
        enabled = raw === 'true' || raw === true;
      }
    }
    const apkAvailable = enabled && existsSync(apkPath);
    res.json({ enabled, apkAvailable });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
