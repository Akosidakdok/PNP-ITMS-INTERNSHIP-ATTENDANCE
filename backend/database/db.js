const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'pnp_itms.db');

let client;

function getDb() {
  if (!client) {
    client = createClient({
      url: `file:${DB_PATH}`,
    });
  }
  return client;
}

function sanitizeBigInt(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeBigInt);
  }
  if (value !== null && typeof value === 'object') {
    // Avoid double sanitizing if it's already an array or something we don't want to touch
    if (value.constructor && value.constructor.name !== 'Object' && value.constructor.name !== 'Row') {
      return value;
    }
    const res = {};
    for (const key of Object.keys(value)) {
      res[key] = sanitizeBigInt(value[key]);
    }
    return res;
  }
  return value;
}

async function run(sql, args = []) {
  const db = getDb();
  const result = await db.execute({ sql, args });
  return {
    rowsAffected: result.rowsAffected,
    lastInsertRowid: result.lastInsertRowid !== undefined ? Number(result.lastInsertRowid) : undefined
  };
}

async function get(sql, args = []) {
  const db = getDb();
  const result = await db.execute({ sql, args });
  const row = result.rows[0];
  return row ? sanitizeBigInt(row) : null;
}

async function all(sql, args = []) {
  const db = getDb();
  const result = await db.execute({ sql, args });
  return result.rows.map(row => sanitizeBigInt(row));
}

async function initializeDatabase() {
  const db = getDb();

  await db.executeMultiple(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'intern')),
      is_active INTEGER DEFAULT 1,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      head_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      school TEXT,
      course TEXT,
      year_level TEXT,
      department_id INTEGER REFERENCES departments(id),
      required_hours INTEGER DEFAULT 486,
      rendered_hours REAL DEFAULT 0,
      start_date DATE,
      end_date DATE,
      student_id TEXT,
      home_address TEXT,
      emergency_name TEXT,
      emergency_relation TEXT,
      emergency_phone TEXT,
      profile_photo TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'dropped')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intern_id INTEGER NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
      scan_type TEXT NOT NULL CHECK(scan_type IN ('time_in', 'time_out')),
      scan_time DATETIME NOT NULL,
      scan_status TEXT DEFAULT 'valid' CHECK(scan_status IN ('valid', 'duplicate', 'invalid')),
      approval_status TEXT DEFAULT 'pending' CHECK(approval_status IN ('pending', 'approved', 'rejected')),
      approved_by INTEGER REFERENCES users(id),
      approved_at DATETIME,
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dtr_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intern_id INTEGER NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      time_in TIME,
      time_out TIME,
      total_hours REAL DEFAULT 0,
      remarks TEXT,
      approval_status TEXT DEFAULT 'pending' CHECK(approval_status IN ('pending', 'approved', 'rejected')),
      approved_by INTEGER REFERENCES users(id),
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(intern_id, date)
    );

    CREATE TABLE IF NOT EXISTS uploaded_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intern_id INTEGER NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'revision')),
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at DATETIME,
      admin_remarks TEXT,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS performance_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intern_id INTEGER NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
      evaluated_by INTEGER NOT NULL REFERENCES users(id),
      evaluation_date DATE NOT NULL,
      work_quality REAL DEFAULT 0,
      punctuality REAL DEFAULT 0,
      teamwork REAL DEFAULT 0,
      communication REAL DEFAULT 0,
      initiative REAL DEFAULT 0,
      overall_score REAL DEFAULT 0,
      overall_rating TEXT,
      comments TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      reference_id INTEGER,
      reference_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS office_qr (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qr_code TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_intern ON attendance_logs(intern_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_time ON attendance_logs(scan_time);
    CREATE INDEX IF NOT EXISTS idx_dtr_intern_date ON dtr_records(intern_id, date);
    CREATE INDEX IF NOT EXISTS idx_docs_intern ON uploaded_documents(intern_id);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
  `);

  // Alter table columns if they do not exist
  try { await db.execute("ALTER TABLE interns ADD COLUMN student_id TEXT"); } catch (e) {}
  try { await db.execute("ALTER TABLE interns ADD COLUMN home_address TEXT"); } catch (e) {}
  try { await db.execute("ALTER TABLE interns ADD COLUMN emergency_name TEXT"); } catch (e) {}
  try { await db.execute("ALTER TABLE interns ADD COLUMN emergency_relation TEXT"); } catch (e) {}
  try { await db.execute("ALTER TABLE interns ADD COLUMN emergency_phone TEXT"); } catch (e) {}

  console.log('✅ Database initialized successfully');
}

module.exports = { getDb, initializeDatabase, run, get, all };
