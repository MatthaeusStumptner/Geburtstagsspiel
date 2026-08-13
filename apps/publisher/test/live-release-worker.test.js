import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const manifest = {
  kind: 'franz-lola-live-release',
  schemaVersion: 1,
  id: 'release-public',
  createdAt: '2026-08-14T10:00:00.000Z',
  createdBy: 'redaktion',
  levels: [],
  items: [],
};

class Statement {
  constructor(sql) { this.sql = sql; }
  bind() { return this; }
  async first() {
    if (this.sql.includes('live-current-release')) return { release_id: manifest.id, manifest_json: JSON.stringify(manifest) };
    if (this.sql.includes('live-release-by-id')) return { release_id: manifest.id, manifest_json: JSON.stringify(manifest) };
    return null;
  }
}

const env = { LEVEL_DB: { prepare: (sql) => new Statement(sql), batch: async () => [] } };

test('public live release endpoints work without GitHub secrets', async () => {
  const current = await worker.fetch(new Request('https://publisher.example/api/live/current'), env);
  assert.equal(current.status, 200);
  assert.equal(current.headers.get('Cache-Control'), 'no-store');
  assert.equal((await current.json()).id, manifest.id);

  const immutable = await worker.fetch(new Request(`https://publisher.example/api/live/releases/${manifest.id}`), env);
  assert.equal(immutable.status, 200);
  assert.match(immutable.headers.get('Cache-Control'), /immutable/);
  assert.deepEqual(await immutable.json(), manifest);
});
