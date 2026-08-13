import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelDocument } from '@franz-lola/content-model';
import { PlaytestEngine } from '../src/playtest-engine.js';

function level(overrides = {}) {
  return createLevelDocument({
    kind: 'franz-lola-level', schemaVersion: 1, id: 'testlauf',
    board: { columns: 7, rows: 7, tileSize: 24, tunnelRows: [3], walls: overrides.walls ?? [] },
    actors: { player: overrides.player ?? { x: 3, y: 3 }, cats: overrides.cats ?? [] },
    collectibles: { powerUps: [] },
    gameplay: {
      pelletSeed: 0,
      treatTargets: overrides.treatTargets ?? { easy: 1, normal: 2, hard: 3 },
    },
  });
}

test('moves continuously, queues turns and stops at walls', () => {
  const engine = new PlaytestEngine(level({ walls: [
    { x: 2, y: 3, width: 1, height: 1 },
    { x: 4, y: 3, width: 1, height: 1 },
  ] }));
  engine.setDirection('right'); engine.step(0.5);
  assert.deepEqual({ x: engine.player.x, y: engine.player.y }, { x: 3, y: 3 });
  engine.setDirection('up'); engine.step(0.2);
  assert.ok(engine.player.y < 3);
});

test('wraps through declared tunnel rows', () => {
  const engine = new PlaytestEngine(level({ player: { x: 0, y: 3 } }));
  engine.setDirection('left'); engine.step(0.2);
  assert.ok(engine.player.x > 4, `erwarteter Tunnel-Wrap, x=${engine.player.x}`);
  assert.equal(engine.player.y, 3);
});

test('collects Guttis and reaches the completed state', () => {
  const engine = new PlaytestEngine(level({ player: { x: 5, y: 4 } }));
  engine.setDirection('down');
  engine.step(0.2);
  const snapshot = engine.step(0.1);
  assert.equal(snapshot.collected, 1);
  assert.equal(snapshot.pellets.length, 0);
  assert.equal(snapshot.state, 'won');
});

test('editor testlauf covers the same distance at 60 and 175 Hz', () => {
  const run = (hz) => {
    const engine = new PlaytestEngine(level({ treatTargets: { easy: 10, normal: 10, hard: 10 } }));
    engine.setDirection('right');
    for (let frame = 0; frame < hz; frame += 1) engine.step(1 / hz);
    return engine.player.x;
  };
  assert.ok(Math.abs(run(60) - run(175)) < 1e-6);
});

test('direct navigation reverses immediately and buffers corners without position jumps', () => {
  const engine = new PlaytestEngine(level({ treatTargets: { easy: 10, normal: 10, hard: 10 } }));
  engine.setDirection('right'); engine.step(0.1);
  const beforeReverse = engine.player.x;
  engine.setDirection('left'); engine.step(1 / 120);
  assert.equal(engine.player.dir.name, 'left');
  assert.ok(Math.abs(engine.player.x - beforeReverse) < 0.1);
  engine.setDirection('up'); engine.step(1 / 120);
  assert.equal(engine.player.dir.name, 'left');
  assert.equal(engine.player.nextDir.name, 'up');
});

test('uses authored difficulty values and actor behavior without editor-only shortcuts', () => {
  const document = level({ cats: [{ x: 5, y: 5, behavior: { strategy: 'stationary', respawnDelay: 0 } }] });
  document.gameplay.difficulties.easy = { ...document.gameplay.difficulties.easy, lives: 8, catCount: 1, grace: 0 };
  const engine = new PlaytestEngine(document, 'easy');
  engine.step(1);
  assert.equal(engine.lives, 8);
  assert.deepEqual({ x: engine.cats[0].x, y: engine.cats[0].y }, { x: 5, y: 5 });
});

test('plays authored localized events and applies their reward', () => {
  const document = level();
  document.events = [{ id: 'fund', name: { standard: 'Fund', dialect: 'A Fund' }, message: { standard: 'Entdeckt', dialect: 'Gfundn' }, reward: 123, trigger: { type: 'zone', zones: [{ x: 3, y: 3, width: 1, height: 1 }] }, visual: { type: 'custom', x: 3.5, y: 3.5, label: '!' } }];
  const engine = new PlaytestEngine(document, 'easy');
  const snapshot = engine.step(1 / 120);
  const event = snapshot.events.find((entry) => entry.type === 'level-event');
  assert.equal(event.event.message.standard, 'Entdeckt');
  assert.equal(event.reward, 123);
  assert.equal(snapshot.score, 123);
});
