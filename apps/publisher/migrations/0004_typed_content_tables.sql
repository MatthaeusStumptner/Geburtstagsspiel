PRAGMA foreign_keys = ON;

-- Reusable definitions get physical tables so they can evolve independently.
-- The old content_items/content_revisions tables remain untouched as a rollback copy.
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', document_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','publishing','published','deleted')),
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, published_revision INTEGER, published_commit_sha TEXT,
  published_document_json TEXT, publication_id INTEGER, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS tilesets (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', document_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','publishing','published','deleted')),
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, published_revision INTEGER, published_commit_sha TEXT,
  published_document_json TEXT, publication_id INTEGER, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', document_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','publishing','published','deleted')),
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, published_revision INTEGER, published_commit_sha TEXT,
  published_document_json TEXT, publication_id INTEGER, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS animations (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', document_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','publishing','published','deleted')),
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, published_revision INTEGER, published_commit_sha TEXT,
  published_document_json TEXT, publication_id INTEGER, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS cutscenes (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', document_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','publishing','published','deleted')),
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, published_revision INTEGER, published_commit_sha TEXT,
  published_document_json TEXT, publication_id INTEGER, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', document_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','publishing','published','deleted')),
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, published_revision INTEGER, published_commit_sha TEXT,
  published_document_json TEXT, publication_id INTEGER, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', document_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','publishing','published','deleted')),
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, published_revision INTEGER, published_commit_sha TEXT,
  published_document_json TEXT, publication_id INTEGER, deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS characters_updated_at ON characters(updated_at DESC);
CREATE INDEX IF NOT EXISTS tilesets_updated_at ON tilesets(updated_at DESC);
CREATE INDEX IF NOT EXISTS blocks_updated_at ON blocks(updated_at DESC);
CREATE INDEX IF NOT EXISTS animations_updated_at ON animations(updated_at DESC);
CREATE INDEX IF NOT EXISTS cutscenes_updated_at ON cutscenes(updated_at DESC);
CREATE INDEX IF NOT EXISTS assets_updated_at ON assets(updated_at DESC);
CREATE INDEX IF NOT EXISTS events_updated_at ON events(updated_at DESC);

CREATE TABLE IF NOT EXISTS entity_revisions (
  content_type TEXT NOT NULL, content_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision >= 1),
  document_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, action TEXT NOT NULL,
  PRIMARY KEY (content_type, content_id, revision)
);
CREATE TABLE IF NOT EXISTS entity_dependencies (
  source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_revision INTEGER NOT NULL CHECK (source_revision >= 1),
  target_type TEXT NOT NULL, target_id TEXT NOT NULL, target_revision INTEGER, relation TEXT NOT NULL,
  PRIMARY KEY (source_type, source_id, target_type, target_id, relation)
);
CREATE INDEX IF NOT EXISTS entity_dependencies_target ON entity_dependencies(target_type, target_id);

INSERT OR IGNORE INTO characters SELECT id, display_name, description, document_json, revision, status, updated_by, updated_at, published_revision, published_commit_sha, published_document_json, publication_id, deleted_at FROM content_items WHERE content_type = 'character';
INSERT OR IGNORE INTO tilesets SELECT id, display_name, description, document_json, revision, status, updated_by, updated_at, published_revision, published_commit_sha, published_document_json, publication_id, deleted_at FROM content_items WHERE content_type = 'tileset';
INSERT OR IGNORE INTO blocks SELECT id, display_name, description, document_json, revision, status, updated_by, updated_at, published_revision, published_commit_sha, published_document_json, publication_id, deleted_at FROM content_items WHERE content_type = 'block';
INSERT OR IGNORE INTO animations SELECT id, display_name, description, document_json, revision, status, updated_by, updated_at, published_revision, published_commit_sha, published_document_json, publication_id, deleted_at FROM content_items WHERE content_type = 'animation';
INSERT OR IGNORE INTO cutscenes SELECT id, display_name, description, document_json, revision, status, updated_by, updated_at, published_revision, published_commit_sha, published_document_json, publication_id, deleted_at FROM content_items WHERE content_type = 'cutscene';
INSERT OR IGNORE INTO assets SELECT id, display_name, description, document_json, revision, status, updated_by, updated_at, published_revision, published_commit_sha, published_document_json, publication_id, deleted_at FROM content_items WHERE content_type = 'object';
INSERT OR IGNORE INTO events SELECT id, display_name, description, document_json, revision, status, updated_by, updated_at, published_revision, published_commit_sha, published_document_json, publication_id, deleted_at FROM content_items WHERE content_type = 'event';
INSERT OR IGNORE INTO entity_revisions SELECT content_type, content_id, revision, document_json, created_by, created_at, action FROM content_revisions;
INSERT OR IGNORE INTO entity_dependencies SELECT source_type, source_id, source_revision, target_type, target_id, target_revision, relation FROM content_dependencies;
