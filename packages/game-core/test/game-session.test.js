import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameSession } from '../src/index.js';
import { deterministicSessionLevel } from './fixtures.js';

const SNAPSHOT_FIELDS = [
  'player',
  'cats',
  'characters',
  'pellets',
  'powerUps',
  'events',
  'state',
  'score',
  'lives',
  'elapsed',
  'previousPositions',
  'interpolationAlpha',
];

test('game and studio sessions produce identical snapshots for the same seed and input', () => {
  const input = Array.from({ length: 240 }, (_, index) => index < 120 ? 'right' : 'down');
  const first = createGameSession({ level: deterministicSessionLevel, difficulty: 'normal', seed: 42 });
  const second = createGameSession({ level: deterministicSessionLevel, difficulty: 'normal', seed: 42 });

  for (const direction of input) {
    first.queueInput(direction);
    second.queueInput(direction);
    first.step(1 / 120);
    second.step(1 / 120);
  }

  const snapshot = first.snapshot();
  assert.deepEqual(snapshot, second.snapshot());
  assert.equal(snapshot.level.id, 'deterministic-session');
  assert.equal(snapshot.elapsed, 2);
  assert.equal(snapshot.initialPelletCount, 4);
  assert.ok(snapshot.pellets.length <= snapshot.initialPelletCount);
  assert.equal(snapshot.powerUps.length, 1);
  for (const field of SNAPSHOT_FIELDS) assert.ok(Object.hasOwn(snapshot, field), field);
});

test('the fixture and every session snapshot are deeply immutable', () => {
  assert.equal(Object.isFrozen(deterministicSessionLevel), true);
  assert.equal(Object.isFrozen(deterministicSessionLevel.board.walls), true);

  const session = createGameSession({ level: deterministicSessionLevel, difficulty: 'normal', seed: 42 });
  const snapshot = session.snapshot();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.player), true);
  assert.equal(Object.isFrozen(snapshot.cats), true);
  assert.equal(Object.isFrozen(snapshot.cats[0]), true);
  assert.equal(Object.isFrozen(snapshot.previousPositions), true);
  assert.throws(() => { snapshot.player.x = 99; }, TypeError);
  assert.throws(() => { snapshot.pellets.push('7,7'); }, TypeError);
  assert.equal(session.snapshot().player.x, 4);
});

test('createGameSession rejects an invalid level at its boundary', () => {
  assert.throws(
    () => createGameSession({ level: { id: 'invalid' }, difficulty: 'normal', seed: 42 }),
    /invalid level/i,
  );
});

test('browser save adapters can restore a session without gaining mutable core ownership', () => {
  const session = createGameSession({ level: deterministicSessionLevel, difficulty: 'normal', seed: 42 });
  const restored = session.restore({
    player: { x: 5.25, y: 6, direction: 'right', nextDirection: 'down' },
    cats: [{ x: 3, y: 4, direction: 'left', respawnTimer: 0.5, lastDecision: '3,4' }],
    pellets: ['7,7'],
    powerUps: ['1,1'],
    unlockedEvents: [],
    score: 80,
    lives: 2,
    elapsed: 1.25,
    powerTimer: 3,
    graceTimer: 0.5,
    state: 'playing',
  });

  assert.equal(restored.player.x, 5.25);
  assert.equal(restored.player.dir.name, 'right');
  assert.equal(restored.player.nextDir.name, 'down');
  assert.deepEqual(restored.pellets, ['7,7']);
  assert.equal(restored.score, 80);
  assert.equal(restored.lives, 2);
  assert.equal(restored.elapsed, 1.25);
  assert.equal(restored.graceTimer, 0.5);
  assert.equal(Object.isFrozen(restored), true);

  session.queueInput('up');
  assert.ok(session.step(1 / 120).elapsed > restored.elapsed);
});
