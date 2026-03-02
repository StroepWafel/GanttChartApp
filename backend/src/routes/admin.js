import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { existsSync, createReadStream, unlinkSync, copyFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'crypto';
import multer from 'multer';
import db, { runUserIdMigrations, closeDb, DB_PATH } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { optionalAuth, requireAdmin } from '../auth.js';

const mobileReleasesDir = path.resolve(__dirname, '../../../mobile/releases');
const iosUploadMulter = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => {
      if (!existsSync(mobileReleasesDir)) {
        const fs = require('fs');
        fs.mkdirSync(mobileReleasesDir, { recursive: true });
      }
      cb(null, mobileReleasesDir);
    },
    filename: (_, __, cb) => cb(null, 'app.ipa'),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB for .ipa
  fileFilter: (_, file, cb) => {
    const ok = file.mimetype === 'application/octet-stream' ||
      file.originalname?.toLowerCase().endsWith('.ipa') ||
      (file.mimetype || '').includes('zip');
    if (ok) cb(null, true);
    else cb(new Error('Only .ipa files are accepted'));
  },
});

const dbRestoreMulter = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => {
      const dataDir = path.dirname(DB_PATH);
      const restoreDir = path.join(dataDir, 'restore-pending');
      if (!existsSync(restoreDir)) mkdirSync(restoreDir, { recursive: true });
      cb(null, restoreDir);
    },
    filename: (_, __, cb) => cb(null, 'upload.db'),
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for .db
  fileFilter: (_, file, cb) => {
    const ok = file.originalname?.toLowerCase().endsWith('.db') ||
      file.mimetype === 'application/octet-stream';
    if (ok) cb(null, true);
    else cb(new Error('Only .db files are accepted'));
  },
});
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
    SELECT id, username, password_hash, is_admin, is_active, api_key, created_at, email, token_version, must_change_password FROM users ORDER BY id
  `).all();
  const userPrefs = db.prepare(`
    SELECT user_id, key, value FROM user_preferences
  `).all();
  const categories = db.prepare(`
    SELECT id, user_id, space_id, name, display_order, created_at FROM categories ORDER BY id
  `).all();
  const projects = db.prepare(`
    SELECT id, user_id, space_id, category_id, name, start_date, due_date, created_at FROM projects ORDER BY id
  `).all();
  const tasks = db.prepare(`
    SELECT id, user_id, project_id, parent_id, name, start_date, end_date, due_date, progress, completed, completed_at, base_priority, display_order, created_at, updated_at FROM tasks ORDER BY id
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

  const spacesRows = db.prepare('SELECT * FROM spaces').all();
  const spaceMembersRows = db.prepare('SELECT * FROM space_members').all();
  const userSharesRows = db.prepare('SELECT * FROM user_shares').all();
  const shareLinksRows = db.prepare('SELECT * FROM share_links').all();

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    users: usersWithData,
    system_settings,
    spaces: spacesRows,
    space_members: spaceMembersRows,
    user_shares: userSharesRows,
    share_links: shareLinksRows,
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

