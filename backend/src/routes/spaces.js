import express from 'express';
import db from '../db.js';
import { validateName } from '../validation.js';
import { optionalAuth } from '../auth.js';

const router = express.Router();
router.use(optionalAuth);

function requireAuth(req, res, next) {
  if (!req.user?.userId) return res.status(401).json({ error: 'Authentication required' });
  next();
}

/** List spaces the user is a member of */
router.get('/', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = db.prepare(`
      SELECT s.id, s.name, s.created_by, s.created_at,
             sm.role,
             (SELECT COUNT(*) FROM space_members WHERE space_id = s.id) as member_count
      FROM spaces s
      JOIN space_members sm ON sm.space_id = s.id AND sm.user_id = ?
      ORDER BY s.name
    `).all(userId);
    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_by: r.created_by,
      created_at: r.created_at,
      role: r.role,
      member_count: r.member_count,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Create space */
router.post('/', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const { name } = req.body;
    const nameVal = validateName(name || 'New Space');
    if (!nameVal.ok) return res.status(400).json({ error: nameVal.error });
    const result = db.prepare(`
      INSERT INTO spaces (name, created_by) VALUES (?, ?)
    `).run(nameVal.value, userId);
    const spaceId = result.lastInsertRowid;
    db.prepare(`
      INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, 'admin')
    `).run(spaceId, userId);
    const row = db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Update space name (admin of space only) */
router.patch('/:id', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { name } = req.body;
    const member = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(id, userId);
    if (!member) return res.status(404).json({ error: 'Space not found' });
    if (member.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
    const nameVal = validateName(name);
    if (!nameVal.ok) return res.status(400).json({ error: nameVal.error });
    db.prepare('UPDATE spaces SET name = ? WHERE id = ?').run(nameVal.value, id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Delete space (admin of space only) */
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const member = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(id, userId);
    if (!member) return res.status(404).json({ error: 'Space not found' });
    if (member.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
    db.prepare('DELETE FROM spaces WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** List space members */
router.get('/:id/members', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const member = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(id, userId);
    if (!member) return res.status(404).json({ error: 'Space not found' });
    const rows = db.prepare(`
      SELECT sm.user_id, sm.role, u.username
      FROM space_members sm
      JOIN users u ON u.id = sm.user_id
      WHERE sm.space_id = ?
      ORDER BY sm.role DESC, u.username
    `).all(id);
    res.json(rows.map((r) => ({ user_id: r.user_id, username: r.username, role: r.role })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Invite user to space */
router.post('/:id/members', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { user_id, role = 'member' } = req.body;
    const member = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(id, userId);
    if (!member) return res.status(404).json({ error: 'Space not found' });
    if (member.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const targetUser = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(user_id);
    if (!targetUser) return res.status(400).json({ error: 'User not found' });
    const roleVal = role === 'admin' ? 'admin' : 'member';
    try {
      db.prepare(`
        INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)
      `).run(id, user_id, roleVal);
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return res.status(400).json({ error: 'User is already a member' });
      throw e;
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Remove member from space */
router.delete('/:id/members/:userId', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const { id, userId: targetUserId } = req.params;
    const member = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(id, userId);
    if (!member) return res.status(404).json({ error: 'Space not found' });
    if (member.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
    db.prepare('DELETE FROM space_members WHERE space_id = ? AND user_id = ?').run(id, targetUserId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Leave space */
router.post('/:id/leave', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const member = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(id, userId);
    if (!member) return res.status(404).json({ error: 'Space not found' });
    if (member.role === 'admin') {
      const adminCount = db.prepare('SELECT COUNT(*) as c FROM space_members WHERE space_id = ? AND role = ?').get(id, 'admin');
      if (adminCount.c <= 1) {
        return res.status(400).json({ error: 'Cannot leave: you are the only admin. Assign another admin or delete the space.' });
      }
    }
    db.prepare('DELETE FROM space_members WHERE space_id = ? AND user_id = ?').run(id, userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
