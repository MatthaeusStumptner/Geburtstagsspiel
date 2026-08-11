import test from 'node:test';
import assert from 'node:assert/strict';
import { createContentDocument } from '@franz-lola/pixel-renderer';
import {
  ContentConflictError, deleteContentItem, listContentItems, readContentItem,
  resolveContentReferences, saveContentItem,
} from '../src/content-store.js';

const pixels = ['0000', '0110', '0110', '0000'];
const character = (name = 'Postler') => createContentDocument('character', {
  id: 'postler', name,
  appearance: { width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels },
}, { dependencies: [{ type: 'animation', id: 'winken', relation: 'uses' }] });

class Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  first() { return this.database.execute(this, 'first'); }
  all() { return this.database.execute(this, 'all'); }
  run() { return this.database.execute(this, 'run'); }
}

class FakeD1 {
  constructor() { this.items = new Map(); this.revisions = new Map(); this.dependencies = new Map(); }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => this.execute(statement, 'run'))); }
  marker(sql) { return /\/\* ([\w-]+) \*\//.exec(sql)?.[1]; }
  key(type, id) { return `${type}:${id}`; }
  async execute(statement, mode) {
    const marker = this.marker(statement.sql); const value = statement.values;
    if (marker === 'content-by-id') {
      const row = this.items.get(this.key(value[0], value[1]));
      return row && (!statement.sql.includes('deleted_at IS NULL') || !row.deleted_at) ? { ...row } : null;
    }
    if (marker === 'list-content') {
      const type = value[0] || '';
      return { results: [...this.items.values()].filter((row) => !row.deleted_at && (!type || row.content_type === type)).map((row) => ({ ...row })) };
    }
    if (marker === 'insert-content') {
      const [type, id, name, description, document, editor, now] = value;
      this.items.set(this.key(type, id), { content_type: type, id, display_name: name, description, document_json: document, revision: 1, status: 'draft', updated_by: editor, updated_at: now, published_revision: null, published_commit_sha: null, publication_id: null, deleted_at: null });
      return { meta: { changes: 1 } };
    }
    if (marker === 'update-content') {
      const [name, description, document, revision, editor, now, type, id, expected] = value;
      const row = this.items.get(this.key(type, id));
      if (!row || row.revision !== expected) return { meta: { changes: 0 } };
      Object.assign(row, { display_name: name, description, document_json: document, revision, status: 'draft', updated_by: editor, updated_at: now, deleted_at: null, publication_id: null });
      return { meta: { changes: 1 } };
    }
    if (marker === 'insert-content-revision') {
      this.revisions.set(`${value[0]}:${value[1]}:${value[2]}`, [...value]);
      return { meta: { changes: 1 } };
    }
    if (marker === 'clear-content-dependencies') {
      for (const key of [...this.dependencies.keys()]) if (key.startsWith(`${value[0]}:${value[1]}:`)) this.dependencies.delete(key);
      return { meta: { changes: 1 } };
    }
    if (marker === 'insert-content-dependency') {
      this.dependencies.set(value.join(':'), [...value]);
      return { meta: { changes: 1 } };
    }
    if (marker === 'prune-content-revisions') return { meta: { changes: 0 } };
    if (marker === 'content-reference') {
      const row = this.items.get(this.key(value[0], value[1]));
      return { results: row && row.revision === value[2] && !row.deleted_at ? [{ ...row }] : [] };
    }
    if (marker === 'delete-content') {
      const [revision, editor, updatedAt, deletedAt, type, id, expected] = value;
      const row = this.items.get(this.key(type, id));
      if (!row || row.revision !== expected || row.deleted_at) return { meta: { changes: 0 } };
      Object.assign(row, { revision, status: 'deleted', updated_by: editor, updated_at: updatedAt, deleted_at: deletedAt, publication_id: null });
      return { meta: { changes: 1 } };
    }
    throw new Error(`FakeD1 kennt SQL-Markierung ${marker} (${mode}) nicht.`);
  }
}

test('shared content is idempotent, revision-safe and dependency-indexed', async () => {
  const db = new FakeD1();
  const first = await saveContentItem(db, character(), { expectedRevision: 0, login: 'redaktion' });
  assert.equal(first.revision, 1);
  assert.equal(first.content.type, 'character');
  assert.equal(db.dependencies.size, 1);
  const repeated = await saveContentItem(db, character(), { expectedRevision: 1, login: 'redaktion' });
  assert.equal(repeated.unchanged, true);
  const changed = await saveContentItem(db, character('Postler Franz'), { expectedRevision: 1, login: 'redaktion' });
  assert.equal(changed.revision, 2);
  await assert.rejects(saveContentItem(db, character('Veraltet'), { expectedRevision: 1, login: 'anderes-gerät' }), ContentConflictError);
  assert.equal((await listContentItems(db, { type: 'character' }))[0].name, 'Postler Franz');
});

test('publication resolves exact content revisions and deletion hides items', async () => {
  const db = new FakeD1();
  await saveContentItem(db, character(), { expectedRevision: 0, login: 'redaktion' });
  const [resolved] = await resolveContentReferences(db, [{ type: 'character', id: 'postler', revision: 1 }]);
  assert.equal(resolved.content.document.name, 'Postler');
  await assert.rejects(resolveContentReferences(db, [{ type: 'character', id: 'postler', revision: 2 }]), ContentConflictError);
  await deleteContentItem(db, 'character', 'postler', { expectedRevision: 1, login: 'redaktion' });
  await assert.rejects(readContentItem(db, 'character', 'postler'), /nicht gefunden/);
  const restored = await saveContentItem(db, character('Postler wieder da'), { expectedRevision: 0, login: 'redaktion' });
  assert.equal(restored.revision, 3);
  assert.equal(restored.content.name, 'Postler wieder da');
});
