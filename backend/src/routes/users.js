import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { optionalAuth, requireAdmin } from '../auth.js';

const router = express.Router();

router.get('/me', optionalAuth, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const user = db.prepare(
    'SELECT id, username, is_admin, api_key, created_at, email, must_change_password FROM users WHERE id = ?'
  ).get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user.id,
    username: user.username,
    isAdmin: !!user.is_admin,
    apiKey: user.api_key,
    createdAt: user.created_at,
    email: user.email ?? undefined,
    mustChangePassword: !!(user.must_change_password),
  });
});

/** List users that can be shared with (all active users except self). Any authenticated user. */
router.get('/shareable', optionalAuth, (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ error: 'Authentication required' });
  const rows = db.prepare(`
    SELECT id, username FROM users WHERE is_active = 1 AND id != ? ORDER BY username
  `).all(req.user.userId);
  res.json(rows);
});

/** List collaborators (share targets, share owners, space co-members). Any authenticated user. */
router.get('/collaborators', optionalAuth, (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ error: 'Authentication required' });
  const userId = req.user.userId;
  const byShare = db.prepare(`
    SELECT DISTINCT u.id, u.username FROM users u
    WHERE u.id IN (
      SELECT owner_id FROM user_shares WHERE target_user_id = ?
      UNION SELECT target_user_id FROM user_shares WHERE owner_id = ?
    ) AND u.id != ?
  `).all(userId, userId, userId);
  const bySpace = db.prepare(`
    SELECT DISTINCT u.id, u.username FROM users u
    JOIN space_members sm ON sm.user_id = u.id
    WHERE sm.space_id IN (SELECT space_id FROM space_members WHERE user_id = ?)
    AND u.id != ?
  `).all(userId, userId);
  const seen = new Set();
  const out = [];
  for (const r of [...byShare, ...bySpace]) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push({ id: r.id, username: r.username });
    }
  }
  out.sort((a, b) => a.username.localeCompare(b.username));
  res.json(out);
});

router.get('/', optionalAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT id, username, is_admin, is_active, api_key, created_at, email FROM users ORDER BY username
  `).all();
  res.json(rows.map((r) => ({
    id: r.id,
    username: r.username,
    isAdmin: !!r.is_admin,
    isActive: r.is_active !== 0,
    apiKey: r.api_key,
    createdAt: r.created_at,
    email: r.email ?? undefined,
  })));
});

router.post('/', optionalAuth, requireAdmin, async (req, res) => {
  try {
    const { username, temporaryPassword, email } = req.body;
    if (!username || !temporaryPassword) {
      return res.status(400).json({ error: 'username and temporaryPassword required' });
    }
    const usernameNorm = username.trim().toLowerCase();
    if (!usernameNorm) {
      return res.status(400).json({ error: 'username and temporaryPassword required' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(usernameNorm);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const emailNorm = email && typeof email === 'string' ? email.trim().toLowerCase() : null;
    if (emailNorm) {
      const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }
    const hash = await bcrypt.hash(temporaryPassword, 10);
    const apiKey = randomUUID();
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, is_admin, api_key, email)
      VALUES (?, ?, 0, ?, ?)
    `).run(usernameNorm, hash, apiKey, emailNorm);
    const user = db.prepare('SELECT id, username, is_admin, api_key, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json({
      id: user.id,
      username: user.username,
      isAdmin: !!user.is_admin,
      apiKey: user.api_key,
      createdAt: user.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', optionalAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { password, isActive, revokeApiKey, regenerateApiKey, email } = req.body;

    const isSelf = req.user.userId === id;
    const isAdmin = req.user.isAdmin;

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Cannot update another user' });
    }

    const target = db.prepare('SELECT id, username, is_admin, is_active, api_key, password_hash FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (password !== undefined) {
      if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      if (isSelf && !isAdmin) {
        const { currentPassword } = req.body;
        if (!currentPassword) {
          return res.status(400).json({ error: 'currentPassword required to change your own password' });
        }
        const ok = await bcrypt.compare(currentPassword, target.password_hash);
        if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
      }
      const hash = await bcrypt.hash(password, 12);
      db.prepare('UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?')
        .run(hash, id);
    }

    if (email !== undefined) {
      const emailNorm = email === null || email === '' ? null : (typeof email === 'string' ? email.trim().toLowerCase() : null);
      if (emailNorm) {
        const existingEmail = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(emailNorm, id);
        if (existingEmail) {
          return res.status(400).json({ error: 'Email already in use' });
        }
      }
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(emailNorm, id);
    }

    if (isAdmin && !isSelf) {
      if (isActive !== undefined) {
        const val = isActive ? 1 : 0;
        if (val === 0 && target.is_admin) {
          const adminCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1 AND is_active = 1').get();
          if (adminCount.c <= 1) {
            return res.status(400).json({ error: 'Cannot disable the last admin' });
          }
        }
        db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(val, id);
      }
      if (revokeApiKey === true) {
        db.prepare('UPDATE users SET api_key = NULL WHERE id = ?').run(id);
      }
      if (regenerateApiKey === true) {
        const apiKey = randomUUID();
        db.prepare('UPDATE users SET api_key = ? WHERE id = ?').run(apiKey, id);
      }
    }

    const user = db.prepare('SELECT id, username, is_admin, is_active, api_key, created_at, email FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user.id,
      username: user.username,
      isAdmin: !!user.is_admin,
      isActive: user.is_active !== 0,
      apiKey: user.api_key,
      createdAt: user.created_at,
      email: user.email ?? undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', optionalAuth, requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const isSelf = req.user.userId === id;

    if (isSelf) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const target = db.prepare('SELECT id, username, is_admin, is_active FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.is_active !== 0) {
      return res.status(400).json({ error: 'Account must be disabled before permanent deletion' });
    }

    if (target.is_admin) {
      const adminCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get();
      if (adminCount.c <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin' });
      }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
