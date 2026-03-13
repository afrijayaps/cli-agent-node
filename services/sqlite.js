const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const { DATA_DIR, path } = require('./storage');

const DB_FILE = path.join(DATA_DIR, 'app.sqlite');

let dbInstance = null;

function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new DatabaseSync(DB_FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      theme TEXT NOT NULL,
      master_project_root TEXT NOT NULL,
      ai_primary TEXT NOT NULL,
      ai_fallback TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_project_path
      ON projects(project_path);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      preferences_json TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project_updated
      ON sessions(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT,
      scope TEXT NOT NULL CHECK (scope IN ('project', 'session')),
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_scope_target
      ON memories(project_id, scope, session_id);
  `);

  dbInstance = db;
  return dbInstance;
}

module.exports = {
  DB_FILE,
  getDb,
};
