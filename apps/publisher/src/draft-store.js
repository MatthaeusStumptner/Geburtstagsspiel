import { validateLevelDocument } from '@franz-lola/pixel-renderer';

const MAX_DRAFT_BYTES = 1_000_000;
const MAX_DRAFTS_PER_REQUEST = 20;
const RETAINED_REVISIONS = 20;
const encoder = new TextEncoder();

export class DraftConflictError extends Error {
  constructor(message, current = null) {
    super(message);
    this.name = 'DraftConflictError';
    this.status = 409;
    this.current = current;
  }
}

export class DraftNotFoundError extends Error {
  constructor(id) {
    super(`Der gemeinsame Entwurf „${id}“ wurde nicht gefunden.`);
    this.name = 'DraftNotFoundError';
    this.status = 404;
  }
}

function assertDatabase(db) {
  if (!db?.prepare || !db?.batch) throw new Error('Die gemeinsame D1-Datenbank ist nicht gebunden.');
}

export function assertDraftId(value) {
  const id = String(value ?? '');
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('Die Level-ID ist für einen gemeinsamen Entwurf ungültig.');
  return id;
}

export function normalizeDraftLevel(input) {
  const validation = validateLevelDocument(input);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const level = validation.value;
  assertDraftId(level.id);
  const documentJson = JSON.stringify(level);
  if (encoder.encode(documentJson).byteLength > MAX_DRAFT_BYTES) throw new Error('Der gemeinsame Entwurf ist größer als 1 MB.');
  return { level, documentJson, warnings: validation.warnings };
}

function metadata(level) {
  return {
    name: String(level.name?.standard || level.id).slice(0, 160),
    icon: String(level.icon || '◆').slice(0, 16),
    area: String(level.location?.area || 'PASSAU').slice(0, 160),
  };
}

function parseLevel(value) {
  try { return JSON.parse(value); } catch { throw new Error('Der gemeinsame Entwurf enthält beschädigtes JSON.'); }
}

function publicDraft(row, { includeLevel = true } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name_standard,
    icon: row.icon,
    area: row.area,
    revision: Number(row.revision),
    status: row.status,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    publishedRevision: row.published_revision == null ? null : Number(row.published_revision),
    publishedCommit: row.published_commit_sha || '',
    publicationId: row.publication_id == null ? null : Number(row.publication_id),
    ...(includeLevel ? { level: parseLevel(row.document_json) } : {}),
  };
}

async function draftRow(db, id, { includeDeleted = false } = {}) {
  assertDatabase(db);
  return db.prepare(`/* draft-by-id */
    SELECT id, name_standard, icon, area, document_json, revision, status,
           updated_by, updated_at, published_revision, published_commit_sha,
           published_document_json, publication_id, deleted_at
      FROM level_drafts
     WHERE id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`)
    .bind(assertDraftId(id)).first();
}

export async function listDrafts(db) {
  assertDatabase(db);
  const result = await db.prepare(`/* list-drafts */
    SELECT id, name_standard, icon, area, revision, status, updated_by, updated_at,
           published_revision, published_commit_sha, publication_id
      FROM level_drafts
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC, id ASC`).all();
  return result.results.map((row) => publicDraft(row, { includeLevel: false }));
}

export async function readDraft(db, id) {
  const row = await draftRow(db, id);
  if (!row) throw new DraftNotFoundError(assertDraftId(id));
  return publicDraft(row);
}

async function conflict(db, id, message = 'Der gemeinsame Entwurf wurde inzwischen auf einem anderen Gerät geändert.') {
  const current = await draftRow(db, id).catch(() => null);
  return new DraftConflictError(message, publicDraft(current, { includeLevel: false }));
}

async function pruneRevisions(db, id) {
  await db.prepare(`/* prune-revisions */
    DELETE FROM level_revisions
     WHERE level_id = ?
       AND action NOT IN ('published', 'published-sync')
       AND revision NOT IN (
         SELECT revision FROM level_revisions
          WHERE level_id = ?
          ORDER BY revision DESC
          LIMIT ?
       )`).bind(id, id, RETAINED_REVISIONS).run();
}

