import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

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
              console.error('Schema setup error:', err.message);
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      }
    }

    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 10000');
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
    console.error('Query error:', error);
    throw error;
  }
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
