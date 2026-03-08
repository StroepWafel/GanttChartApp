import express from 'express';
import db from '../db.js';
import { computeUrgency } from '../lib/priority.js';
import { requireApiKey } from '../auth.js';

const router = express.Router();
router.use(requireApiKey);

/** Load api_space_filter from user_preferences. Returns array like ['personal', 1, 2] or null/[] for no filter. */
function getApiSpaceFilter(userId) {
  const row = db.prepare('SELECT value FROM user_preferences WHERE user_id = ? AND key = ?').get(userId, 'api_space_filter');
  if (!row?.value) return null;
  try {
    const arr = JSON.parse(row.value);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr;
  } catch {
    return null;
  }
}

/** Returns { sql, params } for space filter. Use with tasks/projects/categories queries. spaceCol = 'COALESCE(p.space_id, c.space_id)' or 'c.space_id' for category-only. */
function getSpaceFilterClause(userId, spaceCol = 'COALESCE(p.space_id, c.space_id)') {
  const filter = getApiSpaceFilter(userId);
  if (!filter || filter.length === 0) return { sql: '', params: [] };
  const hasPersonal = filter.includes('personal');
  const spaceIds = filter.filter((x) => typeof x === 'number');
  const parts = [];
  const params = [];
  if (hasPersonal) parts.push(`(${spaceCol} IS NULL)`);
  if (spaceIds.length > 0) {
    const placeholders = spaceIds.map(() => '?').join(', ');
    parts.push(`(${spaceCol} IN (${placeholders}))`);
    params.push(...spaceIds);
  }
  if (parts.length === 0) return { sql: '', params: [] };
  return { sql: ` AND (${parts.join(' OR ')})`, params };
}

