import { CONTENT_TYPES, validateContentDocument } from '@franz-lola/pixel-renderer';

const REGISTRY_TYPES = Object.freeze(CONTENT_TYPES.filter((type) => type !== 'level'));
const MAX_CONTENT_BYTES = 1_000_000;
const MAX_REFERENCES = 20;
const RETAINED_REVISIONS = 20;
const encoder = new TextEncoder();

export class ContentConflictError extends Error {
  constructor(message, current = null) {
    super(message);
    this.name = 'ContentConflictError';
    this.status = 409;
    this.current = current;
  }
}

export class ContentNotFoundError extends Error {
  constructor(type, id) {
    super(`Der Inhalt „${type}:${id}“ wurde nicht gefunden.`);
    this.name = 'ContentNotFoundError';
    this.status = 404;
  }
}

function assertDatabase(db) {
  if (!db?.prepare || !db?.batch) throw new Error('Die gemeinsame D1-Datenbank ist nicht gebunden.');
}

export function assertContentType(value) {
  const type = String(value ?? '');
  if (!REGISTRY_TYPES.includes(type)) throw new Error('Dieser Inhaltstyp gehört nicht in die gemeinsame Bibliothek.');
  return type;
}

export function assertContentId(value) {
  const id = String(value ?? '');
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('Die Content-ID ist ungültig.');
  return id;
}

function normalizeContent(input) {
  const validation = validateContentDocument(input);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const content = validation.value;
  assertContentType(content.type);
  assertContentId(content.id);
  const documentJson = JSON.stringify(content);
  if (encoder.encode(documentJson).byteLength > MAX_CONTENT_BYTES) throw new Error('Der Bibliotheksinhalt ist größer als 1 MB.');
  return { content, documentJson };
}

function parseContent(value) {
  try { return JSON.parse(value); } catch { throw new Error('Der Bibliotheksinhalt enthält beschädigtes JSON.'); }
}

function publicItem(row, { includeContent = true } = {}) {
  if (!row) return null;
  return {
    type: row.content_type,
    id: row.id,
    name: row.display_name,
    description: row.description,
    revision: Number(row.revision),
    status: row.status,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    publishedRevision: row.published_revision == null ? null : Number(row.published_revision),
    publishedCommit: row.published_commit_sha || '',
    publicationId: row.publication_id == null ? null : Number(row.publication_id),
    ...(includeContent ? { content: parseContent(row.document_json) } : {}),
  };
}

async function contentRow(db, type, id, { includeDeleted = false } = {}) {
  assertDatabase(db);
  return db.prepare(`/* content-by-id */
    SELECT content_type, id, display_name, description, document_json, revision, status,
           updated_by, updated_at, published_revision, published_commit_sha,
           published_document_json, publication_id, deleted_at
      FROM content_items
     WHERE content_type = ? AND id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`)
    .bind(assertContentType(type), assertContentId(id)).first();
}

export async function listContentItems(db, { type = '', includeContent = false } = {}) {
  assertDatabase(db);
  const normalizedType = type ? assertContentType(type) : '';
  const result = await db.prepare(`/* list-content */
    SELECT content_type, id, display_name, description, ${includeContent ? 'document_json,' : ''}
           revision, status, updated_by, updated_at, published_revision, published_commit_sha, publication_id
      FROM content_items
     WHERE deleted_at IS NULL ${normalizedType ? 'AND content_type = ?' : ''}
     ORDER BY content_type ASC, updated_at DESC, id ASC`)
    .bind(...(normalizedType ? [normalizedType] : [])).all();
  return result.results.map((row) => publicItem(row, { includeContent }));
}

export async function readContentItem(db, type, id) {
  const row = await contentRow(db, type, id);
  if (!row) throw new ContentNotFoundError(assertContentType(type), assertContentId(id));
  return publicItem(row);
}

async function conflict(db, type, id) {
  const current = await contentRow(db, type, id).catch(() => null);
  return new ContentConflictError('Dieser Inhalt wurde inzwischen auf einem anderen Gerät geändert.', publicItem(current, { includeContent: false }));
}

