#!/usr/bin/env node
/**
 * One-time recovery script for "no such column: user_id" and "table gantt_expanded_new already exists".
 * Run: cd backend && node scripts/fix-user-id-migration.js
 * Then: pm2 restart gantt-api
 */
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '../data/gantt.db');

console.log('Opening database:', DB_PATH);
const db = new Database(DB_PATH);

function hasColumn(table, col) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === col);
}

function tableExists(name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

try {
  if (!tableExists('users')) {
    console.log('Database has no users table - it may be empty. Start the app with: pm2 restart gantt-api');
    console.log('The app will create tables on first run.');
    process.exit(0);
  }

  // 1. Add user_id to categories, projects, tasks if missing
  for (const table of ['categories', 'projects', 'tasks']) {
    if (!tableExists(table)) continue;
    if (!hasColumn(table, 'user_id')) {
      console.log(`Adding user_id to ${table}...`);
      db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER`);
    } else {
      console.log(`${table} already has user_id`);
    }
  }

  // 2. Fix gantt_expanded_new leftover
  if (tableExists('gantt_expanded_new')) {
    if (tableExists('gantt_expanded') && !hasColumn('gantt_expanded', 'user_id')) {
      console.log('Completing gantt_expanded migration (dropping old, renaming new)...');
      db.exec('DROP TABLE gantt_expanded');
      db.exec('ALTER TABLE gantt_expanded_new RENAME TO gantt_expanded');
    } else {
      console.log('Dropping orphan gantt_expanded_new...');
      db.exec('DROP TABLE gantt_expanded_new');
    }
  }

  // 3. Assign orphan rows to admin (only if users table exists)
  const admin = tableExists('users') ? db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get() : null;
  if (admin) {
    const aid = admin.id;
    for (const table of ['categories', 'projects', 'tasks', 'gantt_expanded']) {
      if (tableExists(table) && hasColumn(table, 'user_id')) {
        try {
          const r = db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(aid);
          if (r.changes > 0) console.log(`Assigned ${r.changes} orphan rows in ${table} to admin`);
        } catch (_) {}
      }
    }
  }

  console.log('Done. Run: pm2 restart gantt-api');
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
} finally {
  db.close();
}
