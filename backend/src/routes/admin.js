import express from 'express';
import db from '../db.js';
import { optionalAuth, requireAdmin } from '../auth.js';

const router = express.Router();
router.use(optionalAuth, requireAdmin);

/** Admin full backup: all users and data (excluding password hashes as plaintext) */
router.get('/full-backup', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, password_hash, is_admin, api_key, created_at FROM users ORDER BY id
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

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      users,
      user_preferences: userPrefs,
      categories,
      projects,
      tasks,
      gantt_expanded: ganttExpanded,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="gantt-full-backup.json"');
    res.send(JSON.stringify(backup, null, 2));
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

    const { users: usersData, user_preferences: prefsData, categories: catData, projects: projData, tasks: taskData, gantt_expanded: ganttData } = body;

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
          INSERT INTO users (id, username, password_hash, is_admin, api_key, created_at)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        `);
        for (const u of usersData) {
          if (!u.password_hash) continue;
          insertUser.run(u.id, u.username, u.password_hash, u.is_admin ? 1 : 0, u.api_key || null, u.created_at);
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
      } else if (ganttData && typeof ganttData === 'object') {
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
