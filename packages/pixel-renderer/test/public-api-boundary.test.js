import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as renderer from '../src/index.js';

test('renderer public API excludes game-core migration owners', async () => {
  const forbidden = [
    'DEFAULT_DIFFICULTY_PROFILES', 'DIRECTIONS', 'FixedStepLoop', 'LevelSimulation',
    'canMoveOnGrid', 'chooseCatDirection', 'cutsceneById', 'directionByName',
    'moveCatActor', 'moveGridActor', 'movePlayerActor', 'queuePlayerDirection',
    'sampleCutscene', 'wrapGridActor',
  ];
  assert.deepEqual(forbidden.filter((name) => Object.hasOwn(renderer, name)), []);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dependencies['@franz-lola/game-core'], undefined);
});
