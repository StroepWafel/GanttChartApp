import express from 'express';
import db from '../db.js';
import { computeUrgency } from '../lib/priority.js';
import { requireApiKey } from '../auth.js';

const router = express.Router();
router.use(requireApiKey);

function servertime() {
  return new Date().toISOString();
}

function servertimeLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(offsetMin) / 60));
  const om = pad(Math.abs(offsetMin) % 60);
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}${sign}${oh}:${om}`;
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
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows.map(taskFromRow) });
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
    res.json(task ? { servertime: servertime(), servertime_local: servertimeLocal(), ...task } : { servertime: servertime(), servertime_local: servertimeLocal(), data: null });
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
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), total, completed, todo, efficiency });
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
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), efficiency: Math.round(ratio * 100), ratio, completed, total });
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
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows });
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
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows.map(taskFromRow) });
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
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows.map(taskFromRow) });
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
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows });
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
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const BATCH_ALLOWED = new Set(['tasks', 'stats', 'efficiency', 'by-category', 'overdue', 'upcoming', 'projects', 'categories', 'most-important-task']);

router.get('/batch', (req, res) => {
  try {
    const raw = req.query.endpoints;
    const list = typeof raw === 'string' ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const endpoints = [...new Set(list)].filter((e) => BATCH_ALLOWED.has(e));
    const userId = req.user.userId;
    const st = servertime();
    const stLocal = servertimeLocal();
    const out = { servertime: st, servertime_local: stLocal };

    for (const ep of endpoints) {
      if (ep === 'tasks') {
        const rows = db.prepare(`
          SELECT t.*, p.name as project_name, c.name as category_name
          FROM tasks t
          JOIN projects p ON t.project_id = p.id AND p.user_id = ?
          JOIN categories c ON p.category_id = c.id AND c.user_id = ?
          WHERE t.user_id = ?
          ORDER BY t.start_date
        `).all(userId, userId, userId);
        out.tasks = { data: rows.map(taskFromRow) };
      } else if (ep === 'stats') {
        const total = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ?').get(userId).c;
        const completed = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND completed = 1').get(userId).c;
        out.stats = { total, completed, todo: total - completed, efficiency: total > 0 ? Math.round((completed / total) * 100) : 0 };
      } else if (ep === 'overdue') {
        const rows = db.prepare(`
          SELECT t.*, p.name as project_name, c.name as category_name
          FROM tasks t
          JOIN projects p ON t.project_id = p.id AND p.user_id = ?
          JOIN categories c ON p.category_id = c.id AND c.user_id = ?
          WHERE t.user_id = ? AND t.completed = 0 AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')
          ORDER BY t.due_date
        `).all(userId, userId, userId);
        out.overdue = { data: rows.map(taskFromRow) };
      } else if (ep === 'upcoming') {
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
        out.upcoming = { data: rows.map(taskFromRow) };
      } else if (ep === 'by-category') {
        const rows = db.prepare(`
          SELECT c.id, c.name, COUNT(t.id) as task_count
          FROM categories c
          LEFT JOIN projects p ON p.category_id = c.id AND p.user_id = ?
          LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = ?
          WHERE c.user_id = ?
          GROUP BY c.id
          ORDER BY c.display_order, c.name
        `).all(userId, userId, userId);
        out['by-category'] = { data: rows };
      } else if (ep === 'projects') {
        const rows = db.prepare(`
          SELECT p.*, c.name as category_name,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND user_id = ?) as task_count,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND user_id = ? AND completed = 1) as completed_count
          FROM projects p
          JOIN categories c ON p.category_id = c.id AND c.user_id = ?
          WHERE p.user_id = ?
          ORDER BY c.display_order, p.name
        `).all(userId, userId, userId, userId);
        out.projects = { data: rows };
      } else if (ep === 'categories') {
        const rows = db.prepare(`
          SELECT c.*, (SELECT COUNT(*) FROM projects p JOIN tasks t ON t.project_id = p.id AND t.user_id = ? WHERE p.category_id = c.id AND p.user_id = ?) as task_count
          FROM categories c
          WHERE c.user_id = ?
          ORDER BY c.display_order, c.name
        `).all(userId, userId, userId);
        out.categories = { data: rows };
      } else if (ep === 'efficiency') {
        const total = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ?').get(userId).c;
        const completed = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND completed = 1').get(userId).c;
        out.efficiency = { efficiency: total > 0 ? Math.round((completed / total) * 100) : 0, ratio: total > 0 ? completed / total : 0, completed, total };
      } else if (ep === 'most-important-task') {
        const rows = db.prepare(`
          SELECT t.*, p.name as project_name, c.name as category_name
          FROM tasks t
          JOIN projects p ON t.project_id = p.id AND p.user_id = ?
          JOIN categories c ON p.category_id = c.id AND c.user_id = ?
          WHERE t.user_id = ? AND t.completed = 0 AND (t.base_priority IS NULL OR t.base_priority > 1)
        `).all(userId, userId, userId);
        const sorted = rows.map((r) => taskFromRow(r)).sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
        out['most-important-task'] = sorted[0] || null;
      }
    }
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
