import express from 'express';
import db, { runUserIdMigrations } from '../db.js';

const router = express.Router();

function fetchUserBackup(userId) {
  const categories = db.prepare(`
    SELECT id, name, display_order, created_at FROM categories WHERE user_id = ? ORDER BY id
  `).all(userId);
  const projects = db.prepare(`
    SELECT id, category_id, name, start_date, due_date, created_at FROM projects WHERE user_id = ? ORDER BY id
  `).all(userId);
  const tasks = db.prepare(`
    SELECT id, project_id, parent_id, name, start_date, end_date, due_date, progress, completed, completed_at, base_priority, created_at, updated_at
    FROM tasks WHERE user_id = ? ORDER BY id
  `).all(userId);
  const ganttExpanded = db.prepare(`
    SELECT item_type, item_id, expanded FROM gantt_expanded WHERE user_id = ?
  `).all(userId);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    projects,
    tasks,
    gantt_expanded: ganttExpanded,
  };
}

router.get('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    let backup;
    try {
      backup = fetchUserBackup(userId);
    } catch (err) {
      if (err.message?.includes('user_id')) {
        runUserIdMigrations();
        backup = fetchUserBackup(userId);
      } else {
        throw err;
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="gantt-backup.json"');
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { categories, projects, tasks, gantt_expanded } = req.body;

    if (!Array.isArray(categories) || !Array.isArray(projects) || !Array.isArray(tasks)) {
      return res.status(400).json({ error: 'Invalid backup: categories, projects, tasks must be arrays' });
    }

    db.prepare('DELETE FROM gantt_expanded WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM projects WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM categories WHERE user_id = ?').run(userId);

    const catMap = {};
    const projMap = {};
    const taskMap = {};

    const insertCat = db.prepare(`
      INSERT INTO categories (user_id, name, display_order, created_at)
      VALUES (?, ?, COALESCE(?, 0), COALESCE(?, datetime('now')))
    `);
    for (const c of categories) {
      const r = insertCat.run(userId, c.name, c.display_order, c.created_at);
      catMap[c.id] = r.lastInsertRowid;
    }

    const insertProj = db.prepare(`
      INSERT INTO projects (user_id, category_id, name, start_date, due_date, created_at)
      VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `);
    for (const p of projects) {
      const newCatId = catMap[p.category_id] ?? p.category_id;
      const r = insertProj.run(userId, newCatId, p.name, p.start_date ?? null, p.due_date ?? null, p.created_at);
      projMap[p.id] = r.lastInsertRowid;
    }

    const insertTask = db.prepare(`
      INSERT INTO tasks (user_id, project_id, parent_id, name, start_date, end_date, due_date, progress, completed, completed_at, base_priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), ?, COALESCE(?, 5), COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    `);
    let inserted = true;
    while (inserted) {
      inserted = false;
      for (const t of tasks) {
        if (taskMap[t.id] != null) continue;
        const newProjId = projMap[t.project_id] ?? t.project_id;
        const newParentId = t.parent_id == null ? null : (taskMap[t.parent_id] ?? null);
        if (t.parent_id != null && newParentId == null) continue;
        const r = insertTask.run(
          userId, newProjId, newParentId, t.name, t.start_date, t.end_date,
          t.due_date ?? null, t.progress, t.completed ? 1 : 0, t.completed_at,
          t.base_priority, t.created_at, t.updated_at
        );
        taskMap[t.id] = r.lastInsertRowid;
        inserted = true;
      }
    }

    function remapItemId(type, oldId) {
      const n = parseInt(oldId, 10);
      if (type === 'category') return catMap[n] ?? n;
      if (type === 'project') return projMap[n] ?? n;
      if (type === 'task') return taskMap[n] ?? n;
      return n;
    }

    if (Array.isArray(gantt_expanded) && gantt_expanded.length > 0) {
      const insertExp = db.prepare(`
        INSERT INTO gantt_expanded (user_id, item_type, item_id, expanded) VALUES (?, ?, ?, ?)
      `);
      for (const e of gantt_expanded) {
        const newItemId = remapItemId(e.item_type, e.item_id);
        insertExp.run(userId, e.item_type, newItemId, e.expanded ? 1 : 0);
      }
    } else if (gantt_expanded && typeof gantt_expanded === 'object') {
      const insertExp = db.prepare(`
        INSERT INTO gantt_expanded (user_id, item_type, item_id, expanded) VALUES (?, ?, ?, ?)
      `);
      for (const type of ['category', 'project', 'task']) {
        const obj = gantt_expanded[type];
        if (obj && typeof obj === 'object') {
          for (const [itemId, expanded] of Object.entries(obj)) {
            const newItemId = remapItemId(type, itemId);
            insertExp.run(userId, type, newItemId, expanded ? 1 : 0);
          }
        }
      }
    }

    res.json({ ok: true, message: 'Backup restored successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
