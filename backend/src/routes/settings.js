import express from 'express';
import db from '../db.js';
import { optionalAuth, requireAdmin } from '../auth.js';

const router = express.Router();

router.get('/', optionalAuth, requireAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM system_settings').all();
    const settings = {};
    for (const r of rows) {
      try {
        settings[r.key] = r.value ? JSON.parse(r.value) : null;
      } catch {
        settings[r.key] = r.value;
      }
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/', optionalAuth, requireAdmin, (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid body' });
    }
    for (const [key, value] of Object.entries(body)) {
      if (!key) continue;
      const valStr = typeof value === 'string' ? value : JSON.stringify(value);
      db.prepare(`
        INSERT INTO system_settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(key, valStr);
    }
    const rows = db.prepare('SELECT key, value FROM system_settings').all();
    const settings = {};
    for (const r of rows) {
      try {
        settings[r.key] = r.value ? JSON.parse(r.value) : null;
      } catch {
        settings[r.key] = r.value;
      }
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
