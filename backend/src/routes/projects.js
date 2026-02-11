import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { category_id } = req.query;
    let sql = `
      SELECT p.*, c.name as category_name
      FROM projects p
      JOIN categories c ON p.category_id = c.id
      ORDER BY c.display_order, c.name, p.name
    `;
    const params = [];
    if (category_id) {
      sql = `SELECT p.*, c.name as category_name FROM projects p JOIN categories c ON p.category_id = c.id WHERE p.category_id = ? ORDER BY p.name`;
      params.push(category_id);
    }
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, category_id } = req.body;
    if (!category_id) return res.status(400).json({ error: 'category_id required' });
    const result = db.prepare(`
      INSERT INTO projects (name, category_id) VALUES (?, ?)
    `).run(name || 'New Project', category_id);
    res.status(201).json({ id: result.lastInsertRowid, name: name || 'New Project', category_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, category_id } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id); }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    params.push(id);
    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
