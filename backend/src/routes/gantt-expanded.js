import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT item_type, item_id, expanded FROM gantt_expanded
    `).all();
    const result = { category: {}, project: {}, task: {} };
    for (const r of rows) {
      result[r.item_type][r.item_id] = !!r.expanded;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/', (req, res) => {
  try {
    const { item_type, item_id, expanded } = req.body;
    if (!item_type || item_id === undefined) {
      return res.status(400).json({ error: 'item_type and item_id required' });
    }
    if (!['category', 'project', 'task'].includes(item_type)) {
      return res.status(400).json({ error: 'item_type must be category, project, or task' });
    }
    db.prepare(`
      INSERT INTO gantt_expanded (item_type, item_id, expanded)
      VALUES (?, ?, ?)
      ON CONFLICT(item_type, item_id) DO UPDATE SET expanded = excluded.expanded
    `).run(item_type, item_id, expanded ? 1 : 0);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
