import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { login, isAuthEnabled, masqueradeToken, optionalAuth, requireAdmin } from '../auth.js';
import db from '../db.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ enabled: isAuthEnabled() });
});

router.get('/login-hash', (req, res) => {
  try {
    const username = req.query.username;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username required' });
    }
    const normalized = username.trim().toLowerCase();
    if (!normalized) {
      return res.status(400).json({ error: 'Username required' });
    }
    const user = db.prepare(
      'SELECT password_hash FROM users WHERE LOWER(username) = ? AND is_active = 1'
    ).get(normalized);
    const hash = user
      ? user.password_hash
      : bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
    res.json({ hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const result = await login(username, password);
    if (!result) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ token: result.token, mustChangePassword: result.mustChangePassword ?? false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/change-password', optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1, must_change_password = 0 WHERE id = ?')
      .run(hash, req.user.userId);
    res.json({ ok: true, message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/masquerade', optionalAuth, requireAdmin, (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const token = masqueradeToken(userId);
    if (!token) return res.status(404).json({ error: 'User not found' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
