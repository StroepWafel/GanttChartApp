import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID, randomBytes } from 'crypto';
import db, { runUserIdMigrations } from '../db.js';
import { optionalAuth, requireAdmin } from '../auth.js';
import {
  getEmailOnboardingConfig,
  renderOnboardingTemplate,
  sendMailgunEmail,
} from '../mailgun.js';

function getSystemSettings() {
  const rows = db.prepare('SELECT key, value FROM system_settings').all();
  const out = {};
  for (const r of rows) {
    try {
      out[r.key] = r.value ? JSON.parse(r.value) : null;
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

const router = express.Router();
router.use(optionalAuth, requireAdmin);

export function fetchFullBackup() {
  const users = db.prepare(`
    SELECT id, username, password_hash, is_admin, api_key, created_at, email, token_version FROM users ORDER BY id
  `).all();
  const userPrefs = db.prepare(`
    SELECT user_id, key, value FROM user_preferences
  `).all();
  const categories = db.prepare(`
    SELECT id, user_id, name, display_order, created_at FROM categories ORDER BY id
  `).all();
  const projects = db.prepare(`
    SELECT id, user_id, category_id, name, start_date, due_date, created_at FROM projects ORDER BY id
  `).all();
  const tasks = db.prepare(`
    SELECT id, user_id, project_id, parent_id, name, start_date, end_date, due_date, progress, completed, completed_at, base_priority, created_at, updated_at FROM tasks ORDER BY id
  `).all();
  const ganttExpanded = db.prepare(`
    SELECT user_id, item_type, item_id, expanded FROM gantt_expanded
  `).all();

  // Structure: each user -> preferences + categories + projects + tasks + gantt_expanded
  const usersWithData = users.map((u) => {
    const uid = u.id;
    const prefs = userPrefs
      .filter((p) => p.user_id === uid)
      .reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {});
    return {
      ...u,
      preferences: prefs,
      categories: categories.filter((c) => c.user_id === uid).map(({ user_id, ...c }) => c),
      projects: projects.filter((p) => p.user_id === uid).map(({ user_id, ...p }) => p),
      tasks: tasks.filter((t) => t.user_id === uid).map(({ user_id, ...t }) => t),
      gantt_expanded: ganttExpanded
        .filter((e) => e.user_id === uid)
        .map(({ user_id, ...e }) => e),
    };
  });

  const systemSettingsRows = db.prepare('SELECT key, value FROM system_settings').all();
  const system_settings = {};
  for (const r of systemSettingsRows) {
    system_settings[r.key] = r.value;
  }

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    users: usersWithData,
    system_settings,
  };
}

/** Preview onboard email (no send, no user creation) */
router.post('/preview-onboard-email', (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username required' });
    }
    const config = getEmailOnboardingConfig();
    const body = renderOnboardingTemplate(config, { username });
    res.json({
      subject: config.subject,
      body,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Onboard user: create user with random password and send invite email */
router.post('/onboard-user', async (req, res) => {
  try {
    const { email, username } = req.body || {};
    if (!email || !username || typeof email !== 'string' || typeof username !== 'string') {
      return res.status(400).json({ error: 'email and username required' });
    }
    const emailTrim = email.trim();
    const usernameNorm = username.trim().toLowerCase();
    if (!emailTrim || !usernameNorm) {
      return res.status(400).json({ error: 'email and username required' });
    }
    const config = getEmailOnboardingConfig();
    if (!config.enabled || !config.apiKey || !config.domain) {
      return res.status(400).json({ error: 'Email onboarding is not configured or enabled. Configure it in Settings > Email onboarding.' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(usernameNorm);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const emailNormalized = emailTrim.toLowerCase();
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNormalized);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const temporaryPassword = randomBytes(12).toString('base64').replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c] || c));
    const hash = await bcrypt.hash(temporaryPassword, 10);
    const apiKey = randomUUID();
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, is_admin, api_key, email, must_change_password)
      VALUES (?, ?, 0, ?, ?, 1)
    `).run(usernameNorm, hash, apiKey, emailNormalized);
    const user = db.prepare('SELECT id, username, is_admin, api_key, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);

    const body = renderOnboardingTemplate(config, { username: usernameNorm, password: temporaryPassword });
    const mailgunRes = await sendMailgunEmail(config, {
      to: emailTrim,
      subject: config.subject,
      text: body,
    });

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        isAdmin: !!user.is_admin,
        apiKey: user.api_key,
        createdAt: user.created_at,
      },
      mailgunResponse: mailgunRes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Send test onboard email to verify Mailgun config */
router.post('/test-onboard-email', async (req, res) => {
  try {
    const { to } = req.body || {};
    if (!to || typeof to !== 'string' || !to.trim()) {
      return res.status(400).json({ error: 'to (email address) required' });
    }
    const config = getEmailOnboardingConfig();
    if (!config.apiKey || !config.domain) {
      return res.status(400).json({ error: 'Mailgun API key and domain must be configured' });
    }
    const body = renderOnboardingTemplate(config, { username: 'TestUser', password: '(test - no real account)' });
    const mailgunRes = await sendMailgunEmail(config, {
      to: to.trim(),
      subject: `[Test] ${config.subject}`,
      text: body,
    });
    res.json({ mailgunResponse: mailgunRes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Admin full backup: all users and data (excluding password hashes as plaintext) */
router.get('/full-backup', (req, res) => {
  try {
    let backup;
    try {
      backup = fetchFullBackup();
    } catch (err) {
      if (err.message?.includes('user_id')) {
        runUserIdMigrations();
        backup = fetchFullBackup();
      } else {
        throw err;
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="gantt-full-backup.json"');
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Admin clear all data (all users). Requires password verification. Keeps users table. */
router.post('/clear-all-data', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password required' });
    }
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });

    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare('DELETE FROM gantt_expanded').run();
      db.prepare('DELETE FROM tasks').run();
      db.prepare('DELETE FROM projects').run();
      db.prepare('DELETE FROM categories').run();
      db.prepare('DELETE FROM user_preferences').run();
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.json({ ok: true, message: 'All data cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Admin full restore: replace all data from backup. Never accept plaintext passwords. */
router.post('/full-restore', (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid backup payload' });
    }

    // Normalize: version 2 has users with nested data; version 1 has flat arrays
    let usersData, prefsData, catData, projData, taskData, ganttData;
    const isV2 = body.version === 2 && Array.isArray(body.users) && body.users.length > 0 && 'preferences' in body.users[0];
    if (isV2) {
      // Version 2: users array with nested preferences, categories, projects, tasks, gantt_expanded
      usersData = body.users.map(({ preferences, categories, projects, tasks, gantt_expanded, ...u }) => u);
      prefsData = [];
      catData = [];
      projData = [];
      taskData = [];
      ganttData = [];
      for (const u of body.users) {
        const uid = u.id;
        if (u.preferences && typeof u.preferences === 'object') {
          for (const [key, value] of Object.entries(u.preferences)) {
            const valStr = value === null || value === undefined ? '' : (typeof value === 'string' ? value : JSON.stringify(value));
            prefsData.push({ user_id: uid, key, value: valStr });
          }
        }
        for (const c of u.categories || []) {
          catData.push({ ...c, user_id: uid });
        }
        for (const p of u.projects || []) {
          projData.push({ ...p, user_id: uid });
        }
        for (const t of u.tasks || []) {
          taskData.push({ ...t, user_id: uid });
        }
        for (const e of u.gantt_expanded || []) {
          ganttData.push({ ...e, user_id: uid });
        }
      }
    } else {
      // Version 1 (legacy): flat arrays at top level
      usersData = body.users;
      prefsData = body.user_preferences;
      catData = body.categories;
      projData = body.projects;
      taskData = body.tasks;
      ganttData = body.gantt_expanded;
    }

    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare('DELETE FROM gantt_expanded').run();
      db.prepare('DELETE FROM tasks').run();
      db.prepare('DELETE FROM projects').run();
      db.prepare('DELETE FROM categories').run();
      db.prepare('DELETE FROM user_preferences').run();
      db.prepare('DELETE FROM users').run();

      if (Array.isArray(usersData) && usersData.length > 0) {
        const insertUser = db.prepare(`
          INSERT INTO users (id, username, password_hash, is_admin, api_key, created_at, email, token_version)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, COALESCE(?, 0))
        `);
        for (const u of usersData) {
          if (!u.password_hash) continue;
          insertUser.run(u.id, u.username, u.password_hash, u.is_admin ? 1 : 0, u.api_key || null, u.created_at, u.email || null, u.token_version);
        }
      }

      if (Array.isArray(prefsData) && prefsData.length > 0) {
        const insertPref = db.prepare(`
          INSERT INTO user_preferences (user_id, key, value) VALUES (?, ?, ?)
        `);
        for (const p of prefsData) {
          insertPref.run(p.user_id, p.key, p.value);
        }
      }

      if (Array.isArray(catData) && catData.length > 0) {
        const insertCat = db.prepare(`
          INSERT INTO categories (id, user_id, name, display_order, created_at)
          VALUES (?, ?, ?, COALESCE(?, 0), COALESCE(?, datetime('now')))
        `);
        for (const c of catData) {
          insertCat.run(c.id, c.user_id, c.name, c.display_order, c.created_at);
        }
      }

      if (Array.isArray(projData) && projData.length > 0) {
        const insertProj = db.prepare(`
          INSERT INTO projects (id, user_id, category_id, name, start_date, due_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        `);
        for (const p of projData) {
          insertProj.run(p.id, p.user_id, p.category_id, p.name, p.start_date ?? null, p.due_date ?? null, p.created_at);
        }
      }

      if (Array.isArray(taskData) && taskData.length > 0) {
        const insertTask = db.prepare(`
          INSERT INTO tasks (id, user_id, project_id, parent_id, name, start_date, end_date, due_date, progress, completed, completed_at, base_priority, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), ?, COALESCE(?, 5), COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
        `);
        for (const t of taskData) {
          insertTask.run(t.id, t.user_id, t.project_id, t.parent_id || null, t.name, t.start_date, t.end_date, t.due_date || null, t.progress, t.completed ? 1 : 0, t.completed_at, t.base_priority, t.created_at, t.updated_at);
        }
      }

      if (Array.isArray(ganttData) && ganttData.length > 0) {
        const insertExp = db.prepare(`
          INSERT INTO gantt_expanded (user_id, item_type, item_id, expanded) VALUES (?, ?, ?, ?)
        `);
        for (const e of ganttData) {
          insertExp.run(e.user_id, e.item_type, e.item_id, e.expanded ? 1 : 0);
        }
      } else if (ganttData && typeof ganttData === 'object' && !Array.isArray(ganttData) && ganttData.user_id === undefined) {
        // Legacy nested format: gantt_expanded: { category: { 1: true }, ... }
        const insertExp = db.prepare(`
          INSERT INTO gantt_expanded (user_id, item_type, item_id, expanded) VALUES (?, ?, ?, ?)
        `);
        for (const type of ['category', 'project', 'task']) {
          const obj = ganttData[type];
          if (obj && typeof obj === 'object') {
            for (const [itemId, expanded] of Object.entries(obj)) {
              const adminRow = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
              const uid = adminRow ? adminRow.id : 1;
              insertExp.run(uid, type, parseInt(itemId, 10), expanded ? 1 : 0);
            }
          }
        }
      }

      if (body.system_settings && typeof body.system_settings === 'object') {
        const upsertSetting = db.prepare(`
          INSERT INTO system_settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);
        for (const [key, value] of Object.entries(body.system_settings)) {
          if (!key) continue;
          const valStr = typeof value === 'string' ? value : JSON.stringify(value);
          upsertSetting.run(key, valStr);
        }
      }

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({ ok: true, message: 'Full backup restored successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