async function pruneRevisions(db, type, id) {
  await db.prepare(`/* prune-content-revisions */
    DELETE FROM content_revisions
     WHERE content_type = ? AND content_id = ?
       AND action NOT IN ('published', 'published-sync')
       AND revision NOT IN (
         SELECT revision FROM content_revisions
          WHERE content_type = ? AND content_id = ?
          ORDER BY revision DESC LIMIT ?
       )`).bind(type, id, type, id, RETAINED_REVISIONS).run();
}

export async function saveContentItem(db, input, { expectedRevision = 0, login, action = 'save' } = {}) {
  assertDatabase(db);
  const { content, documentJson } = normalizeContent(input);
  const { type, id } = content;
  const editor = String(login || '').slice(0, 160);
  if (!editor) throw new Error('Für den Bibliotheksinhalt fehlt die Redaktion.');
  const expected = Number(expectedRevision);
  if (!Number.isInteger(expected) || expected < 0) throw new Error('Die erwartete Content-Revision ist ungültig.');
  const current = await contentRow(db, type, id, { includeDeleted: true });
  if (current && !current.deleted_at && current.document_json === documentJson) return { ...publicItem(current), unchanged: true };
  const baseRevision = current?.deleted_at && expected === 0 ? Number(current.revision) : expected;
  if ((!current && baseRevision !== 0) || (current && Number(current.revision) !== baseRevision)) throw await conflict(db, type, id);

  const now = new Date().toISOString();
  const nextRevision = baseRevision + 1;
  const statements = current ? [
    db.prepare(`/* update-content */
      UPDATE content_items
         SET display_name = ?, description = ?, document_json = ?, revision = ?, status = 'draft',
             updated_by = ?, updated_at = ?, deleted_at = NULL, publication_id = NULL
       WHERE content_type = ? AND id = ? AND revision = ?`)
      .bind(content.name.slice(0, 160), content.description.slice(0, 500), documentJson, nextRevision, editor, now, type, id, baseRevision),
  ] : [
    db.prepare(`/* insert-content */
      INSERT INTO content_items
        (content_type, id, display_name, description, document_json, revision, status, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 'draft', ?, ?)`)
      .bind(type, id, content.name.slice(0, 160), content.description.slice(0, 500), documentJson, editor, now),
  ];
  statements.push(
    db.prepare(`/* insert-content-revision */
      INSERT INTO content_revisions (content_type, content_id, revision, document_json, created_by, created_at, action)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(type, id, nextRevision, documentJson, editor, now, action),
    db.prepare('/* clear-content-dependencies */ DELETE FROM content_dependencies WHERE source_type = ? AND source_id = ?').bind(type, id),
    ...content.dependencies.map((dependency) => db.prepare(`/* insert-content-dependency */
      INSERT INTO content_dependencies
        (source_type, source_id, source_revision, target_type, target_id, target_revision, relation)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(type, id, nextRevision, dependency.type, dependency.id, dependency.revision ?? null, dependency.relation)),
  );
  try {
    const [write] = await db.batch(statements);
    if (Number(write?.meta?.changes) !== 1) throw await conflict(db, type, id);
  } catch (error) {
    if (error instanceof ContentConflictError) throw error;
    const latest = await contentRow(db, type, id, { includeDeleted: true }).catch(() => null);
    if (latest && Number(latest.revision) !== baseRevision) throw await conflict(db, type, id);
    throw error;
  }
  await pruneRevisions(db, type, id);
  return { ...await readContentItem(db, type, id), unchanged: false };
}

export async function deleteContentItem(db, type, id, { expectedRevision, login } = {}) {
  assertDatabase(db);
  const current = await contentRow(db, type, id);
  if (!current) throw new ContentNotFoundError(assertContentType(type), assertContentId(id));
  const expected = Number(expectedRevision);
  if (!Number.isInteger(expected) || Number(current.revision) !== expected) throw await conflict(db, type, id);
  const nextRevision = expected + 1;
  const now = new Date().toISOString();
  const [write] = await db.batch([
    db.prepare(`/* delete-content */
      UPDATE content_items SET revision = ?, status = 'deleted', updated_by = ?, updated_at = ?, deleted_at = ?, publication_id = NULL
       WHERE content_type = ? AND id = ? AND revision = ? AND deleted_at IS NULL`)
      .bind(nextRevision, String(login || '').slice(0, 160), now, now, current.content_type, current.id, expected),
    db.prepare(`/* insert-content-revision */
      INSERT INTO content_revisions (content_type, content_id, revision, document_json, created_by, created_at, action)
      VALUES (?, ?, ?, ?, ?, ?, 'delete')`)
      .bind(current.content_type, current.id, nextRevision, current.document_json, String(login || '').slice(0, 160), now),
  ]);
  if (Number(write?.meta?.changes) !== 1) throw await conflict(db, current.content_type, current.id);
  await pruneRevisions(db, current.content_type, current.id);
  return { type: current.content_type, id: current.id, revision: nextRevision, deleted: true };
}

