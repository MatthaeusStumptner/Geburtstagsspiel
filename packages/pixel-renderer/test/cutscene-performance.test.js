import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleCutscene } from '../src/cutscene.js';

function levelFixture() {
  return {
    id: 'cutscene-cache-test',
    board: { columns: 25, rows: 25, tileSize: 24, walls: [] },
    theme: { id: 'night', palette: {}, edgeEffects: [] },
    actors: {
      player: { x: 1, y: 1 },
      cats: [{ id: 'cat-1', x: 3, y: 3 }],
      characters: [],
    },
    decorations: Array.from({ length: 48 }, (_, index) => ({ id: `item-${index}`, type: 'tree', x: index % 12, y: Math.floor(index / 12) })),
    cutscenes: [],
  };
}

test('cutscene sampling preserves static level references while isolating animated entities', () => {
  const level = levelFixture();
  const cutscene = {
    duration: 4,
    tracks: [{ type: 'object', target: 'item-2', keyframes: [{ time: 0, x: 2, visible: true }, { time: 4, x: 8, visible: true }] }],
  };
  const snapshot = sampleCutscene(level, cutscene, 2, 'standard');

  assert.equal(snapshot.level.board, level.board);
  assert.equal(snapshot.level.theme, level.theme);
  assert.notEqual(snapshot.level.decorations, level.decorations);
  assert.notEqual(snapshot.level.decorations[2], level.decorations[2]);
  assert.equal(level.decorations[2].x, 2);
  assert.equal(snapshot.level.decorations[2].x, 5);
});
