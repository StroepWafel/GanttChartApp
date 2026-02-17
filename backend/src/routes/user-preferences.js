import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const rows = db.prepare(`
      SELECT key, value FROM user_preferences WHERE user_id = ?
    `).all(userId);
    const prefs = {};
    for (const r of rows) {
      try {
        prefs[r.key] = r.value ? JSON.parse(r.value) : null;
      } catch {
        prefs[r.key] = r.value;
      }
    }
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'key required' });
    }
    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    db.prepare(`
      INSERT INTO user_preferences (user_id, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
    `).run(userId, key, valStr);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
