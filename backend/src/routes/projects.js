import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    const { category_id } = req.query;
    let sql;
    const params = [];
    if (userId) {
      sql = `
        SELECT p.*, c.name as category_name
        FROM projects p
        JOIN categories c ON p.category_id = c.id AND c.user_id = ?
        WHERE p.user_id = ?
      `;
      params.push(userId, userId);
      if (category_id) {
        sql += ' AND p.category_id = ?';
        params.push(category_id);
      }
      sql += ' ORDER BY c.display_order, c.name, p.name';
    } else {
      sql = `
        SELECT p.*, c.name as category_name
        FROM projects p
        JOIN categories c ON p.category_id = c.id
      `;
      if (category_id) {
        sql += ' WHERE p.category_id = ?';
        params.push(category_id);
      }
      sql += ' ORDER BY c.display_order, c.name, p.name';
    }
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { name, category_id, due_date, start_date } = req.body;
    if (!category_id) return res.status(400).json({ error: 'category_id required' });
    const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?').get(category_id, userId);
    if (!cat) return res.status(400).json({ error: 'Category not found' });
    const result = db.prepare(`
      INSERT INTO projects (user_id, name, category_id, due_date, start_date) VALUES (?, ?, ?, ?, ?)
    `).run(userId, name || 'New Project', category_id, due_date || null, start_date || null);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { name, category_id, due_date, start_date } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id); }
    if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date || null); }
    if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date || null); }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    if (userId) {
      params.push(id, userId);
      db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
    } else {
      params.push(id);
      db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);
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
      db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    } else {
      db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
