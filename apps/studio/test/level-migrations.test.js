import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyLevel } from '../src/level-migrations.js';

test('removes only the retired Zauberberg note instances from older browser and cloud drafts', () => {
  const legacy = {
    id: 'zauberberg',
    decorations: [
      { id: 'zauberberg-note-frei', assetId: 'zauberberg-note' },
      { id: 'zauberberg-buehnen-note', assetId: 'zauberberg-note' },
      { id: 'meine-eigene-note', assetId: 'zauberberg-note' },
    ],
    events: [{ id: 'zugabe', visual: { type: 'custom', assetId: 'zauberberg-note', label: '♪', appearance: {}, spriteAnimation: 'idle' } }],
    cutscenes: [{ id: 'intro', tracks: [{ id: 'note-solo', target: 'zauberberg-note-frei' }, { id: 'bassbox', target: 'zauberberg-box' }] }],
  };
  const migrated = migrateLegacyLevel(legacy);
  assert.deepEqual(migrated.decorations.map((item) => item.id), ['meine-eigene-note']);
  assert.equal(migrated.events[0].visual.type, 'none');
  assert.equal('assetId' in migrated.events[0].visual, false);
  assert.deepEqual(migrated.cutscenes[0].tracks.map((track) => track.id), ['bassbox']);
  assert.equal(legacy.decorations.length, 3, 'migration does not mutate stored source data');
});

test('leaves unrelated levels unchanged while still returning an isolated document', () => {
  const source = { id: 'hals', decorations: [{ id: 'zauberberg-note-frei' }], events: [], cutscenes: [] };
  const migrated = migrateLegacyLevel(source);
  assert.deepEqual(migrated, source);
  assert.notEqual(migrated, source);
});
