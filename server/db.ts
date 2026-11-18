import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), process.env.ELECTROSKU_DATA_DIR || './data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'electrosku.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    file_size INTEGER NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL DEFAULT '',
    captured_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inspections (
    id TEXT PRIMARY KEY,
    capture_id TEXT NOT NULL,
    status TEXT NOT NULL,
    board_type TEXT NOT NULL DEFAULT '',
    likely_application TEXT NOT NULL DEFAULT '',
    board_summary TEXT NOT NULL DEFAULT '',
    report_json TEXT,
    error_message TEXT,
    model_used TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS components (
    id TEXT PRIMARY KEY,
    inspection_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    marking TEXT NOT NULL,
    quantity_estimate INTEGER NOT NULL DEFAULT 1,
    likely_function TEXT NOT NULL,
    confidence TEXT NOT NULL,
    confidence_reason TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    inspection_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    estimated_build_time TEXT NOT NULL,
    components_required_json TEXT NOT NULL,
    components_available_json TEXT NOT NULL,
    additional_components_json TEXT NOT NULL,
    learning_outcomes_json TEXT NOT NULL,
    suitability_explanation TEXT NOT NULL,
    compatibility_checks_json TEXT NOT NULL,
    block_diagram_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_inspections_created_at ON inspections(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_captures_created_at ON captures(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_components_inspection ON components(inspection_id);
  CREATE INDEX IF NOT EXISTS idx_recommendations_inspection ON recommendations(inspection_id);
`);

export function getDataPaths() {
  return {
    dataDir: DATA_DIR,
    uploadsDir: UPLOADS_DIR,
    dbPath: DB_PATH,
  };
}
