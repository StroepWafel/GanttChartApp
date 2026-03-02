import express from 'express';
import db from '../db.js';
import { computeUrgency } from '../lib/priority.js';
import { validateName, validateDateRange, validatePriority } from '../validation.js';
import { sendWebhook } from '../webhook.js';
import { canAccess, getShareToken } from '../lib/shareAccess.js';

const router = express.Router();

function buildTaskAccessWhere(userId, shareToken) {
  if (!userId && !shareToken) return { sql: '1=1', params: [] };
  const parts = [];
  const params = [];
  if (userId) {
    parts.push(`(t.user_id = ? OR p.user_id = ? OR p.space_id IN (SELECT space_id FROM space_members WHERE user_id = ?)
      OR (c.space_id IS NOT NULL AND c.space_id IN (SELECT space_id FROM space_members WHERE user_id = ?))
      OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND item_type = 'task' AND item_id = t.id)
      OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND item_type = 'project' AND item_id = p.id)
      OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND item_type = 'category' AND item_id = p.category_id)
      OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND item_type = 'space' AND item_id = COALESCE(p.space_id, c.space_id) AND COALESCE(p.space_id, c.space_id) IS NOT NULL))`);
    params.push(userId, userId, userId, userId, userId, userId, userId, userId);
  }
  if (shareToken) {
    if (parts.length) parts.push('OR');
    parts.push(`(EXISTS (SELECT 1 FROM share_links sl WHERE sl.token = ? AND sl.item_type = 'task' AND sl.item_id = t.id AND (sl.expires_at IS NULL OR sl.expires_at > datetime('now')))
      OR EXISTS (SELECT 1 FROM share_links sl WHERE sl.token = ? AND sl.item_type = 'project' AND sl.item_id = p.id AND (sl.expires_at IS NULL OR sl.expires_at > datetime('now')))
      OR EXISTS (SELECT 1 FROM share_links sl WHERE sl.token = ? AND sl.item_type = 'category' AND sl.item_id = p.category_id AND (sl.expires_at IS NULL OR sl.expires_at > datetime('now')))
      OR EXISTS (SELECT 1 FROM share_links sl WHERE sl.token = ? AND sl.item_type = 'space' AND sl.item_id = COALESCE(p.space_id, c.space_id) AND (sl.expires_at IS NULL OR sl.expires_at > datetime('now')) AND COALESCE(p.space_id, c.space_id) IS NOT NULL))`);
    params.push(shareToken, shareToken, shareToken, shareToken);
  }
  return { sql: parts.length ? parts.join(' ') : '1=1', params };
}

function taskFromRow(row) {
  if (!row) return null;
  const task = {
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
    display_order: row.display_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    urgency: computeUrgency(row),
  };
  if (row.project_name != null) task.project_name = row.project_name;
  if (row.category_name != null) task.category_name = row.category_name;
  return task;
}