export async function saveDraft(db, input, { expectedRevision = 0, login, action = 'save' } = {}) {
  assertDatabase(db);
  const { level, documentJson, warnings } = normalizeDraftLevel(input);
  const id = level.id;
  const editor = String(login || '').slice(0, 160);
  if (!editor) throw new Error('Für den gemeinsamen Entwurf fehlt die Redaktion.');
  const expected = Number(expectedRevision);
  if (!Number.isInteger(expected) || expected < 0) throw new Error('Die erwartete Entwurfsrevision ist ungültig.');
  const current = await draftRow(db, id, { includeDeleted: true });
  if (current && !current.deleted_at && current.document_json === documentJson) {
    return { ...publicDraft(current), warnings, unchanged: true };
  }
  if ((!current && expected !== 0) || (current && Number(current.revision) !== expected)) throw await conflict(db, id);

  const now = new Date().toISOString();
  const nextRevision = expected + 1;
  const info = metadata(level);
  const statements = current ? [
    db.prepare(`/* update-draft */
      UPDATE level_drafts
         SET name_standard = ?, icon = ?, area = ?, document_json = ?, revision = ?,
             status = 'draft', updated_by = ?, updated_at = ?, deleted_at = NULL,
             publication_id = NULL
       WHERE id = ? AND revision = ?`)
      .bind(info.name, info.icon, info.area, documentJson, nextRevision, editor, now, id, expected),
    db.prepare(`/* insert-revision */
      INSERT INTO level_revisions (level_id, revision, document_json, created_by, created_at, action)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, nextRevision, documentJson, editor, now, action),
  ] : [
    db.prepare(`/* insert-draft */
      INSERT INTO level_drafts
        (id, name_standard, icon, area, document_json, revision, status, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 'draft', ?, ?)`)
      .bind(id, info.name, info.icon, info.area, documentJson, editor, now),
    db.prepare(`/* insert-revision */
      INSERT INTO level_revisions (level_id, revision, document_json, created_by, created_at, action)
      VALUES (?, 1, ?, ?, ?, ?)`)
      .bind(id, documentJson, editor, now, action),
  ];

  try {
    const [write] = await db.batch(statements);
    if (Number(write?.meta?.changes) !== 1) throw await conflict(db, id);
  } catch (error) {
    if (error instanceof DraftConflictError) throw error;
    const latest = await draftRow(db, id, { includeDeleted: true }).catch(() => null);
    if (latest && Number(latest.revision) !== expected) throw await conflict(db, id);
    throw error;
  }
  await pruneRevisions(db, id);
  return { ...await readDraft(db, id), warnings, unchanged: false };
}

export async function deleteDraft(db, id, { expectedRevision, login } = {}) {
  assertDatabase(db);
  const current = await draftRow(db, id);
  if (!current) throw new DraftNotFoundError(assertDraftId(id));
  const expected = Number(expectedRevision);
  if (!Number.isInteger(expected) || Number(current.revision) !== expected) throw await conflict(db, id);
  const nextRevision = expected + 1;
  const now = new Date().toISOString();
  const editor = String(login || '').slice(0, 160);
  const [write] = await db.batch([
    db.prepare(`/* delete-draft */
      UPDATE level_drafts
         SET revision = ?, status = 'deleted', updated_by = ?, updated_at = ?, deleted_at = ?, publication_id = NULL
       WHERE id = ? AND revision = ? AND deleted_at IS NULL`)
      .bind(nextRevision, editor, now, now, current.id, expected),
    db.prepare(`/* insert-revision */
      INSERT INTO level_revisions (level_id, revision, document_json, created_by, created_at, action)
      VALUES (?, ?, ?, ?, ?, 'delete')`)
      .bind(current.id, nextRevision, current.document_json, editor, now),
  ]);
  if (Number(write?.meta?.changes) !== 1) throw await conflict(db, current.id);
  await pruneRevisions(db, current.id);
  return { id: current.id, revision: nextRevision, deleted: true };
}

export async function syncPublishedDraft(db, input, { sha = '', login = 'github' } = {}) {
  assertDatabase(db);
  const { level, documentJson } = normalizeDraftLevel(input);
  const id = level.id;
  const current = await draftRow(db, id, { includeDeleted: true });
  if (current?.published_commit_sha === sha && current?.published_document_json === documentJson) return publicDraft(current);
  const now = new Date().toISOString();
  const info = metadata(level);
  if (!current) {
    await db.batch([
      db.prepare(`/* insert-published-draft */
        INSERT INTO level_drafts
          (id, name_standard, icon, area, document_json, revision, status, updated_by, updated_at,
           published_revision, published_commit_sha, published_document_json)
        VALUES (?, ?, ?, ?, ?, 1, 'published', ?, ?, 1, ?, ?)`)
        .bind(id, info.name, info.icon, info.area, documentJson, login, now, sha, documentJson),
      db.prepare(`/* insert-revision */
        INSERT INTO level_revisions (level_id, revision, document_json, created_by, created_at, action)
        VALUES (?, 1, ?, ?, ?, 'published')`)
        .bind(id, documentJson, login, now),
    ]);
    return readDraft(db, id);
  }

  const clean = current.status === 'published' && Number(current.revision) === Number(current.published_revision);
  if (!clean) {
    await db.prepare(`/* refresh-published-base */
      UPDATE level_drafts
         SET published_commit_sha = ?, published_document_json = ?
       WHERE id = ?`).bind(sha, documentJson, id).run();
    return readDraft(db, id);
  }

  const nextRevision = Number(current.revision) + 1;
  await db.batch([
    db.prepare(`/* sync-published-draft */
      UPDATE level_drafts
         SET name_standard = ?, icon = ?, area = ?, document_json = ?, revision = ?, status = 'published',
             updated_by = ?, updated_at = ?, published_revision = ?, published_commit_sha = ?,
             published_document_json = ?, deleted_at = NULL
       WHERE id = ? AND revision = ?`)
      .bind(info.name, info.icon, info.area, documentJson, nextRevision, login, now, nextRevision, sha, documentJson, id, current.revision),
    db.prepare(`/* insert-revision */
      INSERT INTO level_revisions (level_id, revision, document_json, created_by, created_at, action)
      VALUES (?, ?, ?, ?, ?, 'published-sync')`)
      .bind(id, nextRevision, documentJson, login, now),
  ]);
  await pruneRevisions(db, id);
  return readDraft(db, id);
}

export async function resolveDraftReferences(db, references) {
  assertDatabase(db);
  if (!Array.isArray(references) || !references.length) throw new Error('Bitte mindestens einen gemeinsamen Entwurf auswählen.');
  if (references.length > MAX_DRAFTS_PER_REQUEST) throw new Error(`Es können höchstens ${MAX_DRAFTS_PER_REQUEST} Level auf einmal veröffentlicht werden.`);
  const normalized = references.map((entry) => ({ id: assertDraftId(entry?.id), revision: Number(entry?.revision) }));
  normalized.forEach((entry) => { if (!Number.isInteger(entry.revision) || entry.revision < 1) throw new Error('Eine Entwurfsrevision ist ungültig.'); });
  if (new Set(normalized.map((entry) => entry.id)).size !== normalized.length) throw new Error('Jede ausgewählte Level-ID darf nur einmal vorkommen.');
  const rows = await db.batch(normalized.map((entry) => db.prepare(`/* draft-reference */
    SELECT id, name_standard, icon, area, document_json, revision, status, updated_by, updated_at,
           published_revision, published_commit_sha, publication_id
      FROM level_drafts
     WHERE id = ? AND revision = ? AND deleted_at IS NULL`).bind(entry.id, entry.revision)));
  return normalized.map((entry, index) => {
    const row = rows[index]?.results?.[0];
    if (!row) throw new DraftConflictError(`Der Entwurf „${entry.id}“ ist nicht mehr in Revision ${entry.revision} aktuell.`);
    return publicDraft(row);
  });
}

export async function recordPublication(db, { number, login, drafts }) {
  assertDatabase(db);
  const publicationId = Number(number);
  if (!Number.isInteger(publicationId) || publicationId < 1) throw new Error('Die GitHub-Veröffentlichungsnummer ist ungültig.');
  const now = new Date().toISOString();
  const statements = [
    db.prepare(`/* record-publication */
      INSERT INTO publications (id, state, created_by, created_at, updated_at)
      VALUES (?, 'testing', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET state = 'testing', updated_at = excluded.updated_at`)
      .bind(publicationId, login, now, now),
  ];
  drafts.forEach((draft) => {
    statements.push(db.prepare(`/* record-publication-level */
      INSERT INTO publication_levels (publication_id, level_id, revision, document_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(publication_id, level_id) DO UPDATE SET revision = excluded.revision, document_json = excluded.document_json`)
      .bind(publicationId, draft.id, draft.revision, JSON.stringify(draft.level)));
    statements.push(db.prepare(`/* mark-draft-publishing */
      UPDATE level_drafts SET status = 'publishing', publication_id = ?
       WHERE id = ? AND revision = ? AND deleted_at IS NULL`)
      .bind(publicationId, draft.id, draft.revision));
  });
  await db.batch(statements);
}

export async function finishPublication(db, publicationId, result) {
  assertDatabase(db);
  const id = Number(publicationId);
  if (!Number.isInteger(id) || id < 1 || !['published', 'failed'].includes(result?.state)) return;
  const publication = await db.prepare('/* publication-by-id */ SELECT state, commit_sha FROM publications WHERE id = ?').bind(id).first();
  if (!publication || (publication.state === result.state && (result.state !== 'published' || publication.commit_sha === result.commit))) return;
  const snapshots = await db.prepare(`/* publication-levels */
    SELECT level_id, revision, document_json FROM publication_levels WHERE publication_id = ? ORDER BY level_id`).bind(id).all();
  const now = new Date().toISOString();
  const statements = [db.prepare(`/* finish-publication */
    UPDATE publications SET state = ?, commit_sha = ?, updated_at = ? WHERE id = ?`)
    .bind(result.state, result.commit || null, now, id)];
  snapshots.results.forEach((snapshot) => {
    if (result.state === 'published') {
      statements.push(db.prepare(`/* publish-draft-snapshot */
        UPDATE level_drafts
           SET published_revision = ?, published_commit_sha = ?, published_document_json = ?,
               status = CASE WHEN revision = ? THEN 'published' ELSE 'draft' END,
               publication_id = CASE WHEN publication_id = ? THEN NULL ELSE publication_id END
         WHERE id = ?`)
        .bind(snapshot.revision, result.commit || '', snapshot.document_json, snapshot.revision, id, snapshot.level_id));
    } else {
      statements.push(db.prepare(`/* fail-draft-publication */
        UPDATE level_drafts SET status = 'draft', publication_id = NULL
         WHERE id = ? AND publication_id = ?`)
        .bind(snapshot.level_id, id));
    }
  });
  await db.batch(statements);
}
