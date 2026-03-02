import express from 'express';
import db from '../db.js';
import { validateName } from '../validation.js';
import { canAccess, getShareToken } from '../lib/shareAccess.js';

const router = express.Router();

function withUserScope(req, fn) {
  if (!req.user?.userId) return fn(null);
  return fn(req.user.userId);
}

function buildCategoryAccessWhere(userId, shareToken) {
  // No auth and no token: return all (auth-disabled mode)
  if (!userId && !shareToken) return { sql: '1=1', params: [] };
  const conditions = [];
  const params = [];
  if (userId) {
    conditions.push('(c.user_id = ?');
    params.push(userId);
    conditions.push('OR c.space_id IN (SELECT space_id FROM space_members WHERE user_id = ?)');
    params.push(userId);
    conditions.push('OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND item_type = \'category\' AND item_id = c.id)');
    params.push(userId);
    conditions.push('OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND item_type = \'space\' AND item_id = c.space_id AND c.space_id IS NOT NULL))');
    params.push(userId);
  }
  if (shareToken) {
    if (conditions.length) conditions.push('OR');
    conditions.push('(EXISTS (SELECT 1 FROM share_links WHERE token = ? AND item_type = \'category\' AND item_id = c.id AND (expires_at IS NULL OR expires_at > datetime(\'now\')))');
    conditions.push('OR EXISTS (SELECT 1 FROM share_links WHERE token = ? AND item_type = \'space\' AND item_id = c.space_id AND c.space_id IS NOT NULL AND (expires_at IS NULL OR expires_at > datetime(\'now\'))))');
    params.push(shareToken, shareToken);
  }
  return { sql: conditions.length ? conditions.join(' ') : '1=1', params };
}

router.get('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    const shareToken = getShareToken(req);
    const { filter_scope, filter_collaborator, sort } = req.query;

    const { sql: accessSql, params: accessParams } = buildCategoryAccessWhere(userId, shareToken);

    let sql = `SELECT c.*, s.name as space_name FROM categories c LEFT JOIN spaces s ON s.id = c.space_id WHERE ${accessSql}`;
    const params = [...accessParams];

    if (filter_scope && userId) {
      if (filter_scope === 'personal') {
        sql += ' AND c.space_id IS NULL AND c.user_id = ?';
        params.push(userId);
      } else if (filter_scope === 'shared') {
        sql += ' AND (c.space_id IS NOT NULL OR EXISTS (SELECT 1 FROM user_shares WHERE target_user_id = ? AND item_type = \'category\' AND item_id = c.id))';
        params.push(userId);
      } else if (filter_scope === 'spaces') {
        sql += ' AND c.space_id IS NOT NULL';
      } else if (filter_scope.startsWith('space:')) {
        const spaceId = filter_scope.slice(6);
        sql += ' AND c.space_id = ?';
        params.push(spaceId);
      }
    }
    if (filter_collaborator && filter_collaborator.startsWith('user:') && userId) {
      const collaboratorId = filter_collaborator.slice(5);
      sql += ` AND (c.user_id = ? OR EXISTS (SELECT 1 FROM space_members WHERE space_id = c.space_id AND user_id = ?) OR EXISTS (SELECT 1 FROM user_shares WHERE (owner_id = ? OR target_user_id = ?) AND item_type = 'category' AND item_id = c.id))`;
      params.push(collaboratorId, collaboratorId, collaboratorId, collaboratorId);
    }

    sql += ' ORDER BY ';
    if (sort === 'shared_first') {
      sql += 'CASE WHEN c.space_id IS NOT NULL OR EXISTS (SELECT 1 FROM user_shares WHERE item_type = \'category\' AND item_id = c.id) THEN 0 ELSE 1 END, ';
    }
    sql += 'c.display_order ASC, c.name ASC';

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
    const { name, display_order = 0, space_id } = req.body;
    const finalName = name || 'Uncategorized';
    const nameVal = validateName(finalName);
    if (!nameVal.ok) return res.status(400).json({ error: nameVal.error });
    let spaceId = null;
    if (space_id) {
      const member = db.prepare('SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?').get(space_id, userId);
      if (!member) return res.status(403).json({ error: 'Not a member of this space' });
      spaceId = space_id;
    }
    const result = db.prepare(`
      INSERT INTO categories (user_id, space_id, name, display_order) VALUES (?, ?, ?, ?)
    `).run(userId, spaceId, nameVal.value, display_order);
    const row = db.prepare('SELECT c.*, s.name as space_name FROM categories c LEFT JOIN spaces s ON s.id = c.space_id WHERE c.id = ?').get(result.lastInsertRowid);
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
    const { name, display_order } = req.body;
    const access = canAccess(userId, 'category', id, shareToken);
    if (!access.allowed) return res.status(404).json({ error: 'Category not found' });
    if (access.permission !== 'edit') return res.status(403).json({ error: 'View-only access' });
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
    params.push(id);
    db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const userId = req.user?.userId;
    const shareToken = getShareToken(req);
    const access = canAccess(userId, 'category', req.params.id, shareToken);
    if (!access.allowed) return res.status(404).json({ error: 'Category not found' });
    if (access.permission !== 'edit') return res.status(403).json({ error: 'View-only access' });
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
