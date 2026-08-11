import assert from 'node:assert/strict';
import test from 'node:test';
import * as gameCore from '@franz-lola/game-core';
import * as renderer from '../src/index.js';

test('migration compatibility re-exports point at the single game-core owners', () => {
  for (const name of [
    'DIRECTIONS',
    'FixedStepLoop',
    'LevelSimulation',
    'cutsceneById',
    'moveGridActor',
    'sampleCutscene',
  ]) assert.equal(renderer[name], gameCore[name], name);
});
