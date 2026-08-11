import assert from 'node:assert/strict';
import test from 'node:test';
import { createLevelDocument } from '@franz-lola/content-model';
import { sampleCutscene } from '../src/index.js';

test('samples reusable characters normalized by the shared content model', () => {
  const level = createLevelDocument({
    board: { columns: 9, rows: 9 },
    actors: {
      cats: [],
      characters: [{
        id: 'passau-postler', characterId: 'postler', name: 'Passauer Postler',
        x: 2, y: 5, state: 'left', scale: 2.25,
        behavior: { controller: 'patrol', speedMultiplier: 0.75 },
      }],
    },
    cutscenes: [{
      id: 'begruessung', kind: 'intro', duration: 2,
      tracks: [{
        id: 'postler-spur', type: 'actor', target: 'character:passau-postler',
        keyframes: [{ time: 0, x: 2, y: 5, state: 'left' }, { time: 2, x: 5, y: 5, state: 'right' }],
      }],
    }],
  });

  const sample = sampleCutscene(level, level.cutscenes[0], 1);
  assert.equal(sample.characters.length, 1);
  assert.equal(sample.characters[0].x, 3.5);
  assert.equal(sample.characters[0].direction.name, 'right');
});

test('samples normalized object and dialogue tracks', () => {
  const level = createLevelDocument({
    board: { columns: 9, rows: 9 },
    actors: { cats: [] },
    decorations: [{ id: 'music-note-1', type: 'custom', x: 2, y: 2 }],
    cutscenes: [{
      id: 'intro', kind: 'intro', duration: 4,
      tracks: [
        { id: 'franz', type: 'actor', target: 'player', keyframes: [{ time: 0, x: 1, y: 6 }, { time: 4, x: 5, y: 6 }] },
        { id: 'note', type: 'object', target: 'music-note-1', keyframes: [{ time: 0, x: 2, y: 2 }, { time: 4, x: 6, y: 2 }] },
        { id: 'text', type: 'dialogue', target: 'dialogue', keyframes: [{ time: 1, duration: 2, speaker: 'Franz', text: { standard: 'Servus!', dialect: 'Hawedere!' } }] },
      ],
    }],
  });

  const sample = sampleCutscene(level, 'intro', 2, 'dialect');
  assert.equal(sample.level.actors.player.x, 3);
  assert.equal(sample.level.decorations[0].x, 4);
  assert.equal(sample.dialogue.text, 'Hawedere!');
  assert.equal(sample.done, false);
});
