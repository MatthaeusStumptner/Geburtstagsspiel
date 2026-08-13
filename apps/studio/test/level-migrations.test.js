import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyLevel } from '../src/level-migrations.js';

test('removes every placed Zauberberg note and its references by semantic asset identity', () => {
  const legacy = {
    id: 'zauberberg',
    decorations: [
      { id: 'zauberberg-note-frei', assetId: 'zauberberg-note' },
      { id: 'zauberberg-buehnen-note', assetId: 'zauberberg-note' },
      { id: 'meine-eigene-note', assetId: 'zauberberg-note' },
      { id: 'music-note-1786224303465-3', assetId: 'music-note' },
      { id: 'music-note-safe-sign', assetId: 'sign' },
      { id: 'zauberberg-box', assetId: 'concert-speaker' },
    ],
    events: [
      { id: 'zugabe', visual: { type: 'custom', assetId: 'music-note', label: '♪', appearance: {}, spriteAnimation: 'idle' } },
      { id: 'zweite-note', visual: { type: 'custom', assetId: 'zauberberg-note', label: '♫', appearance: {}, spriteAnimation: 'idle' } },
      { id: 'licht', visual: { type: 'custom', assetId: 'stage-lights', label: '!', appearance: {}, spriteAnimation: 'idle' } },
    ],
    cutscenes: [{ id: 'intro', tracks: [
      { id: 'note-solo', target: 'zauberberg-note-frei' },
      { id: 'music-note-track', target: 'music-note-1786224303465-3' },
      { id: 'custom-note-track', target: 'meine-eigene-note' },
      { id: 'bassbox', target: 'zauberberg-box' },
    ] }],
  };
  const migrated = migrateLegacyLevel(legacy);
  assert.deepEqual(migrated.decorations.map((item) => item.id), ['music-note-safe-sign', 'zauberberg-box']);
  assert.deepEqual(migrated.events.slice(0, 2).map((event) => event.visual.type), ['none', 'none']);
  assert.deepEqual(migrated.events.slice(0, 2).map((event) => 'assetId' in event.visual), [false, false]);
  assert.equal(migrated.events[2].visual.assetId, 'stage-lights');
  assert.deepEqual(migrated.cutscenes[0].tracks.map((track) => track.id), ['bassbox']);
  assert.equal(legacy.decorations.length, 6, 'migration does not mutate stored source data');
});
test('leaves unrelated levels unchanged while still returning an isolated document', () => {
  const source = { id: 'hals', decorations: [{ id: 'zauberberg-note-frei' }], events: [], cutscenes: [] };
  const migrated = migrateLegacyLevel(source);
  assert.deepEqual(migrated, source);
  assert.notEqual(migrated, source);
});

test('preserves a note-solo track when its retained target is not a note', () => {
  const source = {
    id: 'zauberberg',
    decorations: [{ id: 'stage-lights', assetId: 'stage-lights' }],
    events: [],
    cutscenes: [{ id: 'intro', tracks: [{ id: 'note-solo', target: 'stage-lights' }] }],
  };

  const migrated = migrateLegacyLevel(source);

  assert.deepEqual(migrated.cutscenes[0].tracks, [{ id: 'note-solo', target: 'stage-lights' }]);
});

test('removes a track targeting a retired note even when its decoration is already absent', () => {
  const source = {
    id: 'zauberberg',
    decorations: [{ id: 'stage-lights', assetId: 'stage-lights' }],
    events: [],
    cutscenes: [{ id: 'intro', tracks: [
      { id: 'note-solo', target: 'zauberberg-note-frei' },
      { id: 'light-cue', target: 'stage-lights' },
    ] }],
  };

  const migrated = migrateLegacyLevel(source);

  assert.deepEqual(migrated.cutscenes[0].tracks, [{ id: 'light-cue', target: 'stage-lights' }]);
});
