import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || join(__dirname, '../../data/gantt.db');
const dataDir = dirname(DB_PATH);

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    start_date TEXT,
    due_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    parent_id INTEGER,
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
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
  CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id);

  CREATE TABLE IF NOT EXISTS gantt_expanded (
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    expanded INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (item_type, item_id)
  );
`);

// Migration: add due_date to projects if missing (for existing DBs)
try {
  const cols = db.prepare("PRAGMA table_info(projects)").all();
  if (!cols.some((c) => c.name === 'due_date')) {
    db.exec('ALTER TABLE projects ADD COLUMN due_date TEXT');
  }
  if (!cols.some((c) => c.name === 'start_date')) {
    db.exec('ALTER TABLE projects ADD COLUMN start_date TEXT');
  }
} catch (_) {}

export default db;
