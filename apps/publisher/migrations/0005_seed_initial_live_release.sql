PRAGMA foreign_keys = ON;

-- Adopt the existing canonical D1 state once. Future releases are created by the Worker.
INSERT INTO live_releases (id, created_at, created_by, manifest_json)
SELECT
  'initial-d1-release',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'migration',
  json_object(
    'kind', 'franz-lola-live-release',
    'schemaVersion', 1,
    'id', 'initial-d1-release',
    'createdAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    'createdBy', 'migration',
    'levels', json((SELECT json_group_array(json_object(
      'id', id, 'revision', revision, 'document', json(document_json)
    )) FROM (SELECT id, revision, document_json FROM level_drafts WHERE deleted_at IS NULL ORDER BY id))),
    'items', json('[]')
  )
WHERE EXISTS (SELECT 1 FROM level_drafts WHERE deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM live_release_pointer WHERE slot = 1);

INSERT OR IGNORE INTO live_release_levels (release_id, level_id, revision, document_json)
SELECT 'initial-d1-release', id, revision, document_json
  FROM level_drafts
 WHERE deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM live_releases WHERE id = 'initial-d1-release');

INSERT INTO live_release_pointer (slot, release_id, updated_at)
SELECT 1, id, created_at FROM live_releases WHERE id = 'initial-d1-release'
  AND NOT EXISTS (SELECT 1 FROM live_release_pointer WHERE slot = 1);

UPDATE level_drafts
   SET published_revision = revision, published_document_json = document_json,
       published_commit_sha = 'live:initial-d1-release', status = 'published', publication_id = NULL
 WHERE deleted_at IS NULL
   AND (SELECT release_id FROM live_release_pointer WHERE slot = 1) = 'initial-d1-release';
