import test from 'node:test';
import assert from 'node:assert/strict';
import { createContentDocument, createLevelDocument } from '@franz-lola/content-model';
import { createLiveRelease, readCurrentLiveRelease, readLiveRelease } from '../src/live-release-store.js';

const marker = (sql) => /\/\*\s*([^*]+?)\s*\*\//.exec(sql)?.[1] ?? '';

class FakeD1 {
  releases = new Map();
  pointer = null;
  batchCalls = 0;
  batchSizes = [];
  prepare(sql) {
    const statement = {
      sql, values: [],
      bind: (...values) => { statement.values = values; return statement; },
      first: async () => {
        const name = marker(sql);
        if (name === 'live-current-release') {
          const release = this.pointer ? this.releases.get(this.pointer) : null;
          return release ? { release_id: this.pointer, manifest_json: JSON.stringify(release) } : null;
        }
        if (name === 'live-release-by-id') {
          const release = this.releases.get(statement.values[0]);
          return release ? { release_id: statement.values[0], manifest_json: JSON.stringify(release) } : null;
        }
        throw new Error(`Unbekannter first()-Marker: ${name}`);
      },
    };
    return statement;
  }
  async batch(statements) {
    this.batchCalls += 1;
    this.batchSizes.push(statements.length);
    const pending = { releases: new Map(this.releases), pointer: this.pointer };
    for (const statement of statements) {
      const name = marker(statement.sql);
      if (name === 'insert-live-release') {
        const [id, createdAt, createdBy, manifestJson] = statement.values;
        const manifest = JSON.parse(manifestJson);
        assert.equal(manifest.id, id);
        assert.equal(manifest.createdAt, createdAt);
        assert.equal(manifest.createdBy, createdBy);
        pending.releases.set(id, manifest);
      } else if (name === 'upsert-live-pointer') pending.pointer = statement.values[0];
      else if (!['insert-live-levels', 'insert-live-items', 'mark-live-level', 'mark-live-item'].includes(name)) throw new Error(`Unbekannter batch()-Marker: ${name}`);
    }
    this.releases = pending.releases;
    this.pointer = pending.pointer;
    return statements.map(() => ({ success: true, meta: { changes: 1 } }));
  }
}

const level = (id, name) => createLevelDocument({ id, name: { standard: name, dialect: name }, board: { columns: 9, rows: 9, walls: [] }, actors: { cats: [], player: { x: 4, y: 4 } }, collectibles: { powerUps: [] } });
const object = (id, name) => createContentDocument('object', { id, name, width: 1, height: 1, type: 'custom', color: '#55d9dd' });

test('publication preserves unselected live content and atomically replaces selected revisions', async () => {
  const db = new FakeD1();
  const first = await createLiveRelease(db, {
    login: 'matti', releaseId: 'release-1', now: '2026-08-13T12:00:00.000Z',
    fallback: { levels: [{ id: 'home', revision: 0, document: level('home', 'Home alt') }, { id: 'hals', revision: 0, document: level('hals', 'Hals') }], items: [{ type: 'object', id: 'bank', revision: 0, content: object('bank', 'Bank') }] },
    drafts: [{ id: 'home', revision: 4, level: level('home', 'Home neu') }], items: [],
  });
  assert.equal(db.batchCalls, 1);
  assert.ok(db.batchSizes[0] <= 14);
  assert.equal(db.pointer, 'release-1');
  assert.deepEqual(first.manifest.levels.map(({ id, revision }) => [id, revision]), [['hals', 0], ['home', 4]]);
  assert.equal(first.manifest.levels.find(({ id }) => id === 'home').document.name.standard, 'Home neu');
  assert.deepEqual(first.manifest.items.map(({ type, id, revision }) => [type, id, revision]), [['object', 'bank', 0]]);

  const second = await createLiveRelease(db, {
    login: 'matti', releaseId: 'release-2', now: '2026-08-13T12:05:00.000Z', fallback: { levels: [], items: [] }, drafts: [],
    items: [{ type: 'object', id: 'bank', revision: 2, content: object('bank', 'Neue Bank') }],
  });
  assert.equal(db.batchCalls, 2);
  assert.equal(db.pointer, 'release-2');
  assert.equal(second.manifest.levels.find(({ id }) => id === 'home').revision, 4);
  assert.equal(second.manifest.items[0].revision, 2);
  assert.equal((await readCurrentLiveRelease(db)).id, 'release-2');
  assert.equal((await readLiveRelease(db, 'release-1')).levels.find(({ id }) => id === 'home').document.name.standard, 'Home neu');
});

test('publication rejects an empty initial release and duplicate snapshot keys', async () => {
  const db = new FakeD1();
  await assert.rejects(createLiveRelease(db, { login: 'matti', releaseId: 'empty', now: '2026-08-13T12:00:00.000Z', fallback: { levels: [], items: [] }, drafts: [], items: [] }), /mindestens ein Level/i);
  await assert.rejects(createLiveRelease(db, {
    login: 'matti', releaseId: 'duplicate', now: '2026-08-13T12:00:00.000Z', fallback: { levels: [{ id: 'home', revision: 0, document: level('home', 'Home') }], items: [] },
    drafts: [{ id: 'home', revision: 1, level: level('home', 'Home 1') }, { id: 'home', revision: 2, level: level('home', 'Home 2') }], items: [],
  }), /nur einmal/i);
});
