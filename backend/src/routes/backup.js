import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT id, name, display_order, created_at FROM categories ORDER BY id
    `).all();
    const projects = db.prepare(`
      SELECT id, category_id, name, start_date, due_date, created_at FROM projects ORDER BY id
    `).all();
    const tasks = db.prepare(`
      SELECT id, project_id, parent_id, name, start_date, end_date, due_date, progress, completed, completed_at, base_priority, created_at, updated_at
      FROM tasks ORDER BY id
    `).all();
    const ganttExpanded = db.prepare(`
      SELECT item_type, item_id, expanded FROM gantt_expanded
    `).all();

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      categories,
      projects,
      tasks,
      gantt_expanded: ganttExpanded,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="gantt-backup.json"');
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { categories, projects, tasks, gantt_expanded } = req.body;

    if (!Array.isArray(categories) || !Array.isArray(projects) || !Array.isArray(tasks)) {
      return res.status(400).json({ error: 'Invalid backup: categories, projects, tasks must be arrays' });
    }

    db.exec(`
      DELETE FROM gantt_expanded;
      DELETE FROM tasks;
      DELETE FROM projects;
      DELETE FROM categories;
    `);

    const insertCat = db.prepare(`
      INSERT INTO categories (id, name, display_order, created_at)
      VALUES (?, ?, COALESCE(?, 0), COALESCE(?, datetime('now')))
    `);
    for (const c of categories) {
      insertCat.run(c.id, c.name, c.display_order, c.created_at);
    }

    const insertProj = db.prepare(`
      INSERT INTO projects (id, category_id, name, start_date, due_date, created_at)
      VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `);
    for (const p of projects) {
      insertProj.run(
        p.id, p.category_id, p.name,
        p.start_date ?? null, p.due_date ?? null,
        p.created_at
      );
    }

    const insertTask = db.prepare(`
      INSERT INTO tasks (id, project_id, parent_id, name, start_date, end_date, due_date, progress, completed, completed_at, base_priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), ?, COALESCE(?, 5), COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    `);
    for (const t of tasks) {
      insertTask.run(
        t.id, t.project_id, t.parent_id || null, t.name, t.start_date, t.end_date,
        t.due_date || null, t.progress, t.completed ? 1 : 0, t.completed_at,
        t.base_priority, t.created_at, t.updated_at
      );
    }

    if (Array.isArray(gantt_expanded) && gantt_expanded.length > 0) {
      const insertExp = db.prepare(`
        INSERT INTO gantt_expanded (item_type, item_id, expanded) VALUES (?, ?, ?)
      `);
      for (const e of gantt_expanded) {
        insertExp.run(e.item_type, e.item_id, e.expanded ? 1 : 0);
      }
    } else if (gantt_expanded && typeof gantt_expanded === 'object') {
      const insertExp = db.prepare(`
        INSERT INTO gantt_expanded (item_type, item_id, expanded) VALUES (?, ?, ?)
      `);
      for (const type of ['category', 'project', 'task']) {
        const obj = gantt_expanded[type];
        if (obj && typeof obj === 'object') {
          for (const [itemId, expanded] of Object.entries(obj)) {
            insertExp.run(type, parseInt(itemId, 10), expanded ? 1 : 0);
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
