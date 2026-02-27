import express from 'express';
import db from '../db.js';

const router = express.Router();

/** Public endpoint: returns whether mobile app download is enabled */
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
    res.json({ enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
