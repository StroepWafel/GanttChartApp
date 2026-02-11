import express from 'express';
import db from '../db.js';
import { computeUrgency } from '../lib/priority.js';
import { requireApiKey } from '../auth.js';

const router = express.Router();
router.use(requireApiKey);

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
    urgency: computeUrgency(row),
  };
}

router.get('/tasks', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN categories c ON p.category_id = c.id
      ORDER BY t.start_date
    `).all();
    res.json(rows.map(taskFromRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/most-important-task', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE t.completed = 0
    `).all();
    const withUrgency = rows.map(r => ({ ...taskFromRow(r) }));
    const sorted = withUrgency.sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
    res.json(sorted[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
    const completed = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE completed = 1').get().c;
    const todo = total - completed;
    const efficiency = total > 0 ? Math.round((completed / total) * 100) : 0;
    res.json({ total, completed, todo, efficiency });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/efficiency', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
    const completed = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE completed = 1').get().c;
    const ratio = total > 0 ? completed / total : 0;
    res.json({ efficiency: Math.round(ratio * 100), ratio, completed, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/by-category', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.id, c.name, COUNT(t.id) as task_count
      FROM categories c
      LEFT JOIN projects p ON p.category_id = c.id
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY c.id
      ORDER BY c.display_order, c.name
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/overdue', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE t.completed = 0 AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')
      ORDER BY t.due_date
    `).all();
    res.json(rows.map(taskFromRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/upcoming', (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE t.completed = 0 AND t.due_date IS NOT NULL
        AND date(t.due_date) >= date('now')
        AND date(t.due_date) <= date('now', ? || ' days')
      ORDER BY t.due_date
    `).all(days);
    res.json(rows.map(taskFromRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.*, c.name as category_name,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) as completed_count
      FROM projects p
      JOIN categories c ON p.category_id = c.id
      ORDER BY c.display_order, p.name
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM projects p JOIN tasks t ON t.project_id = p.id WHERE p.category_id = c.id) as task_count
      FROM categories c
      ORDER BY c.display_order, c.name
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
