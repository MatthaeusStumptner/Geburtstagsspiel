import assert from 'node:assert/strict';
import test from 'node:test';
import { createLevelDocument } from '@franz-lola/content-model';
import { DIRECTIONS, LevelSimulation, createGameSession } from '../src/index.js';

function reviewLevel({ player, cats = [], events = [], difficulty = {} } = {}) {
  return createLevelDocument({
    kind: 'franz-lola-level',
    schemaVersion: 1,
    id: 'review-regression',
    board: { columns: 9, rows: 9, tileSize: 24, tunnelRows: [], walls: [] },
    actors: {
      player: player ?? { x: 4, y: 4, behavior: { controller: 'stationary' } },
      cats,
    },
    collectibles: { powerUps: [] },
    gameplay: {
      pelletSeed: 17,
      treatTargets: { easy: 1, normal: 1, hard: 1 },
      difficulties: {
        normal: { catCount: cats.length, lives: 2, grace: 0, ...difficulty },
      },
    },
    events,
  });
}

function zoneEvent(id = 'global-find', reward = 400) {
  return {
    id,
    scope: 'global',
    name: { standard: 'Fund', dialect: 'Fund' },
    message: { standard: 'Gefunden', dialect: 'Gfundn' },
    reward,
    trigger: { type: 'zone', zones: [{ x: 4, y: 4, width: 1, height: 1 }] },
    visual: { type: 'custom', x: 4, y: 4, label: '!' },
  };
}

test('a session starts with known unlocked events and never rewards them again', () => {
  const session = createGameSession({
    level: reviewLevel({ events: [zoneEvent()] }),
    difficulty: 'normal',
    seed: 42,
    unlockedEvents: ['global-find'],
  });

  const snapshot = session.step(1 / 120);

  assert.equal(snapshot.score, 0);
  assert.deepEqual(snapshot.events, []);
  assert.deepEqual(snapshot.unlockedEvents, ['global-find']);
});

test('hit recovery restores initial cat directions before their first movement', () => {
  const level = reviewLevel({
    cats: [
      { x: 4, y: 4, behavior: { strategy: 'chase', respawnDelay: 0 } },
      { x: 6, y: 4, behavior: { strategy: 'chase', respawnDelay: 0 } },
      { x: 2, y: 4, behavior: { strategy: 'chase', respawnDelay: 0 } },
    ],
    difficulty: { catSpeed: 3, wander: 0 },
  });
  const simulation = new LevelSimulation(level, { difficulty: 'normal', pellets: ['7,7'], random: () => 0 });
  simulation.cats[0].dir = DIRECTIONS.right;
  simulation.cats[1].dir = DIRECTIONS.down;
  simulation.cats[2].dir = DIRECTIONS.left;

  assert.deepEqual(simulation.step(1 / 120), [{ type: 'hit', lives: 1 }]);
  simulation.step(1.1);

  assert.equal(simulation.state, 'playing');
  assert.deepEqual(simulation.cats.map((cat) => cat.dir.name), ['left', 'up', 'right']);

  simulation.step(1 / 120);
  assert.deepEqual(simulation.cats.map((cat) => cat.dir.name), ['up', 'left', 'right']);
  assert.ok(Math.abs(simulation.cats[0].y - 3.975) < 1e-9);
  assert.ok(Math.abs(simulation.cats[1].x - 5.975) < 1e-9);
  assert.ok(Math.abs(simulation.cats[2].x - 2.025) < 1e-9);
});

test('collecting the last pellet ends the tick before level events are evaluated', () => {
  const simulation = new LevelSimulation(reviewLevel({ events: [zoneEvent('same-tick', 250)] }), {
    difficulty: 'normal',
    pellets: ['4,4'],
  });

  const events = simulation.step(1 / 120);

  assert.equal(simulation.state, 'won');
  assert.equal(simulation.score, 10);
  assert.deepEqual(events.map((event) => event.type), ['gutti', 'won']);
  assert.deepEqual([...simulation.unlockedEvents], []);
});

test('active level events survive restore with their remaining duration and expire', () => {
  const level = reviewLevel({ events: [zoneEvent('timed-toast', 125)] });
  const source = createGameSession({ level, difficulty: 'normal', seed: 42 });
  const active = source.step(1 / 120);

  assert.equal(active.activeEventId, 'timed-toast');
  assert.equal(active.activeEventTimer, 4.5);

  const restoredSession = createGameSession({ level, difficulty: 'normal', seed: 42 });
  let restored = restoredSession.restore({
    unlockedEvents: active.unlockedEvents,
    activeEventId: active.activeEventId,
    activeEventTimer: active.activeEventTimer,
    score: active.score,
  });
  assert.equal(restored.activeEventTimer, 4.5);
  for (let step = 0; step < 46; step += 1) restored = restoredSession.step(0.1);
  assert.equal(restored.activeEventId, '');
  assert.equal(restored.activeEventTimer, 0);
});

test('positive wander is reproducible for equal seeds and distinguishes selected seeds', () => {
  const level = reviewLevel({
    player: { x: 1, y: 1, behavior: { controller: 'stationary' } },
    cats: [{ x: 4, y: 4, behavior: { strategy: 'random', respawnDelay: 0, wander: 20 } }],
    difficulty: { catSpeed: 3, grace: 5, wander: 20 },
  });
  const run = (seed) => {
    const session = createGameSession({ level, difficulty: 'normal', seed });
    return session.step(1 / 120);
  };

  assert.deepEqual(run(1), run(1));
  assert.equal(run(1).cats[0].dir.name, 'down');
  assert.equal(run(2).cats[0].dir.name, 'left');
  assert.notDeepEqual(run(1), run(2));
});