/** SQL fragments to exclude hidden-from-API items. */
const API_VISIBLE_PROJECT_SQL = ' AND (p.api_visible IS NULL OR p.api_visible = 1)';
const API_VISIBLE_CAT_SQL = ' AND (c.api_visible IS NULL OR c.api_visible = 1)';
const API_VISIBLE_TASK_SQL = ' AND (t.api_visible IS NULL OR t.api_visible = 1)';
/** Combined for task queries (t, p, c). */
const API_VISIBLE_SQL = API_VISIBLE_PROJECT_SQL + API_VISIBLE_CAT_SQL + API_VISIBLE_TASK_SQL;

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
    const { sql: spaceSql, params: spaceParams } = getSpaceFilterClause(userId);
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id AND p.user_id = ?
      JOIN categories c ON p.category_id = c.id AND c.user_id = ?
      WHERE t.user_id = ?${spaceSql}${API_VISIBLE_SQL}
      ORDER BY t.start_date
    `).all(userId, userId, userId, ...spaceParams);
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows.map(taskFromRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/most-important-task', (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 1));
    const { sql: spaceSql, params: spaceParams } = getSpaceFilterClause(userId);
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id AND p.user_id = ?
      JOIN categories c ON p.category_id = c.id AND c.user_id = ?
      WHERE t.user_id = ? AND t.completed = 0 AND (t.base_priority IS NULL OR t.base_priority > 1)${spaceSql}${API_VISIBLE_SQL}
    `).all(userId, userId, userId, ...spaceParams);
    const withUrgency = rows.map(r => ({ ...taskFromRow(r) }));
    const sorted = withUrgency.sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
    const tasks = sorted.slice(0, limit);
    if (limit === 1) {
      const task = tasks[0] || null;
      res.json(task ? { servertime: servertime(), servertime_local: servertimeLocal(), ...task } : { servertime: servertime(), servertime_local: servertimeLocal(), data: null });
    } else {
      res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: tasks });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const userId = req.user.userId;
    const { sql: spaceSql, params: spaceParams } = getSpaceFilterClause(userId);
    const baseFrom = `FROM tasks t JOIN projects p ON t.project_id = p.id AND p.user_id = ? JOIN categories c ON p.category_id = c.id AND c.user_id = ? WHERE t.user_id = ?${spaceSql}${API_VISIBLE_SQL}`;
    const total = db.prepare(`SELECT COUNT(*) as c ${baseFrom}`).get(userId, userId, userId, ...spaceParams).c;
    const completed = db.prepare(`SELECT COUNT(*) as c ${baseFrom} AND t.completed = 1`).get(userId, userId, userId, ...spaceParams).c;
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
    const { sql: spaceSql, params: spaceParams } = getSpaceFilterClause(userId);
    const baseFrom = `FROM tasks t JOIN projects p ON t.project_id = p.id AND p.user_id = ? JOIN categories c ON p.category_id = c.id AND c.user_id = ? WHERE t.user_id = ?${spaceSql}${API_VISIBLE_SQL}`;
    const total = db.prepare(`SELECT COUNT(*) as c ${baseFrom}`).get(userId, userId, userId, ...spaceParams).c;
    const completed = db.prepare(`SELECT COUNT(*) as c ${baseFrom} AND t.completed = 1`).get(userId, userId, userId, ...spaceParams).c;
    const ratio = total > 0 ? completed / total : 0;
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), efficiency: Math.round(ratio * 100), ratio, completed, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/by-category', (req, res) => {
  try {
    const userId = req.user.userId;
    const { sql: spaceSql, params: spaceParams } = getSpaceFilterClause(userId);
    const rows = db.prepare(`
      SELECT c.id, c.name, COUNT(t.id) as task_count
      FROM categories c
      LEFT JOIN projects p ON p.category_id = c.id AND p.user_id = ?
      LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = ?
      WHERE c.user_id = ?${spaceSql}
      GROUP BY c.id
      ORDER BY c.display_order, c.name
    `).all(userId, userId, userId, ...spaceParams);
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/overdue', (req, res) => {
  try {
    const userId = req.user.userId;
    const { sql: spaceSql, params: spaceParams } = getSpaceFilterClause(userId);
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id AND p.user_id = ?
      JOIN categories c ON p.category_id = c.id AND c.user_id = ?
      WHERE t.user_id = ? AND t.completed = 0 AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')${spaceSql}${API_VISIBLE_SQL}
      ORDER BY t.due_date
    `).all(userId, userId, userId, ...spaceParams);
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows.map(taskFromRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/upcoming', (req, res) => {
  try {
    const userId = req.user.userId;
    const days = parseInt(req.query.days, 10) || 7;
    const { sql: spaceSql, params: spaceParams } = getSpaceFilterClause(userId);
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id AND p.user_id = ?
      JOIN categories c ON p.category_id = c.id AND c.user_id = ?
      WHERE t.user_id = ? AND t.completed = 0 AND t.due_date IS NOT NULL
        AND date(t.due_date) >= date('now')
        AND date(t.due_date) <= date('now', ? || ' days')${spaceSql}${API_VISIBLE_SQL}
      ORDER BY t.due_date
    `).all(userId, userId, userId, days, ...spaceParams);
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows.map(taskFromRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects', (req, res) => {
  try {
    const userId = req.user.userId;
    const { sql: spaceSql, params: spaceParams } = getSpaceFilterClause(userId);
    const rows = db.prepare(`
      SELECT p.*, c.name as category_name,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND user_id = ?) as task_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND user_id = ? AND completed = 1) as completed_count
      FROM projects p
      JOIN categories c ON p.category_id = c.id AND c.user_id = ?
      WHERE p.user_id = ?${spaceSql}${API_VISIBLE_PROJECT_SQL}${API_VISIBLE_CAT_SQL}
      ORDER BY c.display_order, p.name
    `).all(userId, userId, userId, ...spaceParams);
    res.json({ servertime: servertime(), servertime_local: servertimeLocal(), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', (req, res) => {
  try {
    const userId = req.user.userId;
    const { sql: spaceSql, params: spaceParams } = getSpaceFilterClause(userId, 'c.space_id');
    const rows = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM projects p JOIN tasks t ON t.project_id = p.id AND t.user_id = ? WHERE p.category_id = c.id AND p.user_id = ? AND (p.api_visible IS NULL OR p.api_visible = 1) AND (t.api_visible IS NULL OR t.api_visible = 1)) as task_count
      FROM categories c
      WHERE c.user_id = ?${spaceSql}${API_VISIBLE_CAT_SQL}
      ORDER BY c.display_order, c.name
    `).all(userId, userId, userId, ...spaceParams);
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

    const { sql: spaceSql, params: spaceParams } = getSpaceFilterClause(userId);
    const spaceSqlCat = getSpaceFilterClause(userId, 'c.space_id');

    for (const ep of endpoints) {
      if (ep === 'tasks') {
        const rows = db.prepare(`
          SELECT t.*, p.name as project_name, c.name as category_name
          FROM tasks t
          JOIN projects p ON t.project_id = p.id AND p.user_id = ?
          JOIN categories c ON p.category_id = c.id AND c.user_id = ?
          WHERE t.user_id = ?${spaceSql}${API_VISIBLE_SQL}
          ORDER BY t.start_date
        `).all(userId, userId, userId, ...spaceParams);
        out.tasks = { data: rows.map(taskFromRow) };
      } else if (ep === 'stats') {
        const baseFrom = `FROM tasks t JOIN projects p ON t.project_id = p.id AND p.user_id = ? JOIN categories c ON p.category_id = c.id AND c.user_id = ? WHERE t.user_id = ?${spaceSql}${API_VISIBLE_SQL}`;
        const total = db.prepare(`SELECT COUNT(*) as c ${baseFrom}`).get(userId, userId, userId, ...spaceParams).c;
        const completed = db.prepare(`SELECT COUNT(*) as c ${baseFrom} AND t.completed = 1`).get(userId, userId, userId, ...spaceParams).c;
        out.stats = { total, completed, todo: total - completed, efficiency: total > 0 ? Math.round((completed / total) * 100) : 0 };
      } else if (ep === 'overdue') {
        const rows = db.prepare(`
          SELECT t.*, p.name as project_name, c.name as category_name
          FROM tasks t
          JOIN projects p ON t.project_id = p.id AND p.user_id = ?
          JOIN categories c ON p.category_id = c.id AND c.user_id = ?
          WHERE t.user_id = ? AND t.completed = 0 AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')${spaceSql}${API_VISIBLE_SQL}
          ORDER BY t.due_date
        `).all(userId, userId, userId, ...spaceParams);
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
            AND date(t.due_date) <= date('now', ? || ' days')${spaceSql}${API_VISIBLE_SQL}
          ORDER BY t.due_date
        `).all(userId, userId, userId, days, ...spaceParams);
        out.upcoming = { data: rows.map(taskFromRow) };
      } else if (ep === 'by-category') {
        const rows = db.prepare(`
          SELECT c.id, c.name, COUNT(t.id) as task_count
          FROM categories c
          LEFT JOIN projects p ON p.category_id = c.id AND p.user_id = ?
          LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = ?
          WHERE c.user_id = ?${spaceSql}${API_VISIBLE_CAT_SQL} AND (p.api_visible IS NULL OR p.api_visible = 1) AND (t.api_visible IS NULL OR t.api_visible = 1)
          GROUP BY c.id
          ORDER BY c.display_order, c.name
        `).all(userId, userId, userId, ...spaceParams);
        out['by-category'] = { data: rows };
      } else if (ep === 'projects') {
        const rows = db.prepare(`
          SELECT p.*, c.name as category_name,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND user_id = ?) as task_count,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND user_id = ? AND completed = 1) as completed_count
          FROM projects p
          JOIN categories c ON p.category_id = c.id AND c.user_id = ?
          WHERE p.user_id = ?${spaceSql}${API_VISIBLE_PROJECT_SQL}${API_VISIBLE_CAT_SQL}
          ORDER BY c.display_order, p.name
        `).all(userId, userId, userId, ...spaceParams);
        out.projects = { data: rows };
      } else if (ep === 'categories') {
        const rows = db.prepare(`
          SELECT c.*, (SELECT COUNT(*) FROM projects p JOIN tasks t ON t.project_id = p.id AND t.user_id = ? WHERE p.category_id = c.id AND p.user_id = ? AND (p.api_visible IS NULL OR p.api_visible = 1) AND (t.api_visible IS NULL OR t.api_visible = 1)) as task_count
          FROM categories c
          WHERE c.user_id = ?${spaceSqlCat.sql}${API_VISIBLE_CAT_SQL}
          ORDER BY c.display_order, c.name
        `).all(userId, userId, userId, ...spaceSqlCat.params);
        out.categories = { data: rows };
      } else if (ep === 'efficiency') {
        const baseFrom = `FROM tasks t JOIN projects p ON t.project_id = p.id AND p.user_id = ? JOIN categories c ON p.category_id = c.id AND c.user_id = ? WHERE t.user_id = ?${spaceSql}${API_VISIBLE_SQL}`;
        const total = db.prepare(`SELECT COUNT(*) as c ${baseFrom}`).get(userId, userId, userId, ...spaceParams).c;
        const completed = db.prepare(`SELECT COUNT(*) as c ${baseFrom} AND t.completed = 1`).get(userId, userId, userId, ...spaceParams).c;
        out.efficiency = { efficiency: total > 0 ? Math.round((completed / total) * 100) : 0, ratio: total > 0 ? completed / total : 0, completed, total };
      } else if (ep === 'most-important-task') {
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 1));
        const rows = db.prepare(`
          SELECT t.*, p.name as project_name, c.name as category_name
          FROM tasks t
          JOIN projects p ON t.project_id = p.id AND p.user_id = ?
          JOIN categories c ON p.category_id = c.id AND c.user_id = ?
          WHERE t.user_id = ? AND t.completed = 0 AND (t.base_priority IS NULL OR t.base_priority > 1)${spaceSql}${API_VISIBLE_SQL}
        `).all(userId, userId, userId, ...spaceParams);
        const sorted = rows.map((r) => taskFromRow(r)).sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
        const tasks = sorted.slice(0, limit);
        out['most-important-task'] = limit === 1 ? (tasks[0] || null) : { data: tasks };
      }
    }
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