export async function resolveContentReferences(db, references) {
  assertDatabase(db);
  if (!Array.isArray(references)) throw new Error('Die Content-Auswahl ist ungültig.');
  if (references.length > MAX_REFERENCES) throw new Error(`Es können höchstens ${MAX_REFERENCES} Bibliotheksinhalte auf einmal veröffentlicht werden.`);
  const normalized = references.map((entry) => ({ type: assertContentType(entry?.type), id: assertContentId(entry?.id), revision: Number(entry?.revision) }));
  normalized.forEach((entry) => { if (!Number.isInteger(entry.revision) || entry.revision < 1) throw new Error('Eine Content-Revision ist ungültig.'); });
  if (new Set(normalized.map((entry) => `${entry.type}:${entry.id}`)).size !== normalized.length) throw new Error('Jeder Bibliotheksinhalt darf nur einmal vorkommen.');
  if (!normalized.length) return [];
  const rows = await db.batch(normalized.map((entry) => db.prepare(`/* content-reference */
    SELECT content_type, id, display_name, description, document_json, revision, status, updated_by, updated_at,
           published_revision, published_commit_sha, publication_id
      FROM content_items
     WHERE content_type = ? AND id = ? AND revision = ? AND deleted_at IS NULL`)
    .bind(entry.type, entry.id, entry.revision)));
  return normalized.map((entry, index) => {
    const row = rows[index]?.results?.[0];
    if (!row) throw new ContentConflictError(`Der Inhalt „${entry.type}:${entry.id}“ ist nicht mehr in Revision ${entry.revision} aktuell.`);
    return publicItem(row);
  });
}

export async function recordContentPublication(db, { number, items }) {
  if (!items.length) return;
  const publicationId = Number(number);
  const statements = [];
  items.forEach((item) => {
    statements.push(db.prepare(`/* record-publication-item */
      INSERT INTO publication_items (publication_id, content_type, content_id, revision, target_path, document_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(publication_id, content_type, content_id) DO UPDATE SET
        revision = excluded.revision, target_path = excluded.target_path, document_json = excluded.document_json`)
      .bind(publicationId, item.type, item.id, item.revision, item.path, JSON.stringify(item.content)));
    statements.push(db.prepare(`/* mark-content-publishing */
      UPDATE content_items SET status = 'publishing', publication_id = ?
       WHERE content_type = ? AND id = ? AND revision = ? AND deleted_at IS NULL`)
      .bind(publicationId, item.type, item.id, item.revision));
  });
  await db.batch(statements);
}

export async function finishContentPublication(db, publicationId, result) {
  const id = Number(publicationId);
  if (!Number.isInteger(id) || id < 1 || !['published', 'failed'].includes(result?.state)) return;
  const snapshots = await db.prepare(`/* publication-items */
    SELECT content_type, content_id, revision, document_json FROM publication_items
     WHERE publication_id = ? ORDER BY content_type, content_id`).bind(id).all();
  if (!snapshots.results.length) return;
  const statements = snapshots.results.map((snapshot) => result.state === 'published'
    ? db.prepare(`/* publish-content-snapshot */
        UPDATE content_items
           SET published_revision = ?, published_commit_sha = ?, published_document_json = ?,
               status = CASE WHEN revision = ? THEN 'published' ELSE 'draft' END,
               publication_id = CASE WHEN publication_id = ? THEN NULL ELSE publication_id END
         WHERE content_type = ? AND id = ?`)
      .bind(snapshot.revision, result.commit || '', snapshot.document_json, snapshot.revision, id, snapshot.content_type, snapshot.content_id)
    : db.prepare(`/* fail-content-publication */
        UPDATE content_items SET status = 'draft', publication_id = NULL
         WHERE content_type = ? AND id = ? AND publication_id = ?`)
      .bind(snapshot.content_type, snapshot.content_id, id));
  await db.batch(statements);
}
