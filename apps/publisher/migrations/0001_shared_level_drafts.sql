PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS level_drafts (
  id TEXT PRIMARY KEY,
  name_standard TEXT NOT NULL,
  icon TEXT NOT NULL,
  area TEXT NOT NULL,
  document_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'publishing', 'published', 'deleted')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_revision INTEGER,
  published_commit_sha TEXT,
  published_document_json TEXT,
  publication_id INTEGER,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS level_drafts_updated_at
  ON level_drafts (updated_at DESC);

CREATE TABLE IF NOT EXISTS level_revisions (
  level_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  document_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  PRIMARY KEY (level_id, revision),
  FOREIGN KEY (level_id) REFERENCES level_drafts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS publications (
  id INTEGER PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('testing', 'published', 'failed')),
  commit_sha TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publication_levels (
  publication_id INTEGER NOT NULL,
  level_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  document_json TEXT NOT NULL,
  PRIMARY KEY (publication_id, level_id),
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE
);
