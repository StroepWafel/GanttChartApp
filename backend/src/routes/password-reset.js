import express from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../db.js';
import { getPasswordResetConfig, sendMailgunEmail } from '../mailgun.js';

const router = express.Router();

const MIN_RESPONSE_MS = 250;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const requestLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const email = (req.body?.email || '').toString().toLowerCase().trim();
    const ipKey = ip && ip !== 'unknown' ? ipKeyGenerator(ip) : ip;
    return `${ipKey}:${email || 'empty'}`;
  },
});

const resetLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function constantTimeCompare(a, b) {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/** POST /password-reset-request */
router.post('/password-reset-request', requestLimit, async (req, res) => {
  const start = Date.now();
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'email required' });
    }
    const emailNormalized = email.trim().toLowerCase();
    if (!emailNormalized) {
      return res.status(400).json({ error: 'email required' });
    }

    const user = db.prepare(
      'SELECT id FROM users WHERE email = ? AND is_active = 1'
    ).get(emailNormalized);

    if (user) {
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
        VALUES (?, ?, ?)
      `).run(tokenHash, user.id, expiresAt);

      const config = getPasswordResetConfig();
      if (config.apiKey && config.domain) {
        const resetUrl = `${config.resetBaseUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
        const text = `You requested a password reset. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in 15 minutes. If you did not request this, you can ignore this email.`;
        try {
          await sendMailgunEmail(config, {
            to: emailNormalized,
            subject: 'Reset your password',
            text,
          });
        } catch (err) {
          console.error('[password-reset] Failed to send email:', err?.message);
        }
      }
    }

    const elapsed = Date.now() - start;
    if (elapsed < MIN_RESPONSE_MS) {
      await delay(MIN_RESPONSE_MS - elapsed);
    }

    res.json({
      message: `If an account exists with the email ${emailNormalized}, we have sent you a reset link.`,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    if (elapsed < MIN_RESPONSE_MS) {
      await delay(MIN_RESPONSE_MS - elapsed);
    }
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});

/** POST /password-reset */
router.post('/password-reset', resetLimit, async (req, res) => {
  try {
    const { token, new_password } = req.body || {};
    if (!token || !new_password || typeof token !== 'string' || typeof new_password !== 'string') {
      return res.status(400).json({ error: 'token and new_password required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const tokenHash = hashToken(token);
    const row = db.prepare(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?'
    ).get(tokenHash);

    const dummyHash = hashToken(crypto.randomBytes(32).toString('hex'));
    if (!row) {
      constantTimeCompare(tokenHash, dummyHash);
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    if (row.used_at) {
      constantTimeCompare(tokenHash, dummyHash);
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const now = new Date().toISOString();
    if (row.expires_at < now) {
      db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, row.id);
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const hash = await bcrypt.hash(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?')
      .run(hash, row.user_id);
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, row.id);

    res.json({ ok: true, message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});

export default router;
