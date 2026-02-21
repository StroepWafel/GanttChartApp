import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'gantt-chart-secret-change-in-production';
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

function hasUsers() {
  try {
    return !!db.prepare('SELECT id FROM users LIMIT 1').get();
  } catch {
    return false;
  }
}

export function isAuthEnabled() {
  return AUTH_ENABLED || hasUsers();
}

export function optionalAuth(req, res, next) {
  if (!isAuthEnabled()) return next();
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT is_active, token_version FROM users WHERE id = ?').get(decoded.userId);
    if (!user || user.is_active === 0) {
      return res.status(401).json({ error: 'Account disabled' });
    }
    const dbVersion = user.token_version ?? 0;
    const tokenVersion = decoded.tokenVersion ?? 0;
    if (tokenVersion < dbVersion) {
      return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
    }
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      isAdmin: !!decoded.isAdmin,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!isAuthEnabled()) return next();
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export async function login(username, password) {
  if (!username || !password) return null;
  const user = db.prepare(
    'SELECT id, username, password_hash, is_admin, is_active, token_version, must_change_password FROM users WHERE username = ?'
  ).get(username);
  if (!user || user.is_active === 0) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  const token = jwt.sign(
    { userId: user.id, username: user.username, isAdmin: !!user.is_admin, tokenVersion: user.token_version ?? 0 },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  return { token, mustChangePassword: !!(user.must_change_password) };
}

/** IoT API: require username + api_key (X-API-Username + X-API-Key, or query ?username=&api_key=) */
export function requireApiKey(req, res, next) {
  const username = req.headers['x-api-username'] || req.query.username;
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!username || !apiKey) {
    return res.status(401).json({ error: 'X-API-Username and X-API-Key (or username and api_key query) required' });
  }
  const user = db.prepare(
    'SELECT id, username, is_admin FROM users WHERE username = ? AND api_key = ?'
  ).get(username, apiKey);
  if (!user) {
    return res.status(401).json({ error: 'Invalid API credentials' });
  }
  req.user = { userId: user.id, username: user.username, isAdmin: !!user.is_admin };
  next();
}

export function masqueradeToken(userId) {
  const user = db.prepare('SELECT id, username, is_admin, is_active, token_version FROM users WHERE id = ?').get(userId);
  if (!user || user.is_active === 0) return null;
  return jwt.sign(
    { userId: user.id, username: user.username, isAdmin: !!user.is_admin, tokenVersion: user.token_version ?? 0 },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}
