import express from 'express';
import db from '../db.js';
import { computeUrgency } from '../lib/priority.js';
import { requireApiKey } from '../auth.js';

const router = express.Router();
router.use(requireApiKey);

function servertime() {
  return new Date().toISOString();
}

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
    const userId = req.user.userId;
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id AND p.user_id = ?
      JOIN categories c ON p.category_id = c.id AND c.user_id = ?
      WHERE t.user_id = ?
      ORDER BY t.start_date
    `).all(userId, userId, userId);
    res.json({ servertime: servertime(), data: rows.map(taskFromRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/most-important-task', (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id AND p.user_id = ?
      JOIN categories c ON p.category_id = c.id AND c.user_id = ?
      WHERE t.user_id = ? AND t.completed = 0 AND (t.base_priority IS NULL OR t.base_priority > 1)
    `).all(userId, userId, userId);
    const withUrgency = rows.map(r => ({ ...taskFromRow(r) }));
    const sorted = withUrgency.sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
    const task = sorted[0] || null;
    res.json(task ? { servertime: servertime(), ...task } : { servertime: servertime(), data: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const userId = req.user.userId;
    const total = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ?').get(userId).c;
    const completed = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND completed = 1').get(userId).c;
    const todo = total - completed;
    const efficiency = total > 0 ? Math.round((completed / total) * 100) : 0;
    res.json({ servertime: servertime(), total, completed, todo, efficiency });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/efficiency', (req, res) => {
  try {
    const userId = req.user.userId;
    const total = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ?').get(userId).c;
    const completed = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND completed = 1').get(userId).c;
    const ratio = total > 0 ? completed / total : 0;
    res.json({ servertime: servertime(), efficiency: Math.round(ratio * 100), ratio, completed, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/by-category', (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = db.prepare(`
      SELECT c.id, c.name, COUNT(t.id) as task_count
      FROM categories c
      LEFT JOIN projects p ON p.category_id = c.id AND p.user_id = ?
      LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = ?
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.display_order, c.name
    `).all(userId, userId, userId);
    res.json({ servertime: servertime(), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/overdue', (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id AND p.user_id = ?
      JOIN categories c ON p.category_id = c.id AND c.user_id = ?
      WHERE t.user_id = ? AND t.completed = 0 AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')
      ORDER BY t.due_date
    `).all(userId, userId, userId);
    res.json({ servertime: servertime(), data: rows.map(taskFromRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/upcoming', (req, res) => {
  try {
    const userId = req.user.userId;
    const days = parseInt(req.query.days, 10) || 7;
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id AND p.user_id = ?
      JOIN categories c ON p.category_id = c.id AND c.user_id = ?
      WHERE t.user_id = ? AND t.completed = 0 AND t.due_date IS NOT NULL
        AND date(t.due_date) >= date('now')
        AND date(t.due_date) <= date('now', ? || ' days')
      ORDER BY t.due_date
    `).all(userId, userId, userId, days);
    res.json({ servertime: servertime(), data: rows.map(taskFromRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects', (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = db.prepare(`
      SELECT p.*, c.name as category_name,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND user_id = ?) as task_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND user_id = ? AND completed = 1) as completed_count
      FROM projects p
      JOIN categories c ON p.category_id = c.id AND c.user_id = ?
      WHERE p.user_id = ?
      ORDER BY c.display_order, p.name
    `).all(userId, userId, userId, userId);
    res.json({ servertime: servertime(), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM projects p JOIN tasks t ON t.project_id = p.id AND t.user_id = ? WHERE p.category_id = c.id AND p.user_id = ?) as task_count
      FROM categories c
      WHERE c.user_id = ?
      ORDER BY c.display_order, c.name
    `).all(userId, userId, userId);
    res.json({ servertime: servertime(), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
