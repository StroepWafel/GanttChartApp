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
db.pragma('foreign_keys = ON');

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

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT
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

// Migration: add user_id to existing tables if missing (for DBs created before multi-user)
// Must run BEFORE creating indexes on user_id columns
// Use plain INTEGER (no REFERENCES) for max SQLite compatibility
function migrateAddUserId(table) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === 'user_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER`);
    }
  } catch (e) {
    console.error(`Migration failed for ${table}:`, e.message);
  }
}

// user_preferences has user_id in PK - requires table rebuild if missing
function migrateUserPreferences() {
  try {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_preferences'").get();
    if (!exists) return;
    const cols = db.prepare('PRAGMA table_info(user_preferences)').all();
    if (cols.some((c) => c.name === 'user_id')) return;
    const adminRow = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
    const adminId = adminRow ? adminRow.id : 1;
    const oldRows = db.prepare('SELECT key, value FROM user_preferences').all();
    db.exec(`
      CREATE TABLE user_preferences_new (
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (user_id, key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    const ins = db.prepare('INSERT INTO user_preferences_new (user_id, key, value) VALUES (?, ?, ?)');
    for (const r of oldRows) ins.run(adminId, r.key, r.value);
    db.exec('DROP TABLE user_preferences');
    db.exec('ALTER TABLE user_preferences_new RENAME TO user_preferences');
  } catch (e) {
    console.error('Migration failed for user_preferences:', e.message);
  }
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
  migrateUserPreferences();

  const userCols = db.prepare("PRAGMA table_info(users)").all();
  if (!userCols.some((c) => c.name === 'is_active')) {
    db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
  }
  if (!userCols.some((c) => c.name === 'email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');
  }
  if (!userCols.some((c) => c.name === 'token_version')) {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0');
  }
  if (!userCols.some((c) => c.name === 'must_change_password')) {
    db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id)');

  const ganttCols = db.prepare("PRAGMA table_info(gantt_expanded)").all();
  const ganttNewExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gantt_expanded_new'").get();
  if (!ganttCols.some((c) => c.name === 'user_id')) {
    if (ganttNewExists) {
      // Leftover from failed migration: complete it by swapping tables
      db.exec('DROP TABLE gantt_expanded');
      db.exec('ALTER TABLE gantt_expanded_new RENAME TO gantt_expanded');
    } else {
      const oldRows = db.prepare('SELECT item_type, item_id, expanded FROM gantt_expanded').all();
      db.exec(`DROP TABLE IF EXISTS gantt_expanded_new`);
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
  } else if (ganttNewExists) {
    db.exec('DROP TABLE gantt_expanded_new');
  }
} catch (e) {
  console.error('Startup migration error:', e?.message || e);
}

// Create indexes (after migrations; skip user_id indexes if column missing)
function createIndexIfColumnExists(table, column, indexName, indexDef) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) return;
    db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}${indexDef}`);
  } catch (e) {
    console.error(`Index ${indexName} failed:`, e.message);
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
  CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id);
`);
createIndexIfColumnExists('categories', 'user_id', 'idx_categories_user', '(user_id)');
createIndexIfColumnExists('projects', 'user_id', 'idx_projects_user', '(user_id)');
createIndexIfColumnExists('tasks', 'user_id', 'idx_tasks_user', '(user_id)');

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
  const username = (process.env.AUTH_USERNAME || process.env.AUTH_EMAIL || 'admin').trim().toLowerCase();
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

/** Run user_id migrations on-demand (e.g. when a route gets "no such column: user_id") */
export function runUserIdMigrations() {
  migrateAddUserId('categories');
  migrateAddUserId('projects');
  migrateAddUserId('tasks');
  migrateUserPreferences();
  const ganttExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gantt_expanded'").get();
  if (!ganttExists) {
    assignOrphanRowsToAdmin();
    return;
  }
  const ganttCols = db.prepare('PRAGMA table_info(gantt_expanded)').all();
  const ganttNewExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gantt_expanded_new'").get();
  if (!ganttCols.some((c) => c.name === 'user_id')) {
    try {
      if (ganttNewExists) {
        db.exec('DROP TABLE gantt_expanded');
        db.exec('ALTER TABLE gantt_expanded_new RENAME TO gantt_expanded');
      } else {
        const oldRows = db.prepare('SELECT item_type, item_id, expanded FROM gantt_expanded').all();
        db.exec('DROP TABLE IF EXISTS gantt_expanded_new');
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
        for (const r of oldRows) ins.run(adminId, r.item_type, r.item_id, r.expanded);
        db.exec('DROP TABLE gantt_expanded');
        db.exec('ALTER TABLE gantt_expanded_new RENAME TO gantt_expanded');
      }
    } catch (e) {
      console.error('On-demand gantt_expanded migration failed:', e.message);
    }
  } else if (ganttNewExists) {
    try {
      db.exec('DROP TABLE gantt_expanded_new');
    } catch (_) {}
  }
  assignOrphanRowsToAdmin();
}

export default db;
