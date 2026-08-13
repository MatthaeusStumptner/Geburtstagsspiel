import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelDocument, extractEmbeddedContentDocuments, validateContentDocument } from '../src/index.js';

test('extracts every independently stored level component with stable unique keys', () => {
  const level = createLevelDocument({
    id: 'zauberberg', name: { standard: 'Zauberberg', dialect: 'Zauberberg' },
    board: { columns: 9, rows: 9, walls: [{ x: 2, y: 2, width: 2, height: 1 }, { x: 5, y: 5, width: 1, height: 2 }] },
    actors: { cats: [{ id: 'cat-1', x: 3, y: 3, animation: { type: 'bob', speed: 1, amplitude: 0.1 } }], characters: [] },
    decorations: [{ id: 'box', assetId: 'speaker', name: 'Box', x: 4, y: 4, width: 1, height: 1, animation: { type: 'bob', speed: 1, amplitude: 0.1 } }],
    collectibles: { powerUps: [] },
    cutscenes: [{ id: 'intro', name: { standard: 'Intro', dialect: 'Intro' }, duration: 1, tracks: [] }],
    events: [{ id: 'zugabe', name: { standard: 'Zugabe', dialect: 'Zugabe' }, message: { standard: 'Los', dialect: 'Los' }, trigger: { type: 'time', seconds: 1 } }],
  });
  const documents = extractEmbeddedContentDocuments(level);
  const keys = documents.map((document) => `${document.type}:${document.id}`);
  assert.ok(keys.includes('character:zauberberg-player'));
  assert.ok(keys.includes('character:zauberberg-cat-1'));
  assert.ok(keys.includes('object:zauberberg-box'));
  assert.ok(keys.includes('tileset:zauberberg-tileset-neighborhood'));
  assert.ok(keys.includes('block:zauberberg-wall-1'));
  assert.ok(keys.includes('block:zauberberg-wall-2'));
  assert.ok(keys.includes('animation:zauberberg-box-bewegung'));
  assert.ok(keys.includes('cutscene:zauberberg-cutscene-intro'));
  assert.ok(keys.includes('event:zauberberg-event-zugabe'));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(documents.every((document) => validateContentDocument(document).ok));
});
