PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_items (
  content_type TEXT NOT NULL CHECK (content_type IN ('character', 'tileset', 'block', 'animation', 'cutscene', 'object')),
  id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
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
  deleted_at TEXT,
  PRIMARY KEY (content_type, id)
);
CREATE INDEX IF NOT EXISTS content_items_updated_at
  ON content_items (updated_at DESC);
CREATE INDEX IF NOT EXISTS content_items_type_status
  ON content_items (content_type, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS content_revisions (
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  document_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  PRIMARY KEY (content_type, content_id, revision),
  FOREIGN KEY (content_type, content_id) REFERENCES content_items(content_type, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_dependencies (
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK (source_revision >= 1),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_revision INTEGER,
  relation TEXT NOT NULL,
  PRIMARY KEY (source_type, source_id, target_type, target_id, relation),
  FOREIGN KEY (source_type, source_id) REFERENCES content_items(content_type, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS content_dependencies_target
  ON content_dependencies (target_type, target_id);

CREATE TABLE IF NOT EXISTS publication_items (
  publication_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  target_path TEXT NOT NULL,
  document_json TEXT NOT NULL,
  PRIMARY KEY (publication_id, content_type, content_id),
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE
);
