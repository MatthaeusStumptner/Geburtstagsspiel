import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameSession } from '@franz-lola/game-core';
import { loadGoldenProject, runInputScript } from '../src/index.js';

test('game and studio consume the same local contracts', () => {
  const project = loadGoldenProject('hals-smoke');
  const snapshot = runInputScript(createGameSession(project.session), project.inputs);

  assert.equal(snapshot.levelId, 'hals-smoke');
  assert.equal(snapshot.state, 'won');
  assert.equal(snapshot.checksum, project.expectedChecksum);
  assert.equal(Object.isFrozen(project), true);
  assert.equal(Object.isFrozen(project.session.level), true);
  assert.equal(Object.isFrozen(project.inputs), true);
});

test('unknown golden projects fail closed', () => {
  assert.throws(() => loadGoldenProject('missing-project'), /unknown golden project/i);
});
