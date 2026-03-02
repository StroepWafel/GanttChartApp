import express from 'express';
import db from '../db.js';
import { validateName, validateDateRange } from '../validation.js';
import { canAccess, getShareToken } from '../lib/shareAccess.js';

const router = express.Router();

function buildProjectAccessWhere(userId, shareToken) {
  if (!userId && !shareToken) return { sql: '1=1', params: [] };
  const parts = [];
  const params = [];
  if (userId) {
    parts.push(`(p.user_id = ? OR p.space_id IN (SELECT space_id FROM space_members WHERE user_id = ?)
      OR (c.space_id IS NOT NULL AND c.space_id IN (SELECT space_id FROM space_members WHERE user_id = ?))
      OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND item_type = 'project' AND item_id = p.id)
      OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND item_type = 'category' AND item_id = p.category_id)
      OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND item_type = 'space' AND item_id = COALESCE(p.space_id, c.space_id) AND COALESCE(p.space_id, c.space_id) IS NOT NULL))`);
    params.push(userId, userId, userId, userId, userId, userId);
  }
  if (shareToken) {
    if (parts.length) parts.push('OR');
    parts.push(`(EXISTS (SELECT 1 FROM share_links WHERE token = ? AND item_type = 'project' AND item_id = p.id AND (expires_at IS NULL OR expires_at > datetime('now')))
      OR EXISTS (SELECT 1 FROM share_links WHERE token = ? AND item_type = 'category' AND item_id = p.category_id AND (expires_at IS NULL OR expires_at > datetime('now')))
      OR EXISTS (SELECT 1 FROM share_links WHERE token = ? AND item_type = 'space' AND item_id = COALESCE(p.space_id, c.space_id) AND (expires_at IS NULL OR expires_at > datetime('now')) AND COALESCE(p.space_id, c.space_id) IS NOT NULL))`);
    params.push(shareToken, shareToken, shareToken);
  }
  return { sql: parts.length ? parts.join(' ') : '1=1', params };
}

router.get('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    const shareToken = getShareToken(req);
    const { category_id, filter_scope, filter_collaborator, sort } = req.query;

    const { sql: accessSql, params: accessParams } = buildProjectAccessWhere(userId, shareToken);
    let sql = `
      SELECT p.*, c.name as category_name, c.display_order as category_order, s.name as space_name
      FROM projects p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN spaces s ON s.id = COALESCE(p.space_id, c.space_id)
      WHERE ${accessSql}
    `;
    const params = [...accessParams];
    if (category_id) {
      sql += ' AND p.category_id = ?';
      params.push(category_id);
    }
    if (filter_scope && userId) {
      if (filter_scope === 'personal') {
        sql += ' AND p.space_id IS NULL AND c.space_id IS NULL AND p.user_id = ?';
        params.push(userId);
      } else if (filter_scope === 'shared') {
        sql += ' AND (p.space_id IS NOT NULL OR c.space_id IS NOT NULL OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND (item_type = \'project\' AND item_id = p.id OR item_type = \'category\' AND item_id = p.category_id)))';
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
      sql += ` AND (p.user_id = ? OR c.user_id = ? OR EXISTS (SELECT 1 FROM space_members WHERE space_id = COALESCE(p.space_id, c.space_id) AND user_id = ?) OR EXISTS (SELECT 1 FROM user_shares WHERE (owner_id = ? OR target_user_id = ?) AND ((item_type = 'project' AND item_id = p.id) OR (item_type = 'category' AND item_id = p.category_id))))`;
      params.push(cid, cid, cid, cid, cid);
    }
    sql += ' ORDER BY ';
    if (sort === 'shared_first') {
      sql += 'CASE WHEN p.space_id IS NOT NULL OR c.space_id IS NOT NULL OR EXISTS (SELECT 1 FROM user_shares WHERE item_type = \'project\' AND item_id = p.id OR item_type = \'category\' AND item_id = p.category_id) THEN 0 ELSE 1 END, ';
    }
    sql += 'c.display_order, c.name, p.name';
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
    if (name !== undefined && name !== null) {
      const nameVal = validateName(name);
      if (!nameVal.ok) return res.status(400).json({ error: nameVal.error });
    }
    if (start_date && due_date) {
      const dateVal = validateDateRange(start_date, due_date);
      if (!dateVal.ok) return res.status(400).json({ error: dateVal.error });
    }
    const cat = db.prepare('SELECT id, user_id, space_id FROM categories WHERE id = ?').get(category_id);
    if (!cat) return res.status(400).json({ error: 'Category not found' });
    const catAccess = canAccess(userId, 'category', category_id);
    if (!catAccess.allowed) return res.status(403).json({ error: 'Category not found' });
    if (catAccess.permission !== 'edit') return res.status(403).json({ error: 'View-only access to category' });
    const spaceId = req.body.space_id || cat.space_id || null;
    const result = db.prepare(`
      INSERT INTO projects (user_id, space_id, name, category_id, due_date, start_date) VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, spaceId, name || 'New Project', category_id, due_date || null, start_date || null);
    const row = db.prepare('SELECT p.*, c.name as category_name FROM projects p JOIN categories c ON p.category_id = c.id WHERE p.id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    const shareToken = getShareToken(req);
    const { id } = req.params;
    const { name, category_id, due_date, start_date } = req.body;
    const access = canAccess(userId, 'project', id, shareToken);
    if (!access.allowed) return res.status(404).json({ error: 'Project not found' });
    if (access.permission !== 'edit') return res.status(403).json({ error: 'View-only access' });
    const updates = [];
    const params = [];
    if (name !== undefined) {
      const nameVal = validateName(name);
      if (!nameVal.ok) return res.status(400).json({ error: nameVal.error });
      updates.push('name = ?');
      params.push(nameVal.value);
    }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id); }
    if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date || null); }
    if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date || null); }
    if (start_date !== undefined && due_date !== undefined) {
      const dateVal = validateDateRange(start_date, due_date);
      if (!dateVal.ok) return res.status(400).json({ error: dateVal.error });
    }
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
    const userId = req.user?.userId;
    const shareToken = getShareToken(req);
    const access = canAccess(userId, 'project', req.params.id, shareToken);
    if (!access.allowed) return res.status(404).json({ error: 'Project not found' });
    if (access.permission !== 'edit') return res.status(403).json({ error: 'View-only access' });
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
