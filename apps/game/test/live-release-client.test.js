import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_DOCUMENTS, publishedLevel } from '../src/game/level-catalog.js';
import { loadLiveRelease } from '../src/game/live-release-client.js';

test('game installs a valid live release without a rebuild', async () => {
  const level = publishedLevel(LEVEL_DOCUMENTS[0].id);
  level.name.standard = 'Sofort aus D1';
  const result = await loadLiveRelease({
    baseUrl: 'https://publisher.example',
    fetchImpl: async () => new Response(JSON.stringify({
      kind: 'franz-lola-live-release', schemaVersion: 1, id: 'release-test', createdAt: '2026-08-14T12:00:00Z',
      levels: [{ id: level.id, revision: 2, document: level }], items: [],
    })),
  });
  assert.equal(result.source, 'live');
  assert.equal(publishedLevel(level.id).name.standard, 'Sofort aus D1');
});

test('game keeps embedded content when publisher is unavailable', async () => {
  const result = await loadLiveRelease({ baseUrl: '', fetchImpl: async () => { throw new Error('unused'); } });
  assert.equal(result.source, 'embedded');
  assert.ok(LEVEL_DOCUMENTS.length > 0);
});
