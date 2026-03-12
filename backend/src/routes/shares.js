import express from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { canAccess } from '../lib/shareAccess.js';
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.user?.userId) return res.status(401).json({ error: 'Authentication required' });
  next();
}

/** Get link info by token (no auth) - for join links: isJoinLink, spaceName, role, used, spaceId */
router.get('/link-info', (req, res) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token required' });
    }
    const link = db.prepare(`
      SELECT sl.id, sl.item_type, sl.item_id, sl.is_join_link, sl.join_role, sl.used_at,
             s.name as space_name
      FROM share_links sl
      LEFT JOIN spaces s ON sl.item_type = 'space' AND sl.item_id = s.id
      WHERE sl.token = ? AND (sl.expires_at IS NULL OR sl.expires_at > datetime('now'))
    `).get(token);
    if (!link) return res.status(404).json({ error: 'Link not found or expired' });
    if (!link.is_join_link || link.item_type !== 'space') {
      return res.json({ isJoinLink: false });
    }
    res.json({
      isJoinLink: true,
      spaceId: link.item_id,
      spaceName: link.space_name || 'Space',
      role: link.join_role || 'member',
      used: !!link.used_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(requireAuth);

/** Redeem a one-time join link - adds current user to space as member/admin */
router.post('/redeem-join', (req, res) => {
  try {
    const userId = req.user.userId;
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token required' });
    }
    const link = db.prepare(`
      SELECT id, item_type, item_id, is_join_link, join_role, used_at
      FROM share_links
      WHERE token = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(token);
    if (!link) return res.status(404).json({ error: 'Link not found or expired' });
    if (!link.is_join_link || link.item_type !== 'space') {
      return res.status(400).json({ error: 'Not a valid join link' });
    }
    if (link.used_at) {
      return res.status(400).json({ error: 'This link has already been used' });
    }
    const spaceId = link.item_id;
    const role = link.join_role === 'admin' ? 'admin' : 'member';
    const existing = db.prepare('SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?').get(spaceId, userId);
    if (existing) {
      db.prepare('UPDATE share_links SET used_at = datetime(\'now\') WHERE id = ?').run(link.id);
      return res.json({ ok: true, spaceId, spaceName: null, alreadyMember: true });
    }
    db.prepare('INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)').run(spaceId, userId, role);
    db.prepare('UPDATE share_links SET used_at = datetime(\'now\') WHERE id = ?').run(link.id);
    const space = db.prepare('SELECT name FROM spaces WHERE id = ?').get(spaceId);
    res.json({ ok: true, spaceId, spaceName: space?.name || 'Space', alreadyMember: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
      SELECT id, token, item_type, item_id, permission, expires_at, created_at, is_join_link, join_role, used_at
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
    const { item_type, item_id, permission, expires_days, join_link, join_role } = req.body;
    if (!item_type || !item_id) return res.status(400).json({ error: 'item_type, item_id required' });
    const validTypes = ['category', 'project', 'task', 'space'];
    if (!validTypes.includes(item_type)) return res.status(400).json({ error: 'item_type must be category, project, task, or space' });
    const isJoinLink = !!join_link;
    if (isJoinLink && item_type !== 'space') {
      return res.status(400).json({ error: 'Join links are only supported for spaces' });
    }
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
    const role = isJoinLink ? (join_role === 'admin' ? 'admin' : 'member') : null;
    const token = randomUUID();
    let expiresAt = null;
    if (!isJoinLink && expires_days && typeof expires_days === 'number' && expires_days > 0) {
      const d = new Date();
      d.setDate(d.getDate() + expires_days);
      expiresAt = d.toISOString();
    }
    const result = db.prepare(`
      INSERT INTO share_links (owner_id, token, item_type, item_id, permission, expires_at, is_join_link, join_role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, token, item_type, item_id, perm, expiresAt, isJoinLink ? 1 : 0, role);
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
