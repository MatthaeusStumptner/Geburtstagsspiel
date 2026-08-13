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

test('golden session exercises deterministic seeded wander', () => {
  const project = loadGoldenProject('hals-smoke');
  const run = (seed) => runInputScript(createGameSession({ ...project.session, seed }), project.inputs);

  const first = run(project.session.seed);
  const repeated = run(project.session.seed);
  const otherSeed = run(2);

  assert.equal(first.cats.length, 1, 'the golden contract must include an actor that consumes RNG');
  assert.equal(first.checksum, repeated.checksum);
  assert.equal(first.cats[0].dir.name, repeated.cats[0].dir.name);
  assert.notEqual(first.checksum, otherSeed.checksum);
  assert.notEqual(first.cats[0].dir.name, otherSeed.cats[0].dir.name);
});
