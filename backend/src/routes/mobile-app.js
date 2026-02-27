import express from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apkPath = path.resolve(__dirname, '../../../mobile/releases/app.apk');

const router = express.Router();

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
