import express from 'express';
import db from '../db.js';
import { computeUrgency } from '../lib/priority.js';

const router = express.Router();

function taskFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    parent_id: row.parent_id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    due_date: row.due_date,
    progress: row.progress ?? 0,
    completed: !!row.completed,
    completed_at: row.completed_at,
    base_priority: row.base_priority ?? 5,
    created_at: row.created_at,
    updated_at: row.updated_at,
    urgency: computeUrgency(row),
  };
}

router.get('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    const { project_id, completed, include_completed } = req.query;
    let sql = `
      SELECT t.*, p.name as project_name, c.name as category_name, c.display_order as category_order
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (userId) { sql += ' AND t.user_id = ?'; params.push(userId); }
    if (project_id) { sql += ' AND t.project_id = ?'; params.push(project_id); }
    if (completed === 'true') { sql += ' AND t.completed = 1'; }
    if (completed === 'false') { sql += ' AND t.completed = 0'; }
    if (include_completed !== 'true' && !completed) { sql += ' AND t.completed = 0'; }
    sql += ' ORDER BY c.display_order, c.name, p.name, t.parent_id ASC, t.start_date ASC';
    const rows = db.prepare(sql).all(...params);
    const tasks = rows.map(taskFromRow);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/completed', (req, res) => {
  try {
    const userId = req.user?.userId;
    const sql = userId
      ? `SELECT t.*, p.name as project_name, c.name as category_name
         FROM tasks t
         JOIN projects p ON t.project_id = p.id
         JOIN categories c ON p.category_id = c.id
         WHERE t.completed = 1 AND t.user_id = ?
         ORDER BY t.completed_at DESC`
      : `SELECT t.*, p.name as project_name, c.name as category_name
         FROM tasks t
         JOIN projects p ON t.project_id = p.id
         JOIN categories c ON p.category_id = c.id
         WHERE t.completed = 1
         ORDER BY t.completed_at DESC`;
    const rows = userId ? db.prepare(sql).all(userId) : db.prepare(sql).all();
    res.json(rows.map(taskFromRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    const row = userId
      ? db.prepare(`
          SELECT t.*, p.name as project_name, c.name as category_name
          FROM tasks t
          JOIN projects p ON t.project_id = p.id
          JOIN categories c ON p.category_id = c.id
          WHERE t.id = ? AND t.user_id = ?
        `).get(req.params.id, userId)
      : db.prepare(`
          SELECT t.*, p.name as project_name, c.name as category_name
          FROM tasks t
          JOIN projects p ON t.project_id = p.id
          JOIN categories c ON p.category_id = c.id
          WHERE t.id = ?
        `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Task not found' });
    res.json(taskFromRow(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { project_id, parent_id, name, start_date, end_date, due_date, progress = 0, base_priority = 5 } = req.body;
    if (!project_id || !name || !start_date || !end_date) {
      return res.status(400).json({ error: 'project_id, name, start_date, end_date required' });
    }
    const proj = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(project_id, userId);
    if (!proj) return res.status(400).json({ error: 'Project not found' });
    const result = db.prepare(`
      INSERT INTO tasks (user_id, project_id, parent_id, name, start_date, end_date, due_date, progress, base_priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, project_id, parent_id || null, name, start_date, end_date, due_date || null, progress, base_priority);
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(taskFromRow(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/split/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { id } = req.params;
    const { subtasks } = req.body; // [{ name, start_date, end_date }, ...]
    if (!Array.isArray(subtasks) || subtasks.length < 2) {
      return res.status(400).json({ error: 'subtasks must be an array of at least 2 items with name, start_date, end_date' });
    }
    const parent = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!parent) return res.status(404).json({ error: 'Task not found' });

    const inserted = [];
    for (const st of subtasks) {
      if (!st.name || !st.start_date || !st.end_date) continue;
      const result = db.prepare(`
        INSERT INTO tasks (user_id, project_id, parent_id, name, start_date, end_date, due_date, progress, base_priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, parent.project_id, id, st.name, st.start_date, st.end_date, parent.due_date, 0, parent.base_priority);
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
      inserted.push(taskFromRow(row));
    }
    db.prepare('UPDATE tasks SET progress = 0 WHERE id = ? AND user_id = ?').run(id, userId);
    res.status(201).json({ parent: taskFromRow(parent), children: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { project_id, name, start_date, end_date, due_date, progress, completed, base_priority } = req.body;
    const updates = [];
    const params = [];
    if (project_id !== undefined) { updates.push('project_id = ?'); params.push(project_id); }
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date); }
    if (end_date !== undefined) { updates.push('end_date = ?'); params.push(end_date); }
    if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date); }
    if (progress !== undefined) { updates.push('progress = ?'); params.push(progress); }
    if (base_priority !== undefined) { updates.push('base_priority = ?'); params.push(base_priority); }
    if (completed !== undefined) {
      updates.push('completed = ?', "completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END");
      params.push(completed ? 1 : 0, completed ? 1 : 0);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    if (userId) {
      params.push(id, userId);
      db.prepare(`UPDATE tasks SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(...params);
    } else {
      params.push(id);
      db.prepare(`UPDATE tasks SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    }
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.json(taskFromRow(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { cascade } = req.query;
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const children = db.prepare('SELECT id FROM tasks WHERE parent_id = ? AND user_id = ?').all(req.params.id, userId);
    if (children.length > 0 && cascade !== 'true') {
      return res.status(400).json({ error: 'Task has children. Use ?cascade=true to delete with children.' });
    }
    db.prepare('DELETE FROM tasks WHERE (id = ? OR parent_id = ?) AND user_id = ?').run(req.params.id, req.params.id, userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
