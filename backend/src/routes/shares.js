import express from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { canAccess } from '../lib/shareAccess.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.user?.userId) return res.status(401).json({ error: 'Authentication required' });
  next();
}

router.use(requireAuth);

/** List shares for current user (shared by me + shared with me) */
router.get('/', (req, res) => {
  try {
    const userId = req.user.userId;

    const sharedByMe = db.prepare(`
      SELECT us.id, us.target_user_id, us.item_type, us.item_id, us.permission, us.created_at,
             u.username as target_username
      FROM user_shares us
      JOIN users u ON u.id = us.target_user_id
      WHERE us.owner_id = ?
      ORDER BY us.created_at DESC
    `).all(userId);

    const sharedWithMe = db.prepare(`
      SELECT us.id, us.owner_id, us.item_type, us.item_id, us.permission, us.created_at,
             u.username as owner_username
      FROM user_shares us
      JOIN users u ON u.id = us.owner_id
      WHERE us.target_user_id = ?
      ORDER BY us.created_at DESC
    `).all(userId);

    const links = db.prepare(`
      SELECT id, token, item_type, item_id, permission, expires_at, created_at
      FROM share_links WHERE owner_id = ?
      ORDER BY created_at DESC
    `).all(userId);

    res.json({
      user_shares_by_me: sharedByMe,
      user_shares_with_me: sharedWithMe,
      share_links: links,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Share with user */
router.post('/users', (req, res) => {
  try {
    const userId = req.user.userId;
    const { item_type, item_id, target_user_id, permission } = req.body;
    if (!item_type || !item_id || !target_user_id) {
      return res.status(400).json({ error: 'item_type, item_id, target_user_id required' });
    }
    const validTypes = ['category', 'project', 'task', 'space'];
    if (!validTypes.includes(item_type)) return res.status(400).json({ error: 'item_type must be category, project, task, or space' });
    const perm = permission === 'edit' ? 'edit' : 'view';
    const access = canAccess(userId, item_type, item_id);
    if (!access.allowed || access.permission !== 'edit') {
      return res.status(403).json({ error: 'You do not have permission to share this item' });
    }
    if (item_type === 'space') {
      const member = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(item_id, userId);
      if (!member || member.role !== 'admin') {
        return res.status(403).json({ error: 'Only space admins can share this space' });
      }
    }
    if (parseInt(target_user_id, 10) === userId) {
      return res.status(400).json({ error: 'Cannot share with yourself' });
    }
    const targetUser = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(target_user_id);
    if (!targetUser) return res.status(400).json({ error: 'User not found' });
    try {
      const result = db.prepare(`
        INSERT INTO user_shares (owner_id, target_user_id, item_type, item_id, permission)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, target_user_id, item_type, item_id, perm);
      const row = db.prepare(`
        SELECT us.*, u.username as target_username
        FROM user_shares us
        JOIN users u ON u.id = us.target_user_id
        WHERE us.id = ?
      `).get(result.lastInsertRowid);
      res.status(201).json(row);
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Already shared with this user' });
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Remove user share */
router.delete('/users/:id', (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const row = db.prepare('SELECT owner_id FROM user_shares WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Share not found' });
    if (row.owner_id !== userId) return res.status(403).json({ error: 'You can only remove your own shares' });
    db.prepare('DELETE FROM user_shares WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Create share link */
router.post('/links', (req, res) => {
  try {
    const userId = req.user.userId;
    const { item_type, item_id, permission, expires_days } = req.body;
    if (!item_type || !item_id) return res.status(400).json({ error: 'item_type, item_id required' });
    const validTypes = ['category', 'project', 'task', 'space'];
    if (!validTypes.includes(item_type)) return res.status(400).json({ error: 'item_type must be category, project, task, or space' });
    const access = canAccess(userId, item_type, item_id);
    if (!access.allowed || access.permission !== 'edit') {
      return res.status(403).json({ error: 'You do not have permission to share this item' });
    }
    if (item_type === 'space') {
      const member = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(item_id, userId);
      if (!member || member.role !== 'admin') {
        return res.status(403).json({ error: 'Only space admins can share this space' });
      }
    }
    const perm = permission === 'edit' ? 'edit' : 'view';
    const token = randomUUID();
    let expiresAt = null;
    if (expires_days && typeof expires_days === 'number' && expires_days > 0) {
      const d = new Date();
      d.setDate(d.getDate() + expires_days);
      expiresAt = d.toISOString();
    }
    const result = db.prepare(`
      INSERT INTO share_links (owner_id, token, item_type, item_id, permission, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, token, item_type, item_id, perm, expiresAt);
    const row = db.prepare('SELECT * FROM share_links WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Revoke share link */
router.delete('/links/:id', (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const row = db.prepare('SELECT owner_id FROM share_links WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Share link not found' });
    if (row.owner_id !== userId) return res.status(403).json({ error: 'You can only revoke your own links' });
    db.prepare('DELETE FROM share_links WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** List my share links */
router.get('/links', (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = db.prepare(`
      SELECT id, token, item_type, item_id, permission, expires_at, created_at
      FROM share_links WHERE owner_id = ?
      ORDER BY created_at DESC
    `).all(userId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
