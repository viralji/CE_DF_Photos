import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logError } from './safe-log';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_URL || process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'ce_df_photos.db');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    const needsSchema = (() => {
      try {
        const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='routes'").get();
        return !row;
      } catch {
        return true;
      }
    })();

    if (needsSchema) {
      const schemaPath = path.join(process.cwd(), 'scripts', 'create-schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        const statements = schema
          .split(';')
          .map((s) =>
            s
              .split('\n')
              .filter((line) => !line.trim().startsWith('--'))
              .join('\n')
              .trim()
          )
          .filter((s) => s.length > 0);
        for (const statement of statements) {
          try {
            db.exec(statement + ';');
          } catch (error: unknown) {
            const err = error as { message?: string };
            if (!err.message?.includes('already exists')) {
              logError('Schema setup', err);
            }
          }
        }
      }
      // Defensive: ensure routes exists (handles existing DBs created before schema fix)
      const routesExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='routes'").get();
      if (!routesExists) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS routes (
            row_id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id TEXT NOT NULL UNIQUE,
            route_name TEXT NOT NULL,
            length REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      }
    }
    // routes.length and subsections.length (ERP sync)
    try {
      const routeCols = db.prepare("PRAGMA table_info(routes)").all() as { name: string }[];
      const routeNames = new Set(routeCols.map((c) => c.name));
      if (!routeNames.has('length')) {
        db.exec('ALTER TABLE routes ADD COLUMN length REAL');
      }
      const subCols = db.prepare("PRAGMA table_info(subsections)").all() as { name: string }[];
      const subNames = new Set(subCols.map((c) => c.name));
      if (!subNames.has('length')) {
        db.exec('ALTER TABLE subsections ADD COLUMN length REAL');
      }
    } catch {
      // ignore
    }

    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 15000');
    db.pragma('cache_size = -64000');
    db.pragma('temp_store = MEMORY');
    try {
      db.pragma('mmap_size = 67108864');
    } catch {
      // ignore
    }
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_photo_submissions_route_sub_status ON photo_submissions(route_id, subsection_id, status)');
    } catch {
      // ignore
    }
    // Duplicate photo check: add file fingerprint columns if missing
    try {
      const cols = db.prepare("PRAGMA table_info(photo_submissions)").all() as { name: string }[];
      const names = new Set(cols.map((c) => c.name));
      if (!names.has('file_original_size')) {
        db.exec('ALTER TABLE photo_submissions ADD COLUMN file_original_size INTEGER');
      }
      if (!names.has('file_last_modified')) {
        db.exec('ALTER TABLE photo_submissions ADD COLUMN file_last_modified INTEGER');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_photo_submissions_file_fingerprint ON photo_submissions(file_original_size, file_last_modified)');
    } catch {
      // ignore
    }
    // subsection_allowed_emails: create if missing (e.g. DB created before this table existed)
    try {
      const hasSubsectionEmails = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='subsection_allowed_emails'").get();
      if (!hasSubsectionEmails) {
        db.exec(`
          CREATE TABLE subsection_allowed_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id TEXT NOT NULL,
            subsection_id TEXT NOT NULL,
            email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(route_id, subsection_id, email)
          )
        `);
      }
    } catch {
      // ignore
    }
    // photo_submission_comments: normalized comment history for QC/NC workflow
    try {
      const hasCommentsTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='photo_submission_comments'").get();
      if (!hasCommentsTable) {
        db.exec(`
          CREATE TABLE photo_submission_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            photo_submission_id INTEGER NOT NULL,
            user_id INTEGER,
            author_email TEXT NOT NULL,
            author_name TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            comment_text TEXT NOT NULL,
            FOREIGN KEY (photo_submission_id) REFERENCES photo_submissions(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_photo_submission_comments_photo ON photo_submission_comments(photo_submission_id)');
        // Migrate existing review_comment into first comment row (once)
        const withComment = db.prepare(
          `SELECT ps.id, ps.review_comment, ps.reviewer_id, ps.reviewed_at FROM photo_submissions ps
           WHERE ps.review_comment IS NOT NULL AND TRIM(ps.review_comment) != ''`
        ).all() as { id: number; review_comment: string; reviewer_id: number | null; reviewed_at: string | null }[];
        for (const row of withComment) {
          const reviewer = row.reviewer_id
            ? db.prepare('SELECT email, name FROM users WHERE id = ?').get(row.reviewer_id) as { email: string; name: string | null } | undefined
            : null;
          const authorEmail = reviewer?.email ?? 'unknown';
          const authorName = reviewer?.name ?? null;
          const createdAt = row.reviewed_at ?? new Date().toISOString();
          try {
            db.prepare(
              'INSERT INTO photo_submission_comments (photo_submission_id, user_id, author_email, author_name, created_at, comment_text) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(row.id, row.reviewer_id, authorEmail, authorName, createdAt, row.review_comment);
          } catch {
            // ignore
          }
        }
        db.prepare("UPDATE photo_submissions SET status = 'nc' WHERE status = 'rejected'").run();
      } else {
        // Table exists (e.g. new install); ensure no 'rejected' status remains
        db.prepare("UPDATE photo_submissions SET status = 'nc' WHERE status = 'rejected'").run();
      }
    } catch {
      // ignore
    }
    // Bootstrap first Admin
    try {
      db.prepare("UPDATE users SET role = 'Admin' WHERE email = 'v.shah@cloudextel.com'").run();
    } catch {
      // ignore
    }
    // user_feedback: questions and suggestions (Dashboard)
    try {
      const hasFeedback = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_feedback'").get();
      if (!hasFeedback) {
        db.exec(`
          CREATE TABLE user_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_email TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('question', 'suggestion')),
            content TEXT NOT NULL,
            response TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_user_feedback_author ON user_feedback(author_email)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_user_feedback_created ON user_feedback(created_at)');
      }
    } catch {
      // ignore
    }
    // resubmission_of_id: photo resubmission history (review workflow)
    try {
      const cols = db.prepare("PRAGMA table_info(photo_submissions)").all() as { name: string }[];
      const hasResubmissionOf = cols.some((c) => c.name === 'resubmission_of_id');
      if (!hasResubmissionOf) {
        db.exec('ALTER TABLE photo_submissions ADD COLUMN resubmission_of_id INTEGER REFERENCES photo_submissions(id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_photo_submissions_resubmission_of ON photo_submissions(resubmission_of_id)');
      }
    } catch {
      // ignore
    }
    // app_settings: capture distance check and other app-level settings
    try {
      const hasAppSettings = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_settings'").get();
      if (!hasAppSettings) {
        db.exec(`
          CREATE TABLE app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `);
        db.prepare("INSERT INTO app_settings (key, value) VALUES ('capture_distance_check_enabled', '1')").run();
      }
    } catch {
      // ignore
    }
  }
  return db;
}

