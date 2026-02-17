import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || join(__dirname, '../../data/gantt.db');
const dataDir = dirname(DB_PATH);

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    api_key TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    start_date TEXT,
    due_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    parent_id INTEGER,
    user_id INTEGER,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    due_date TEXT,
    progress INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    completed_at TEXT,
    base_priority INTEGER DEFAULT 5,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS gantt_expanded (
    user_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    expanded INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, item_type, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
  CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id);
  CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
`);

// Migration: add user_id to existing tables if missing (for DBs created before multi-user)
function migrateAddUserId(table, pkColumn) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === 'user_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER REFERENCES users(id)`);
    }
  } catch (_) {}
}

try {
  const projCols = db.prepare("PRAGMA table_info(projects)").all();
  if (!projCols.some((c) => c.name === 'due_date')) {
    db.exec('ALTER TABLE projects ADD COLUMN due_date TEXT');
  }
  if (!projCols.some((c) => c.name === 'start_date')) {
    db.exec('ALTER TABLE projects ADD COLUMN start_date TEXT');
  }

  migrateAddUserId('categories');
  migrateAddUserId('projects');
  migrateAddUserId('tasks');

  const userCols = db.prepare("PRAGMA table_info(users)").all();
  if (!userCols.some((c) => c.name === 'is_active')) {
    db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
  }

  const ganttCols = db.prepare("PRAGMA table_info(gantt_expanded)").all();
  if (!ganttCols.some((c) => c.name === 'user_id')) {
    const oldRows = db.prepare('SELECT item_type, item_id, expanded FROM gantt_expanded').all();
    db.exec(`
      CREATE TABLE gantt_expanded_new (
        user_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        expanded INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, item_type, item_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    const adminRow = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
    const adminId = adminRow ? adminRow.id : 1;
    const ins = db.prepare('INSERT INTO gantt_expanded_new (user_id, item_type, item_id, expanded) VALUES (?, ?, ?, ?)');
    for (const r of oldRows) {
      ins.run(adminId, r.item_type, r.item_id, r.expanded);
    }
    db.exec('DROP TABLE gantt_expanded');
    db.exec('ALTER TABLE gantt_expanded_new RENAME TO gantt_expanded');
  }
} catch (_) {}

// Migration: assign user_id to orphan rows (existing data before multi-user)
function assignOrphanRowsToAdmin() {
  const admin = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
  if (!admin) return;
  const aid = admin.id;
  try {
    db.prepare('UPDATE categories SET user_id = ? WHERE user_id IS NULL').run(aid);
    db.prepare('UPDATE projects SET user_id = ? WHERE user_id IS NULL').run(aid);
    db.prepare('UPDATE tasks SET user_id = ? WHERE user_id IS NULL').run(aid);
    db.prepare('UPDATE gantt_expanded SET user_id = ? WHERE user_id IS NULL').run(aid);
  } catch (_) {}
}

// Seed admin user from env when AUTH_ENABLED and users table empty
function seedAdminUser() {
  const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
  if (!AUTH_ENABLED) return;
  const username = process.env.AUTH_USERNAME || process.env.AUTH_EMAIL || 'admin';
  const plainPassword = process.env.AUTH_PASSWORD;
  const passwordHash = process.env.AUTH_PASSWORD_HASH;

  if (!passwordHash && !plainPassword) return;

  const existing = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (existing) {
    assignOrphanRowsToAdmin();
    return;
  }

  const hash = passwordHash || (plainPassword ? bcrypt.hashSync(plainPassword, 10) : null);
  if (!hash) return;

  const apiKey = randomUUID();
  db.prepare(`
    INSERT INTO users (username, password_hash, is_admin, api_key)
    VALUES (?, ?, 1, ?)
  `).run(username, hash, apiKey);
  assignOrphanRowsToAdmin();
}

seedAdminUser();

export default db;
