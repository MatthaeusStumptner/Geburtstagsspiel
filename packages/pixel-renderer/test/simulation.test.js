import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop, LevelSimulation, createLevelDocument, selectAppearanceFrame } from '../src/index.js';
import { zauberbergSpotlightPolygons } from '../src/painters/environment.js';

function openLevel(extra = {}) {
  return createLevelDocument({
    kind: 'franz-lola-level', schemaVersion: 1, id: 'simulation',
    board: { columns: 25, rows: 25, tileSize: 24, tunnelRows: [12], walls: [] },
    actors: { player: { x: 3, y: 10, behavior: { controller: 'user' } }, cats: [] },
    collectibles: { powerUps: [] },
    gameplay: { difficulties: { normal: { catCount: 0 } } },
    ...extra,
  });
}

function simulateDisplay(hz) {
  const simulation = new LevelSimulation(openLevel(), { difficulty: 'normal' });
  simulation.setDirection('right');
  const loop = new FixedStepLoop({ updatesPerSecond: 120 });
  loop.advance(0, (dt) => simulation.step(dt));
  const frames = hz * 2;
  for (let frame = 1; frame <= frames; frame += 1) loop.advance(frame * 2000 / frames, (dt) => simulation.step(dt));
  return { x: simulation.player.x, y: simulation.player.y, elapsed: simulation.elapsed };
}

test('shared simulation covers identical wall-clock distance at 60, 120 and 175 Hz', () => {
  const at60 = simulateDisplay(60); const at120 = simulateDisplay(120); const at175 = simulateDisplay(175);
  assert.ok(Math.abs(at60.x - at120.x) < 1e-6, `${at60.x} vs ${at120.x}`);
  assert.ok(Math.abs(at120.x - at175.x) < 1e-6, `${at120.x} vs ${at175.x}`);
  assert.ok(Math.abs(at60.elapsed - 2) < 1e-6);
});

test('simulation applies stationary and autopilot player behavior', () => {
  const stationary = openLevel(); stationary.actors.player.behavior = { controller: 'stationary' };
  const still = new LevelSimulation(stationary); still.setDirection('right'); still.step(1);
  assert.equal(still.player.x, 3);
  const automatic = openLevel(); automatic.actors.player.behavior = { controller: 'autopilot' };
  const moving = new LevelSimulation(automatic, { pellets: ['8,10'] }); moving.step(0.5);
  assert.ok(moving.player.x > 3);
});

test('selects looping sprite animation frames deterministically', () => {
  const appearance = { pixels: ['0'], animations: [{ id: 'walk', fps: 2, loop: true, frames: [{ pixels: ['1'] }, { pixels: ['2'] }] }] };
  assert.deepEqual(selectAppearanceFrame(appearance, { animationId: 'walk', elapsed: 0 }), ['1']);
  assert.deepEqual(selectAppearanceFrame(appearance, { animationId: 'walk', elapsed: 0.6 }), ['2']);
  assert.deepEqual(selectAppearanceFrame(appearance, { animationId: 'walk', elapsed: 1.1 }), ['1']);
});

test('Zauberberg restores both original stage spotlights', () => {
  const lights = zauberbergSpotlightPolygons(100, 50, 200, 120);
  assert.deepEqual(lights, [
    { color: '#ff4f87', points: [[135, 70], [174, 248], [212, 248]] },
    { color: '#55d9dd', points: [[265, 70], [188, 248], [230, 248]] },
  ]);
});

test('simulation unlocks zone and direction-sequence events with localized data and rewards', () => {
  const level = openLevel({ events: [
    { id: 'zone-event', name: { standard: 'Zone', dialect: 'Zone' }, message: { standard: 'Gefunden', dialect: 'Gfundn' }, reward: 150, trigger: { type: 'zone', zones: [{ x: 3, y: 10, width: 1, height: 1 }] }, visual: { type: 'kingfisher' } },
    { id: 'sequence-event', name: { standard: 'Folge', dialect: 'Folgn' }, message: { standard: 'Klingeling', dialect: 'Bim bam' }, reward: 250, trigger: { type: 'direction-sequence', sequence: ['up', 'down', 'left', 'right'] }, visual: { type: 'bell' } },
  ] });
  const simulation = new LevelSimulation(level, { pellets: ['20,20'] });
  let events = simulation.step(1 / 120);
  assert.equal(events[0].id, 'zone-event'); assert.equal(simulation.score, 150);
  ['up', 'down', 'left', 'right'].forEach((direction) => simulation.setDirection(direction));
  events = simulation.step(1 / 120);
  assert.equal(events.find((event) => event.id === 'sequence-event').event.message.dialect, 'Bim bam');
  assert.equal(simulation.score, 400);
  assert.deepEqual([...simulation.snapshot().unlockedEvents], ['zone-event', 'sequence-event']);
});