/** Admin export database: raw SQLite .db file for disaster recovery / external tools */
router.get('/export-database', async (req, res) => {
  try {
    const destPath = path.join(os.tmpdir(), `gantt-export-${Date.now()}.db`);
    await db.backup(destPath);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="gantt-export-${dateStr}.db"`);
    const stream = createReadStream(destPath);
    stream.pipe(res);
    stream.on('end', () => {
      try { unlinkSync(destPath); } catch (_) {}
    });
    stream.on('error', () => {
      try { unlinkSync(destPath); } catch (_) {}
    });
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
      db.prepare('DELETE FROM share_links').run();
      db.prepare('DELETE FROM user_shares').run();
      db.prepare('DELETE FROM gantt_expanded').run();
      db.prepare('DELETE FROM tasks').run();
      db.prepare('DELETE FROM projects').run();
      db.prepare('DELETE FROM categories').run();
      db.prepare('DELETE FROM space_members').run();
      db.prepare('DELETE FROM spaces').run();
      db.prepare('DELETE FROM user_preferences').run();
      db.prepare('DELETE FROM users').run();

      if (Array.isArray(usersData) && usersData.length > 0) {
        const insertUser = db.prepare(`
          INSERT INTO users (id, username, password_hash, is_admin, is_active, api_key, created_at, email, token_version, must_change_password)
          VALUES (?, ?, ?, ?, COALESCE(?, 1), ?, COALESCE(?, datetime('now')), ?, COALESCE(?, 0), COALESCE(?, 0))
        `);
        for (const u of usersData) {
          if (!u.password_hash) continue;
          insertUser.run(u.id, u.username, u.password_hash, u.is_admin ? 1 : 0, u.is_active ?? 1, u.api_key || null, u.created_at, u.email || null, u.token_version, u.must_change_password ?? 0);
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

      if (Array.isArray(body.spaces) && body.spaces.length > 0) {
        const insertSpace = db.prepare(`
          INSERT INTO spaces (id, name, created_by, created_at) VALUES (?, ?, ?, COALESCE(?, datetime('now')))
        `);
        for (const s of body.spaces) {
          insertSpace.run(s.id, s.name, s.created_by, s.created_at);
        }
      }
      if (Array.isArray(body.space_members) && body.space_members.length > 0) {
        const insertSm = db.prepare(`
          INSERT INTO space_members (id, space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
        `);
        for (const sm of body.space_members) {
          insertSm.run(sm.id, sm.space_id, sm.user_id, sm.role || 'member', sm.joined_at);
        }
      }

      if (Array.isArray(catData) && catData.length > 0) {
        const insertCat = db.prepare(`
          INSERT INTO categories (id, user_id, space_id, name, display_order, created_at)
          VALUES (?, ?, ?, COALESCE(?, 0), COALESCE(?, datetime('now')))
        `);
        for (const c of catData) {
          insertCat.run(c.id, c.user_id, c.space_id ?? null, c.name, c.display_order, c.created_at);
        }
      }

      if (Array.isArray(projData) && projData.length > 0) {
        const insertProj = db.prepare(`
          INSERT INTO projects (id, user_id, space_id, category_id, name, start_date, due_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        `);
        for (const p of projData) {
          insertProj.run(p.id, p.user_id, p.space_id ?? null, p.category_id, p.name, p.start_date ?? null, p.due_date ?? null, p.created_at);
        }
      }

      if (Array.isArray(taskData) && taskData.length > 0) {
        const insertTask = db.prepare(`
          INSERT INTO tasks (id, user_id, project_id, parent_id, name, start_date, end_date, due_date, progress, completed, completed_at, base_priority, display_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), ?, COALESCE(?, 5), COALESCE(?, 0), COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
        `);
        for (const t of taskData) {
          insertTask.run(t.id, t.user_id, t.project_id, t.parent_id || null, t.name, t.start_date, t.end_date, t.due_date || null, t.progress, t.completed ? 1 : 0, t.completed_at, t.base_priority, t.display_order, t.created_at, t.updated_at);
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

      if (Array.isArray(body.user_shares) && body.user_shares.length > 0) {
        const insertUs = db.prepare(`
          INSERT INTO user_shares (id, owner_id, target_user_id, item_type, item_id, permission, created_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        `);
        for (const us of body.user_shares) {
          insertUs.run(us.id, us.owner_id, us.target_user_id, us.item_type, us.item_id, us.permission || 'view', us.created_at);
        }
      }
      if (Array.isArray(body.share_links) && body.share_links.length > 0) {
        const insertSl = db.prepare(`
          INSERT INTO share_links (id, owner_id, token, item_type, item_id, permission, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        `);
        for (const sl of body.share_links) {
          insertSl.run(sl.id, sl.owner_id, sl.token, sl.item_type, sl.item_id, sl.permission || 'view', sl.expires_at ?? null, sl.created_at);
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

/** Admin upload iOS build (.ipa). iOS requires macOS/Xcode; build locally or via CI, then upload here. */
router.post('/upload-ios-build', (req, res, next) => {
  iosUploadMulter.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use form field "file" with a .ipa file.' });
    }
    res.json({ ok: true, message: 'iOS build uploaded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Admin restore from .db file: replaces entire SQLite database. Server restarts after restore. */
router.post('/restore-db', (req, res, next) => {
  dbRestoreMulter.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use form field "file" with a .db file.' });
    }
    const uploadedPath = req.file.path;

    // Validate: must be a valid SQLite database
    let testDb;
    try {
      testDb = new Database(uploadedPath, { readonly: true });
      testDb.prepare('SELECT 1').get();
      testDb.close();
    } catch (e) {
      try {
        if (testDb) testDb.close();
      } catch (_) {}
      unlinkSync(uploadedPath);
      return res.status(400).json({ error: 'Invalid SQLite database file' });
    }

    const dataDir = path.dirname(DB_PATH);
    const backupDir = path.join(dataDir, 'backups');
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `gantt.db.bak-${timestamp}`);

    closeDb();
    try {
      copyFileSync(DB_PATH, backupPath);
    } catch (e) {
      res.status(500).json({ error: `Failed to backup current database: ${e.message}` });
      setTimeout(() => process.exit(1), 500);
      return;
    }
    try {
      copyFileSync(uploadedPath, DB_PATH);
    } catch (e) {
      try {
        copyFileSync(backupPath, DB_PATH);
      } catch (_) {}
      res.status(500).json({ error: `Failed to replace database: ${e.message}` });
      setTimeout(() => process.exit(1), 500);
      return;
    }
    try {
      unlinkSync(uploadedPath);
    } catch (_) {}

    res.json({ ok: true, message: 'Database restored. Server will restart.' });
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** In-memory state for async mobile build (avoids proxy 502 on long-running builds) */
let mobileBuildState = { status: 'idle', output: '', error: null };
const MOBILE_BUILD_MAX_OUTPUT = 50_000;

/** GET build status (for polling) */
router.get('/build-mobile/status', (req, res) => {
  res.json({
    status: mobileBuildState.status,
    output: mobileBuildState.output,
    error: mobileBuildState.error,
    ok: mobileBuildState.status === 'success',
  });
});

/** Manually trigger mobile app build (admin only). Starts build in background, returns immediately to avoid proxy timeout. */
router.post('/build-mobile', (req, res) => {
  try {
    if (mobileBuildState.status === 'building') {
      return res.status(409).json({ error: 'Build already in progress' });
    }
    let rootDir = path.resolve(__dirname, '../../..');
    const publicUrlRow = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('public_url');
    let publicUrl = process.env.PUBLIC_URL || '';
    if (publicUrlRow?.value) {
      try {
        const v = JSON.parse(publicUrlRow.value);
        publicUrl = typeof v === 'string' ? v : '';
      } catch {
        publicUrl = String(publicUrlRow.value || '');
      }
    }
    publicUrl = publicUrl.trim().replace(/\/$/, '');
    const env = { ...process.env, MOBILE_APP_ENABLED: 'true', PUBLIC_URL: publicUrl || process.env.PUBLIC_URL || '' };
    if (!env.PUBLIC_URL) {
      return res.status(400).json({ error: 'Public URL is required. Set it in Settings > Admin > Mobile app, or in .env as PUBLIC_URL.' });
    }
    let buildScript = path.join(rootDir, 'scripts', 'build-mobile.js');
    if (!existsSync(buildScript)) {
      const cwdParent = path.resolve(process.cwd(), '..');
      const altScript = path.join(cwdParent, 'scripts', 'build-mobile.js');
      if (existsSync(altScript)) {
        buildScript = altScript;
        rootDir = cwdParent;
      }
    }
    mobileBuildState = { status: 'building', output: '', error: null };
    res.json({ ok: true, status: 'building', message: 'Build started. Poll /admin/build-mobile/status for progress.' });
    const proc = spawn('node', [buildScript], { cwd: rootDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      mobileBuildState.output = (stdout + stderr).slice(-MOBILE_BUILD_MAX_OUTPUT);
    });
    proc.stderr?.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      mobileBuildState.output = (stdout + stderr).slice(-MOBILE_BUILD_MAX_OUTPUT);
    });
    proc.on('close', (code) => {
      const output = (stdout + stderr).trim() || `Exit code ${code}`;
      if (code === 0) {
        mobileBuildState = { status: 'success', output, error: null };
      } else {
        mobileBuildState = { status: 'failed', output, error: 'Build failed' };
      }
    });
    proc.on('error', (err) => {
      mobileBuildState = { status: 'failed', output: err.message, error: 'Failed to start build' };
    });
  } catch (err) {
    if (mobileBuildState.status === 'building') {
      mobileBuildState = { status: 'failed', output: err.message, error: err.message };
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;
