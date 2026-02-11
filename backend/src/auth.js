import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'gantt-chart-secret-change-in-production';
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
const AUTH_EMAIL = process.env.AUTH_EMAIL || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH || '';

let passwordHash = null;
if (AUTH_ENABLED) {
  passwordHash = AUTH_PASSWORD_HASH || (AUTH_PASSWORD ? bcrypt.hashSync(AUTH_PASSWORD, 10) : null);
}

export function isAuthEnabled() {
  return AUTH_ENABLED;
}

export function optionalAuth(req, res, next) {
  if (!AUTH_ENABLED) return next();
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireApiKey(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next();
  const provided = req.headers['x-api-key'];
  if (provided !== apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

export async function login(email, password) {
  if (!AUTH_ENABLED) return null;
  if (email !== AUTH_EMAIL) return null;
  if (!passwordHash) return null;
  const ok = await bcrypt.compare(password, passwordHash);
  if (!ok) return null;
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
}
