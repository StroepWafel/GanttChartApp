import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM categories ORDER BY display_order ASC, name ASC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, display_order = 0 } = req.body;
    const result = db.prepare(`
      INSERT INTO categories (name, display_order) VALUES (?, ?)
    `).run(name || 'Uncategorized', display_order);
    res.status(201).json({ id: result.lastInsertRowid, name: name || 'Uncategorized', display_order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, display_order } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (display_order !== undefined) { updates.push('display_order = ?'); params.push(display_order); }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    params.push(id);
    db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
