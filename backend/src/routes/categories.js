import express from 'express';
import db from '../db.js';
import { validateName } from '../validation.js';

const router = express.Router();

function withUserScope(req, fn) {
  if (!req.user?.userId) return fn(null);
  return fn(req.user.userId);
}

router.get('/', (req, res) => {
  try {
    withUserScope(req, (userId) => {
      const rows = userId
        ? db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY display_order ASC, name ASC').all(userId)
        : db.prepare('SELECT * FROM categories ORDER BY display_order ASC, name ASC').all();
      res.json(rows);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { name, display_order = 0 } = req.body;
    const finalName = name || 'Uncategorized';
    const nameVal = validateName(finalName);
    if (!nameVal.ok) return res.status(400).json({ error: nameVal.error });
    const result = db.prepare(`
      INSERT INTO categories (user_id, name, display_order) VALUES (?, ?, ?)
    `).run(userId, nameVal.value, display_order);
    res.status(201).json({ id: result.lastInsertRowid, name: nameVal.value, display_order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { name, display_order } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) {
      const nameVal = validateName(name);
      if (!nameVal.ok) return res.status(400).json({ error: nameVal.error });
      updates.push('name = ?');
      params.push(nameVal.value);
    }
    if (display_order !== undefined) { updates.push('display_order = ?'); params.push(display_order); }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    if (userId) {
      params.push(id, userId);
      db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
    } else {
      params.push(id);
      db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (userId) {
      db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    } else {
      db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
