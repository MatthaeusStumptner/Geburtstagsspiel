import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelDocument } from '@franz-lola/pixel-renderer';
import { deleteDraft, DraftConflictError, readDraft, resolveDraftReferences, saveDraft } from '../src/draft-store.js';

function level(name = 'Hals') {
  const document = createLevelDocument({
    kind: 'franz-lola-level', schemaVersion: 1, id: 'hals', name: { standard: name, dialect: name },
    board: { columns: 9, rows: 9, tileSize: 24, tunnelRows: [4], walls: [] },
    actors: { player: { x: 4, y: 6 }, cats: [] },
    collectibles: { powerUps: [{ x: 1, y: 1 }] },
  });
  document.actors.characters = [{
    id: 'passauer-postler', characterId: 'postler', name: 'Passauer Postler',
    x: 2, y: 5, appearance: { width: 2, height: 2, palette: ['transparent', '#55d9dd'], pixels: ['11', '11'] },
  }];
  return document;
}

class Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  first() { return this.database.execute(this, 'first'); }
  all() { return this.database.execute(this, 'all'); }
  run() { return this.database.execute(this, 'run'); }
}

class FakeD1 {
  constructor() { this.drafts = new Map(); this.revisions = new Map(); }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => this.execute(statement, 'run'))); }
  marker(sql) { return /\/\* ([\w-]+) \*\//.exec(sql)?.[1]; }
  async execute(statement, mode) {
    const marker = this.marker(statement.sql); const value = statement.values;
    if (marker === 'draft-by-id') {
      const row = this.drafts.get(value[0]);
      return row && (statement.sql.includes('include-deleted-never') || !statement.sql.includes('deleted_at IS NULL') || !row.deleted_at) ? { ...row } : null;
    }
    if (marker === 'list-drafts') {
      const results = [...this.drafts.values()].filter((row) => !row.deleted_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return { results: results.map((row) => ({ ...row })) };
    }
    if (marker === 'insert-draft') {
      const [id, name, icon, area, document, editor, now] = value;
      if (this.drafts.has(id)) throw new Error('UNIQUE');
      this.drafts.set(id, { id, name_standard: name, icon, area, document_json: document, revision: 1, status: 'draft', updated_by: editor, updated_at: now, published_revision: null, published_commit_sha: null, publication_id: null, deleted_at: null });
      return { meta: { changes: 1 } };
    }
    if (marker === 'update-draft') {
      const [name, icon, area, document, revision, editor, now, id, expected] = value; const row = this.drafts.get(id);
      if (!row || row.revision !== expected) return { meta: { changes: 0 } };
      Object.assign(row, { name_standard: name, icon, area, document_json: document, revision, status: 'draft', updated_by: editor, updated_at: now, deleted_at: null, publication_id: null });
      return { meta: { changes: 1 } };
    }
    if (marker === 'insert-revision') {
      const [id, revision, document, editor, now, action] = value;
      this.revisions.set(`${id}:${revision}`, { id, revision, document, editor, now, action });
      return { meta: { changes: 1 } };
    }
    if (marker === 'prune-revisions') return { meta: { changes: 0 } };
    if (marker === 'delete-draft') {
      const [revision, editor, updatedAt, deletedAt, id, expected] = value; const row = this.drafts.get(id);
      if (!row || row.revision !== expected || row.deleted_at) return { meta: { changes: 0 } };
      Object.assign(row, { revision, status: 'deleted', updated_by: editor, updated_at: updatedAt, deleted_at: deletedAt, publication_id: null });
      return { meta: { changes: 1 } };
    }
    if (marker === 'draft-reference') {
      const row = this.drafts.get(value[0]);
      return { results: row && row.revision === value[1] && !row.deleted_at ? [{ ...row }] : [] };
    }
    throw new Error(`FakeD1 kennt SQL-Markierung ${marker} (${mode}) nicht.`);
  }
}

test('shared drafts save idempotently and reject stale revisions', async () => {
  const db = new FakeD1();
  const first = await saveDraft(db, level(), { login: 'redaktion', expectedRevision: 0 });
  assert.equal(first.revision, 1);
  assert.equal(first.unchanged, false);
  assert.equal(first.level.actors.characters[0].characterId, 'postler');
  const repeated = await saveDraft(db, level(), { login: 'redaktion', expectedRevision: 1 });
  assert.equal(repeated.revision, 1);
  assert.equal(repeated.unchanged, true);
  const changed = await saveDraft(db, level('Hals gemeinsam'), { login: 'redaktion', expectedRevision: 1 });
  assert.equal(changed.revision, 2);
  await assert.rejects(
    saveDraft(db, level('Veraltete Kopie'), { login: 'anderes-geraet', expectedRevision: 1 }),
    (error) => error instanceof DraftConflictError && error.status === 409 && error.current.revision === 2,
  );
});
test('publishing resolves an exact revision and deleted drafts disappear', async () => {
  const db = new FakeD1();
  await saveDraft(db, level(), { login: 'redaktion', expectedRevision: 0 });
  const [resolved] = await resolveDraftReferences(db, [{ id: 'hals', revision: 1 }]);
  assert.equal(resolved.level.id, 'hals');
  assert.equal(resolved.level.actors.characters[0].name, 'Passauer Postler');
  await assert.rejects(resolveDraftReferences(db, [{ id: 'hals', revision: 2 }]), DraftConflictError);
  const deleted = await deleteDraft(db, 'hals', { expectedRevision: 1, login: 'redaktion' });
  assert.equal(deleted.revision, 2);
  await assert.rejects(readDraft(db, 'hals'), /nicht gefunden/);
});
