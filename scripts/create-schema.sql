-- Database schema for CE_DF_Photos (SQLite)

CREATE TABLE IF NOT EXISTS routes (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL UNIQUE,
  route_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subsections (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  subsection_id TEXT NOT NULL,
  subsection_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE CASCADE,
  UNIQUE(route_id, subsection_id)
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  checkpoint_name TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  description TEXT,
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
  UNIQUE(entity, checkpoint_name)
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_id) REFERENCES routes(route_id),
  FOREIGN KEY (route_id, subsection_id) REFERENCES subsections(route_id, subsection_id),
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
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

CREATE INDEX IF NOT EXISTS idx_photo_submissions_route ON photo_submissions(route_id);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_subsection ON photo_submissions(subsection_id);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_route_sub_status ON photo_submissions(route_id, subsection_id, status);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_checkpoint ON photo_submissions(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_user ON photo_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_status ON photo_submissions(status);
CREATE INDEX IF NOT EXISTS idx_photo_submissions_location ON photo_submissions(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_subsections_route ON subsections(route_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_entity ON checkpoints(entity);
