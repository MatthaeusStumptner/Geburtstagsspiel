import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, FixedStepLoop, createLevelDocument, tileKey } from '@franz-lola/pixel-renderer';
import { PlaytestEngine } from '../src/playtest-engine.js';

function level(overrides = {}) {
  return createLevelDocument({
    kind: 'franz-lola-level', schemaVersion: 1, id: 'testlauf',
    board: { columns: 7, rows: 7, tileSize: 24, tunnelRows: [3], walls: overrides.walls ?? [] },
    actors: { player: overrides.player ?? { x: 3, y: 3 }, cats: [] },
    collectibles: { powerUps: [] }, gameplay: { pelletSeed: 0, treatTargets: { easy: 1, normal: 2, hard: 3 } },
  });
}

test('moves continuously, queues turns and stops at walls', () => {
  const engine = new PlaytestEngine(level({ walls: [{ x: 4, y: 3, width: 1, height: 1 }] }));
  engine.player.dir = DIRECTIONS.none; engine.setDirection('right'); engine.step(0.5);
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
  const engine = new PlaytestEngine(level(), 'easy', { pellets: [tileKey(3, 2)] });
  engine.setDirection('up'); engine.step(0.2);
  assert.equal(engine.collected, 1);
  assert.equal(engine.pellets.size, 0);
  assert.equal(engine.state, 'won');
});

test('editor testlauf covers the same distance at 60 and 175 Hz', () => {
  const run = (hz) => {
    const engine = new PlaytestEngine(level(), 'easy', { pellets: ['5,3'] }); engine.player.dir = DIRECTIONS.none; engine.setDirection('right');
    const loop = new FixedStepLoop({ updatesPerSecond: 120 }); loop.advance(0, (dt) => engine.step(dt));
    for (let frame = 1; frame <= hz; frame += 1) loop.advance(frame * 1000 / hz, (dt) => engine.step(dt));
    return engine.player.x;
  };
  assert.ok(Math.abs(run(60) - run(175)) < 1e-6);
});

test('direct navigation reverses immediately and buffers corners without position jumps', () => {
  const engine = new PlaytestEngine(level(), 'easy', { pellets: ['1,1'] });
  engine.player.x = 3.37; engine.player.y = 3; engine.player.dir = DIRECTIONS.right; engine.player.nextDir = DIRECTIONS.right;
  engine.setDirection('left'); assert.equal(engine.player.dir, DIRECTIONS.left); assert.equal(engine.player.x, 3.37);
  engine.setDirection('up'); assert.equal(engine.player.dir, DIRECTIONS.left); assert.equal(engine.player.nextDir, DIRECTIONS.up); assert.equal(engine.player.x, 3.37);
});

test('uses authored difficulty values and actor behavior without editor-only shortcuts', () => {
  const document = level();
  document.gameplay.difficulties.easy = { ...document.gameplay.difficulties.easy, lives: 8, catCount: 1, grace: 0 };
  document.actors.cats = [{ x: 5, y: 5, behavior: { strategy: 'stationary', respawnDelay: 0 } }];
  const engine = new PlaytestEngine(document, 'easy', { pellets: ['1,1'] });
  engine.step(1);
  assert.equal(engine.lives, 8);
  assert.deepEqual({ x: engine.cats[0].x, y: engine.cats[0].y }, { x: 5, y: 5 });
});

test('plays authored localized events and applies their reward', () => {
  const document = level();
  document.events = [{ id: 'fund', name: { standard: 'Fund', dialect: 'A Fund' }, message: { standard: 'Entdeckt', dialect: 'Gfundn' }, reward: 123, trigger: { type: 'zone', zones: [{ x: 3, y: 3, width: 1, height: 1 }] }, visual: { type: 'custom', x: 3.5, y: 3.5, label: '!' } }];
  const engine = new PlaytestEngine(document, 'easy', { pellets: ['1,1'] });
  const event = engine.step(1 / 120).find((entry) => entry.type === 'level-event');
  assert.equal(event.event.message.standard, 'Entdeckt');
  assert.equal(event.reward, 123);
  assert.equal(engine.score, 123);
});
