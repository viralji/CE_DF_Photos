-- Database schema for CE_DF_Photos (SQLite)
-- Version: entities, checkpoints.entity_id, subsection_allowed_emails, photo_submissions.resubmission_of_id, app_settings, routes.length, subsections.length. Subsections unique key: (route_id, subsection_id); subsection_id comes from ERP report.
--
-- Deployment (e.g. Digital Ocean): Use "npm run db:setup" then "npm run db:seed-entities-checkpoints".
-- db:setup loads this schema on first run and applies all in-code migrations (lib/db.ts), including resubmission_of_id, app_settings, routes/subsections length.
-- New installs: schema is applied via getDb() in lib/db.ts. Existing DBs: run db:setup (idempotent).

CREATE TABLE IF NOT EXISTS routes (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL UNIQUE,
  route_name TEXT NOT NULL,
  length REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subsections (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  subsection_id TEXT NOT NULL,
  subsection_name TEXT NOT NULL,
  length REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE CASCADE,
  UNIQUE(route_id, subsection_id)
);

CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  checkpoint_name TEXT NOT NULL,
  code TEXT,
  display_order INTEGER DEFAULT 0,
  evidence_type TEXT NOT NULL,
  description TEXT,
  execution_stage TEXT DEFAULT 'Ongoing',
  execution_before INTEGER DEFAULT 0,
  execution_ongoing INTEGER DEFAULT 0,
  execution_after INTEGER DEFAULT 0,
  photo_type INTEGER,
  doc_type INTEGER,
  frequency TEXT,
  specs TEXT,
  photo_spec_1 TEXT,
  photo_spec_2 TEXT,
  photo_spec_3 TEXT,
  photo_spec_4 TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE RESTRICT,
  UNIQUE(entity_id, checkpoint_name)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image_url TEXT,
  role TEXT DEFAULT 'field_worker',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- photo_submissions: route_id/subsection_id are INTEGER (legacy). routes/subsections use TEXT; app uses CAST in JOINs where needed.
CREATE TABLE IF NOT EXISTS photo_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL,
  subsection_id INTEGER NOT NULL,
  checkpoint_id INTEGER,
  user_id INTEGER,
  execution_stage TEXT NOT NULL,
  photo_type_number INTEGER,
  photo_category TEXT,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_original_size INTEGER,
  file_last_modified INTEGER,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  format TEXT,
  latitude REAL,
  longitude REAL,
  location_accuracy REAL,
  metadata TEXT,
  status TEXT DEFAULT 'pending',
  reviewer_id INTEGER,
  reviewed_at DATETIME,
  review_comment TEXT,
  resubmission_of_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_id) REFERENCES routes(route_id),
  FOREIGN KEY (route_id, subsection_id) REFERENCES subsections(route_id, subsection_id),
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (reviewer_id) REFERENCES users(id),
  FOREIGN KEY (resubmission_of_id) REFERENCES photo_submissions(id)
);

CREATE TABLE IF NOT EXISTS document_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  subsection_id TEXT NOT NULL,
  checkpoint_id INTEGER,
  user_id INTEGER,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  metadata TEXT,
  status TEXT DEFAULT 'pending',
  reviewer_id INTEGER,
  reviewed_at DATETIME,
  review_comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_id) REFERENCES routes(route_id),
  FOREIGN KEY (route_id, subsection_id) REFERENCES subsections(route_id, subsection_id),
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS subsection_allowed_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  subsection_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(route_id, subsection_id, email),
  FOREIGN KEY (route_id, subsection_id) REFERENCES subsections(route_id, subsection_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS photo_submission_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_submission_id INTEGER NOT NULL,
  user_id INTEGER,
  author_email TEXT NOT NULL,
  author_name TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  comment_text TEXT NOT NULL,
  FOREIGN KEY (photo_submission_id) REFERENCES photo_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_photo_submission_comments_photo ON photo_submission_comments(photo_submission_id);

CREATE INDEX IF NOT EXISTS idx_photo_submissions_route ON photo_submissions(route_id);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_subsection ON photo_submissions(subsection_id);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_file_fingerprint ON photo_submissions(file_original_size, file_last_modified);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_route_sub_status ON photo_submissions(route_id, subsection_id, status);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_checkpoint ON photo_submissions(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_user ON photo_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_status ON photo_submissions(status);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_location ON photo_submissions(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_resubmission_of ON photo_submissions(resubmission_of_id);
CREATE INDEX IF NOT EXISTS idx_subsections_route ON subsections(route_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_entity_id ON checkpoints(entity_id);
CREATE INDEX IF NOT EXISTS idx_entities_display_order ON entities(display_order);

CREATE TABLE IF NOT EXISTS user_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_email TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('question', 'suggestion')),
  content TEXT NOT NULL,
  response TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_feedback_author ON user_feedback(author_email);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created ON user_feedback(created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('capture_distance_check_enabled', '1');
