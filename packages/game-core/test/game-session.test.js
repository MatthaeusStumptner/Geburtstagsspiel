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
test('save and restore continue positive wander, fixed-step remainder and direction events exactly', () => {
  const level = structuredClone(deterministicSessionLevel);
  level.id = 'continuation-parity';
  level.actors.player.behavior = { controller: 'stationary' };
  level.actors.cats = [{ x: 4, y: 4, behavior: { strategy: 'random', respawnDelay: 0, wander: 20 } }];
  level.gameplay.treatTargets = { easy: 1, normal: 1, hard: 1 };
  level.gameplay.difficulties.normal = {
    ...level.gameplay.difficulties.normal,
    catCount: 1,
    catSpeed: 6,
    grace: 20,
    wander: 20,
  };
  level.events = [{
    id: 'turn-code',
    scope: 'round',
    name: { standard: 'Code', dialect: 'Code' },
    message: { standard: 'Gefunden', dialect: 'Gfundn' },
    reward: 275,
    trigger: { type: 'direction-sequence', sequence: ['right', 'up', 'left'], zones: [], seconds: 0 },
    visual: { type: 'custom', x: 1, y: 1, label: '!' },
  }];
  const uninterrupted = createGameSession({ level, difficulty: 'normal', seed: 9843 });
  const source = createGameSession({ level, difficulty: 'normal', seed: 9843 });
  const beforeSave = [['right', 0.013], ['up', 0.194], [null, 0.005]];
  const afterSave = [['left', 0.004], [null, 0.173], ['down', 0.087], [null, 0.231]];
  const run = (session, script) => script.map(([input, delta]) => {
    if (input) session.queueInput(input);
    return session.step(delta);
  });
  run(uninterrupted, beforeSave);
  run(source, beforeSave);
  const saved = source.save();
  assert.equal(Object.isFrozen(saved), true);
  assert.equal(Object.isFrozen(saved.directionHistory), true);
  assert.throws(() => saved.directionHistory.push('down'), TypeError);
  const restored = createGameSession({ level, difficulty: 'normal', seed: 9843 });
  restored.restore(JSON.parse(JSON.stringify(saved)));
  const uninterruptedContinuation = run(uninterrupted, afterSave);
  const restoredContinuation = run(restored, afterSave);
  assert.deepEqual(restoredContinuation, uninterruptedContinuation);
  assert.deepEqual(restored.snapshot(), uninterrupted.snapshot());
  assert.equal(restored.snapshot().score, 275);
  assert.deepEqual(restoredContinuation.flatMap(({ events }) => events).filter(({ type }) => type === 'level-event').map(({ id }) => id), ['turn-code']);
  assert.equal(restored.snapshot().cats[0].lastDecision, uninterrupted.snapshot().cats[0].lastDecision);
});