router.get('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    const shareToken = getShareToken(req);
    const { project_id, completed, include_completed, filter_scope, filter_collaborator, sort } = req.query;
    const { sql: accessSql, params: accessParams } = buildTaskAccessWhere(userId, shareToken);
    let sql = `
      SELECT t.*, p.name as project_name, c.name as category_name, c.display_order as category_order
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE ${accessSql}
    `;
    const params = [...accessParams];
    if (project_id) { sql += ' AND t.project_id = ?'; params.push(project_id); }
    if (completed === 'true') { sql += ' AND t.completed = 1'; }
    if (completed === 'false') { sql += ' AND t.completed = 0'; }
    if (include_completed !== 'true' && !completed) { sql += ' AND t.completed = 0'; }
    if (filter_scope && userId) {
      if (filter_scope === 'personal') {
        sql += ' AND t.user_id = ? AND p.space_id IS NULL AND c.space_id IS NULL';
        params.push(userId);
      } else if (filter_scope === 'shared') {
        sql += ' AND (p.space_id IS NOT NULL OR c.space_id IS NOT NULL OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND (item_type = \'task\' AND item_id = t.id OR item_type = \'project\' AND item_id = p.id OR item_type = \'category\' AND item_id = p.category_id)))';
        params.push(userId);
      } else if (filter_scope === 'spaces') {
        sql += ' AND (p.space_id IS NOT NULL OR c.space_id IS NOT NULL)';
      } else if (filter_scope.startsWith('space:')) {
        const spaceId = filter_scope.slice(6);
        sql += ' AND (p.space_id = ? OR c.space_id = ?)';
        params.push(spaceId, spaceId);
      }
    }
    if (filter_collaborator && filter_collaborator.startsWith('user:') && userId) {
      const cid = filter_collaborator.slice(5);
      sql += ` AND (t.user_id = ? OR p.user_id = ? OR c.user_id = ? OR EXISTS (SELECT 1 FROM space_members WHERE space_id = COALESCE(p.space_id, c.space_id) AND user_id = ?) OR EXISTS (SELECT 1 FROM user_shares WHERE (owner_id = ? OR target_user_id = ?)))`;
      params.push(cid, cid, cid, cid, cid, cid);
    }
    sql += ' ORDER BY ';
    if (sort === 'shared_first') {
      sql += 'CASE WHEN p.space_id IS NOT NULL OR c.space_id IS NOT NULL OR EXISTS (SELECT 1 FROM user_shares WHERE (item_type = \'task\' AND item_id = t.id) OR (item_type = \'project\' AND item_id = p.id) OR (item_type = \'category\' AND item_id = p.category_id)) THEN 0 ELSE 1 END, ';
    }
    sql += 'c.display_order, c.name, p.name, t.parent_id ASC, COALESCE(t.display_order, 0) ASC, t.start_date ASC';
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
    const shareToken = getShareToken(req);
    const { sql: accessSql, params: accessParams } = buildTaskAccessWhere(userId, shareToken);
    const sql = `
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE t.completed = 1 AND (${accessSql})
      ORDER BY t.completed_at DESC
    `;
    const rows = db.prepare(sql).all(...accessParams);
    res.json(rows.map(taskFromRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    const shareToken = getShareToken(req);
    const row = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE t.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Task not found' });
    const access = canAccess(userId, 'task', req.params.id, shareToken);
    if (!access.allowed) return res.status(404).json({ error: 'Task not found' });
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
    const nameVal = validateName(name);
    if (!nameVal.ok) return res.status(400).json({ error: nameVal.error });
    const dateVal = validateDateRange(start_date, end_date);
    if (!dateVal.ok) return res.status(400).json({ error: dateVal.error });
    const priVal = validatePriority(base_priority);
    if (!priVal.ok) return res.status(400).json({ error: priVal.error });
    const projAccess = canAccess(userId, 'project', project_id);
    if (!projAccess.allowed) return res.status(400).json({ error: 'Project not found' });
    if (projAccess.permission !== 'edit') return res.status(403).json({ error: 'View-only access to project' });
    const maxOrder = db.prepare('SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM tasks WHERE project_id = ? AND COALESCE(parent_id, 0) = COALESCE(?, 0)').get(project_id, parent_id ?? null);
    const displayOrder = maxOrder?.next_order ?? 0;
    const result = db.prepare(`
      INSERT INTO tasks (user_id, project_id, parent_id, name, start_date, end_date, due_date, progress, base_priority, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, project_id, parent_id || null, nameVal.value, start_date, end_date, due_date || null, progress, priVal.value, displayOrder);
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    const task = taskFromRow(row);
    sendWebhook(userId, 'task.created', task);
    res.status(201).json(task);
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
    const parent = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!parent) return res.status(404).json({ error: 'Task not found' });
    const parentAccess = canAccess(userId, 'task', id);
    if (!parentAccess.allowed || parentAccess.permission !== 'edit') return res.status(404).json({ error: 'Task not found' });

    const inserted = [];
    for (const st of subtasks) {
      if (!st.name || !st.start_date || !st.end_date) {
        return res.status(400).json({ error: 'Each subtask must have name, start_date, and end_date' });
      }
      const nameVal = validateName(st.name);
      if (!nameVal.ok) return res.status(400).json({ error: nameVal.error });
      const dateVal = validateDateRange(st.start_date, st.end_date);
      if (!dateVal.ok) return res.status(400).json({ error: dateVal.error });
      const maxOrder = db.prepare('SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM tasks WHERE project_id = ? AND parent_id = ?').get(parent.project_id, id);
        const subOrder = maxOrder?.next_order ?? 0;
        const result = db.prepare(`
        INSERT INTO tasks (user_id, project_id, parent_id, name, start_date, end_date, due_date, progress, base_priority, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, parent.project_id, id, nameVal.value, st.start_date, st.end_date, parent.due_date, 0, parent.base_priority, subOrder);
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
      inserted.push(taskFromRow(row));
    }
    db.prepare('UPDATE tasks SET progress = 0 WHERE id = ?').run(id);
    res.status(201).json({ parent: taskFromRow(parent), children: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/reorder', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { updates } = req.body; // [{ id, display_order }, ...]
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'updates must be a non-empty array of { id, display_order }' });
    }
    for (const u of updates) {
      if (typeof u.id !== 'number' && typeof u.id !== 'string') continue;
      const taskId = parseInt(String(u.id), 10);
      const order = typeof u.display_order === 'number' ? u.display_order : parseInt(String(u.display_order), 10);
      if (isNaN(taskId) || isNaN(order) || order < 0) continue;
      const acc = canAccess(userId, 'task', taskId);
      if (!acc.allowed || acc.permission !== 'edit') continue;
      db.prepare('UPDATE tasks SET display_order = ?, updated_at = datetime(\'now\') WHERE id = ?').run(order, taskId);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    const shareToken = getShareToken(req);
    const { id } = req.params;
    const access = canAccess(userId, 'task', id, shareToken);
    if (!access.allowed) return res.status(404).json({ error: 'Task not found' });
    if (access.permission !== 'edit') return res.status(403).json({ error: 'View-only access' });
    const { project_id, name, start_date, end_date, due_date, progress, completed, base_priority, display_order } = req.body;
    if (name !== undefined) {
      const nameVal = validateName(name);
      if (!nameVal.ok) return res.status(400).json({ error: nameVal.error });
      req.body.name = nameVal.value;
    }
    if (start_date !== undefined || end_date !== undefined) {
      const row = db.prepare('SELECT start_date, end_date FROM tasks WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'Task not found' });
      const sd = start_date !== undefined ? start_date : row.start_date;
      const ed = end_date !== undefined ? end_date : row.end_date;
      const dateVal = validateDateRange(sd, ed);
      if (!dateVal.ok) return res.status(400).json({ error: dateVal.error });
    }
    if (base_priority !== undefined) {
      const priVal = validatePriority(base_priority);
      if (!priVal.ok) return res.status(400).json({ error: priVal.error });
      req.body.base_priority = priVal.value;
    }
    const updates = [];
    const params = [];
    if (display_order !== undefined) { updates.push('display_order = ?'); params.push(display_order); }
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
    const wasCompleted = completed !== undefined
      ? db.prepare('SELECT completed FROM tasks WHERE id = ?').get(id)?.completed === 1
      : false;
    params.push(id);
    db.prepare(`UPDATE tasks SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    const row = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE t.id = ?
    `).get(id);
    const task = taskFromRow(row);
    if (userId) {
      if (completed === true && !wasCompleted) {
        sendWebhook(userId, 'task.completed', task);
      } else {
        sendWebhook(userId, 'task.updated', task);
      }
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const shareToken = getShareToken(req);
    const access = canAccess(userId, 'task', req.params.id, shareToken);
    if (!access.allowed) return res.status(404).json({ error: 'Task not found' });
    if (access.permission !== 'edit') return res.status(403).json({ error: 'View-only access' });
    const { cascade } = req.query;
    const taskRow = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as category_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE t.id = ?
    `).get(req.params.id);
    if (!taskRow) return res.status(404).json({ error: 'Task not found' });
    const children = db.prepare('SELECT id FROM tasks WHERE parent_id = ?').all(req.params.id);
    if (children.length > 0 && cascade !== 'true') {
      return res.status(400).json({ error: 'Task has children. Use ?cascade=true to delete with children.' });
    }
    const task = taskFromRow(taskRow);
    db.prepare('DELETE FROM tasks WHERE id = ? OR parent_id = ?').run(req.params.id, req.params.id);
    sendWebhook(userId, 'task.deleted', task);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
