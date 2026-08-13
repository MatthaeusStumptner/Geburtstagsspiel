PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS live_releases (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, created_by TEXT NOT NULL, manifest_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS live_release_levels (release_id TEXT NOT NULL, level_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision >= 0), document_json TEXT NOT NULL, PRIMARY KEY (release_id, level_id), FOREIGN KEY (release_id) REFERENCES live_releases(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS live_release_items (release_id TEXT NOT NULL, content_type TEXT NOT NULL, content_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision >= 0), document_json TEXT NOT NULL, PRIMARY KEY (release_id, content_type, content_id), FOREIGN KEY (release_id) REFERENCES live_releases(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS live_release_pointer (slot INTEGER PRIMARY KEY CHECK (slot = 1), release_id TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (release_id) REFERENCES live_releases(id));