export function query(sql: string, params: unknown[] = []): { rows: unknown[]; rowCount: number } {
  const database = getDb();
  try {
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      const stmt = database.prepare(sql);
      const rows = stmt.all(...params);
      return { rows: rows as unknown[], rowCount: rows.length };
    } else {
      const stmt = database.prepare(sql);
      const result = stmt.run(...params);
      return {
        rows: result.lastInsertRowid ? [{ id: Number(result.lastInsertRowid) }] : [],
        rowCount: result.changes || 0,
      };
    }
  } catch (error) {
    logError('Query', error);
    throw error;
  }
}

/** Max OR conditions before using temp table (avoids SQLite "Expression tree is too large"). */
const MAX_OR_KEYS = 200;

/**
 * Build WHERE fragment for (route_id, subsection_id) in allowed keys.
 * Uses a temp table when keys.length > MAX_OR_KEYS to avoid expression tree depth limit.
 * @param keys - "route_id::subsection_id" strings
 * @param columnPrefix - e.g. "" for subsections, "ps." for photo_submissions
 */
export function buildAllowedKeysFilter(
  keys: string[],
  columnPrefix = ''
): { whereClause: string; params: unknown[] } {
  const r = columnPrefix ? `${columnPrefix}route_id` : 'route_id';
  const s = columnPrefix ? `${columnPrefix}subsection_id` : 'subsection_id';
  if (keys.length <= MAX_OR_KEYS) {
    const conditions = keys.map(() => `(${r} = ? AND ${s} = ?)`);
    return {
      whereClause: '(' + conditions.join(' OR ') + ')',
      params: keys.flatMap((k) => {
        const [a, b] = k.split('::');
        return [a, b];
      }),
    };
  }
  const database = getDb();
  database.exec('CREATE TEMP TABLE IF NOT EXISTS _allowed_keys (route_id TEXT, subsection_id TEXT)');
  database.prepare('DELETE FROM _allowed_keys').run();
  const insert = database.prepare('INSERT INTO _allowed_keys (route_id, subsection_id) VALUES (?, ?)');
  for (const k of keys) {
    const [a, b] = k.split('::');
    insert.run(a, b);
  }
  return {
    whereClause: `(${r}, ${s}) IN (SELECT route_id, subsection_id FROM _allowed_keys)`,
    params: [],
  };
}

export function insertAndGet(sql: string, params: unknown[] = []): unknown {
  const database = getDb();
  const stmt = database.prepare(sql);
  const result = stmt.run(...params);
  if (result.lastInsertRowid) {
    const match = sql.match(/INTO\s+(\w+)/i);
    const table = match?.[1];
    if (table) {
      const selectStmt = database.prepare(`SELECT * FROM ${table} WHERE id = ?`);
      return selectStmt.get(result.lastInsertRowid);
    }
  }
  return null;
}
