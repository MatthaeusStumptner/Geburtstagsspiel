import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelDocument } from '@franz-lola/pixel-renderer';
import { LevelCutscenePlayer } from '../src/game/level-cutscene-player.js';

function levelWithIntro() {
  return createLevelDocument({
    kind: 'franz-lola-level', schemaVersion: 1, id: 'cutscene-test', icon: '▶',
    name: { standard: 'Test', dialect: 'Test' }, description: { standard: '', dialect: '' }, mission: { standard: '', dialect: '' },
    location: { area: 'PASSAU', river: [], lat: 48.57, lon: 13.47 },
    board: { columns: 9, rows: 9, tileSize: 24, tunnelRows: [], walls: [] },
    theme: { landmark: 'dog-park', elements: [], palette: { ground: ['#111111'], walls: ['#222222'], curb: '#333333', water: '#004455' } },
    actors: { player: { x: 4, y: 7, renderer: 'franz-lola' }, cats: [] },
    collectibles: { powerUps: [] }, decorations: [], events: [],
    gameplay: { pelletSeed: 1, treatTargets: { easy: 10, normal: 12, hard: 14 } },
    cutscenes: [{
      id: 'intro', kind: 'intro', name: { standard: 'Ankunft', dialect: 'Oikemma' }, duration: 2, skippable: true,
      tracks: [
        { id: 'camera', type: 'camera', target: 'camera', keyframes: [{ id: 'a', time: 0, x: 1, y: 2, zoom: 1.5 }, { id: 'b', time: 2, x: 4, y: 7, zoom: 1.12 }] },
        { id: 'actor', type: 'actor', target: 'player', keyframes: [{ id: 'a', time: 0, x: 1, y: 7, state: 'right' }, { id: 'b', time: 2, x: 4, y: 7, state: 'idle' }] },
        { id: 'text', type: 'dialogue', target: 'dialogue', keyframes: [{ id: 'a', time: 0, duration: 2, speaker: 'Franz', text: { standard: 'Los geht es!', dialect: 'Pack ma’s!' } }] },
      ],
    }],
  });
}

test('plays the level-owned intro with camera, actor and localized dialogue', () => {
  const player = new LevelCutscenePlayer(); const level = levelWithIntro();
  assert.equal(player.start(level, { language: 'dialect' }), true);
  player.advance(1);
  const snapshot = player.snapshot();
  assert.equal(snapshot.player.x, 2.5);
  assert.equal(snapshot.camera.zoom, 1.31);
  assert.equal(snapshot.dialogue.text, 'Pack ma’s!');
  assert.equal(player.running, true);
});

test('finishes after the same wall-clock duration at 60, 120 and 175 Hz', () => {
  for (const frequency of [60, 120, 175]) {
    const player = new LevelCutscenePlayer(); player.start(levelWithIntro());
    for (let frame = 0; frame < frequency * 2; frame += 1) player.advance(1 / frequency);
    assert.ok(Math.abs(player.time - 2) < 1e-9, `${frequency} Hz ended at ${player.time}`);
    assert.equal(player.running, false);
  }
});

test('only skips cutscenes that explicitly allow it', () => {
  const player = new LevelCutscenePlayer(); const level = levelWithIntro(); player.start(level);
  assert.equal(player.skip(), true); assert.equal(player.time, 2); assert.equal(player.running, false);
  level.cutscenes[0].skippable = false; player.start(level);
  assert.equal(player.skip(), false); assert.equal(player.running, true);
});
