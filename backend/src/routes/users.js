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
    'SELECT id, username, is_admin, api_key, created_at FROM users WHERE id = ?'
  ).get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user.id,
    username: user.username,
    isAdmin: !!user.is_admin,
    apiKey: user.api_key,
    createdAt: user.created_at,
  });
});

router.get('/', optionalAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT id, username, is_admin, is_active, api_key, created_at FROM users ORDER BY username
  `).all();
  res.json(rows.map((r) => ({
    id: r.id,
    username: r.username,
    isAdmin: !!r.is_admin,
    isActive: r.is_active !== 0,
    apiKey: r.api_key,
    createdAt: r.created_at,
  })));
});

router.post('/', optionalAuth, requireAdmin, async (req, res) => {
  try {
    const { username, temporaryPassword } = req.body;
    if (!username || !temporaryPassword) {
      return res.status(400).json({ error: 'username and temporaryPassword required' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hash = await bcrypt.hash(temporaryPassword, 10);
    const apiKey = randomUUID();
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, is_admin, api_key)
      VALUES (?, ?, 0, ?)
    `).run(username, hash, apiKey);
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
    const { password, isActive, revokeApiKey, regenerateApiKey } = req.body;

    const isSelf = req.user.userId === id;
    const isAdmin = req.user.isAdmin;

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Cannot update another user' });
    }

    const target = db.prepare('SELECT id, username, is_admin, is_active, api_key, password_hash FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (password !== undefined) {
      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      if (isSelf && !isAdmin) {
        const { currentPassword } = req.body;
        if (!currentPassword) {
          return res.status(400).json({ error: 'currentPassword required to change your own password' });
        }
        const ok = await bcrypt.compare(currentPassword, target.password_hash);
        if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
      }
      const hash = await bcrypt.hash(password, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
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

    const user = db.prepare('SELECT id, username, is_admin, is_active, api_key, created_at FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user.id,
      username: user.username,
      isAdmin: !!user.is_admin,
      isActive: user.is_active !== 0,
      apiKey: user.api_key,
      createdAt: user.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
