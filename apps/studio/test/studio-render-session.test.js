import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelDocument } from '@franz-lola/content-model';
import { PassauPixelRenderer } from '@franz-lola/pixel-renderer';
import { createRenderCoordinator } from '@franz-lola/render-coordinator';
import { createStarterLevel } from '../src/editor-state.js';
import { drawWalker } from '../../../packages/pixel-renderer/src/painters/characters.js';
import { createStudioRenderSession, getLevelAnimationActivity, hasAnimatedLevelContent } from '../src/render/studio-render-session.svelte.js';

const ONE_FRAME_APPEARANCE = Object.freeze({
  width: 4,
  height: 4,
  palette: ['transparent', '#f4eee0'],
  pixels: ['0110', '1111', '1001', '0110'],
  animations: [{ id: 'idle', fps: 4, loop: true, frames: [{ pixels: ['0110', '1111', '1001', '0110'] }] }],
  stateAnimations: { idle: 'idle' },
});

function createStaticLevel() {
  return createLevelDocument({
    board: { columns: 25, rows: 25, tileSize: 24, walls: [] },
    theme: { landmark: 'dog-park', edgeEffects: [] },
    actors: { player: { x: 12, y: 20, appearance: ONE_FRAME_APPEARANCE }, cats: [], characters: [] },
    collectibles: { powerUps: [] },
    decorations: [],
    events: [],
  });
}

function walkerOutput(actor, elapsed) {
  const operations = [];
  let fillStyle = '';
  const context = {
    set fillStyle(value) { fillStyle = value; },
    fillRect(...bounds) { operations.push(['rect', fillStyle, ...bounds]); },
    set strokeStyle(value) { operations.push(['stroke-style', value]); },
    set lineWidth(value) { operations.push(['line-width', value]); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  drawWalker(context, actor, 24, { elapsed, hitTimer: 0 });
  return operations;
}

function selectionAlphas(selections, elapsed) {
  const alphas = [];
  let globalAlpha = 1;
  const context = {
    save() {}, restore() {}, setLineDash() {}, strokeRect() {},
    set strokeStyle(value) {}, set lineWidth(value) {}, set shadowColor(value) {}, set shadowBlur(value) {},
    get globalAlpha() { return globalAlpha; },
    set globalAlpha(value) { globalAlpha = value; alphas.push(value); },
  };
  PassauPixelRenderer.prototype.presentEditorSelections.call({ pixelRatio: 1, overlayContext: context }, selections, {
    viewport: { x: 0, y: 0, width: 240, height: 240 }, source: { x: 0, y: 0, width: 600, height: 600 },
  }, 24, elapsed);
  return alphas;
}
function createFrameClock() {
  let pending = null;
  let nextHandle = 1;
  return {
    adapter: {
      requestFrame(callback) {
        assert.equal(pending, null, 'coordinator must own at most one queued presentation');
        pending = { callback, handle: nextHandle };
        nextHandle += 1;
        return pending.handle;
      },
      cancelFrame(handle) {
        if (pending?.handle === handle) pending = null;
      },
      now() {
        return 0;
      },
    },
    present(timestamp) {
      const frame = pending;
      pending = null;
      frame?.callback(timestamp);
    },
    pendingCount() {
      return pending ? 1 : 0;
    },
  };
}

function createStudioRenderHarness() {
  const clock = createFrameClock();
  const frames = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  const session = createStudioRenderSession({ coordinator, render: (frame) => frames.push(frame) });
  return { clock, coordinator, frames, level: session };
}

test('level canvas renders immediately after a pointer edit and sleeps when unchanged', () => {
  const harness = createStudioRenderHarness();
  harness.level.invalidate('pointer:wall');
  harness.clock.present(10);
  harness.clock.present(20);
  assert.equal(harness.level.renderCount, 1);
  harness.level.setVisible(false);
  harness.level.invalidate('project:cloud-sync');
  harness.clock.present(30);
  assert.equal(harness.level.renderCount, 1);
});

test('animated content stays awake until it becomes static', () => {
  const harness = createStudioRenderHarness();
  harness.level.setActive(true);
  assert.equal(harness.coordinator.snapshot().surfaces['studio-level-canvas'].active, true);
  harness.clock.present(0);
  harness.clock.present(1000 / 60);
  assert.equal(harness.level.renderCount, 2);

  harness.level.setActive(false);
  assert.equal(harness.coordinator.snapshot().surfaces['studio-level-canvas'].active, false);
  harness.clock.present(1000 / 30);
  assert.equal(harness.level.renderCount, 2);
});

test('reduced motion presents one final frame, sleeps ambient animation and preserves later one-shot edits', () => {
  const harness = createStudioRenderHarness();
  harness.level.setActive(true);
  harness.level.setReducedMotion(true);
  assert.equal(harness.clock.pendingCount(), 1);
  harness.clock.present(0);
  harness.clock.present(1000 / 60);
  assert.equal(harness.level.renderCount, 2, 'the queued ambient frame is followed by the final reduced frame');
  assert.equal(harness.clock.pendingCount(), 0);

  harness.level.invalidate('pointer:selection');
  harness.clock.present(1000 / 30);
  assert.equal(harness.level.renderCount, 3);

  harness.level.setReducedMotion(false);
  assert.equal(harness.clock.pendingCount(), 1);
  harness.clock.present(1000 / 20);
  assert.equal(harness.level.renderCount, 4);
});

test('resize measurements are captured outside presentation and forwarded with their reason', () => {
  const harness = createStudioRenderHarness();
  const measurement = Object.freeze({ width: 640, height: 480, devicePixelRatio: 2, reason: 'resize-observer' });
  harness.level.resize(measurement);
  harness.clock.present(10);

  assert.equal(harness.level.renderCount, 1);
  assert.equal(harness.frames[0].reason, 'layout:resize-observer');
  assert.equal(harness.frames[0].measurement, measurement);
  assert.equal(harness.clock.pendingCount(), 0);
});

test('visibility wakes animated content and cleanup unregisters the surface', () => {
  const harness = createStudioRenderHarness();
  harness.level.setActive(true);
  harness.level.setVisible(false);
  assert.equal(harness.clock.pendingCount(), 0);

  harness.level.setVisible(true);
  assert.equal(harness.clock.pendingCount(), 1);
  harness.clock.present(10);
  assert.equal(harness.level.renderCount, 1);

  harness.level.destroy();
  assert.deepEqual(harness.coordinator.snapshot().surfaces, {});
  assert.equal(harness.clock.pendingCount(), 0);
});

test('a reduced-motion transition presents pending edits before one final reduced frame', () => {
  const harness = createStudioRenderHarness();
  harness.level.invalidate('pointer:wall');
  harness.level.setReducedMotion(true);

  harness.clock.present(0);
  harness.clock.present(1000 / 60);
  assert.deepEqual(harness.frames.map((frame) => frame.reason), ['pointer:wall', 'motion:reduced']);
  assert.equal(harness.clock.pendingCount(), 0);
  assert.equal(harness.coordinator.snapshot().surfaces['studio-level-canvas'].dirty, false);
  assert.equal(harness.coordinator.snapshot().surfaces['studio-level-canvas'].active, false);
});

test('a reduced-motion transition wakes static content before later edits and remains reentrant', () => {
  const clock = createFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  const frames = [];
  let session;
  session = createStudioRenderSession({
    coordinator,
    render: (frame) => {
      frames.push(frame);
      if (frame.reason === 'motion:reduced') session.invalidate('project:reentrant');
    },
  });

  session.setReducedMotion(true);
  clock.present(0);
  clock.present(1000 / 60);
  clock.present(2000 / 60);
  assert.deepEqual(frames.map((frame) => frame.reason), ['motion:reduced', 'project:reentrant']);
  assert.equal(clock.pendingCount(), 0);

  session.invalidate('pointer:wall');
  clock.present(3000 / 60);
  assert.deepEqual(frames.map((frame) => frame.reason), ['motion:reduced', 'project:reentrant', 'pointer:wall']);
  assert.equal(clock.pendingCount(), 0);
});

test('fallback walker painter output keeps the visible starter player continuously active', () => {
  const starter = createStarterLevel();
  assert.notDeepEqual(walkerOutput(starter.actors.player, 0), walkerOutput(starter.actors.player, 0.1), 'the real fallback painter changes the walker and dog output with elapsed time');
  assert.deepEqual(getLevelAnimationActivity(starter), { continuous: true, until: 0 });
});

test('fallback walker painter output keeps a visible character continuously active', () => {
  const level = createStaticLevel();
  const character = { x: 7, y: 8, state: 'right', appearance: null, effects: [] };
  level.actors.characters = [character];
  assert.notDeepEqual(walkerOutput({ ...character, direction: character.state }, 0), walkerOutput({ ...character, direction: character.state }, 0.1), 'the character path reaches the same elapsed-dependent walker and dog painter');
  assert.deepEqual(getLevelAnimationActivity(level), { continuous: true, until: 0 });
});

test('only the visible primary selection outline keeps an otherwise static level continuously active', () => {
  const level = createStaticLevel();
  const primary = { x: 2, y: 3, width: 1, height: 1, primary: true };
  assert.notDeepEqual(selectionAlphas([primary], 0), selectionAlphas([primary], 0.1), 'the real primary outline alpha changes with elapsed time');
  assert.deepEqual(getLevelAnimationActivity(level, { selections: [primary] }), { continuous: true, until: 0 });
  assert.deepEqual(getLevelAnimationActivity(level, { selections: [{ ...primary, primary: false }] }), { continuous: false, until: 0 });
});

test('a valid visible one-frame player fixture renders once and then sleeps for 500ms', () => {
  const level = createStaticLevel();
  const player = level.actors.player;
  assert.deepEqual(walkerOutput(player, 0), walkerOutput(player, 0.1), 'the real one-frame appearance bypasses the elapsed-dependent walker fallback');
  const activity = getLevelAnimationActivity(level);
  assert.deepEqual(activity, { continuous: false, until: 0 });

  const harness = createStudioRenderHarness();
  harness.level.setAnimationActivity(activity);
  harness.level.invalidate('project:reactive');
  harness.clock.present(0);
  harness.clock.present(500);
  assert.equal(harness.level.renderCount, 1);
});

test('reduced motion sleeps fallback and primary-selection activity after its final frame', () => {
  const harness = createStudioRenderHarness();
  const activity = getLevelAnimationActivity(createStarterLevel(), { selections: [{ x: 12, y: 20, primary: true }] });
  assert.equal(activity.continuous, true);
  harness.level.setAnimationActivity(activity);
  harness.level.setReducedMotion(true);
  harness.clock.present(0);
  harness.clock.present(1000 / 60);
  assert.equal(harness.level.renderCount, 2);
  assert.equal(harness.clock.pendingCount(), 0);
});
test('level animation activity follows the selected visible appearance and power-up output', async () => {
  const { getLevelAnimationActivity } = await import('../src/render/studio-render-session.svelte.js');
  const staticLevel = {
    board: { walls: [] },
    theme: { edgeEffects: [], elements: [] },
    collectibles: { powerUps: [] },
    actors: { player: null, cats: [], characters: [] },
    decorations: [],
    events: [],
  };
  const frames = [{ pixels: ['0'] }, { pixels: ['1'] }];
  const appearance = {
    stateAnimations: { idle: 'idle', right: 'walk' },
    animations: [
      { id: 'idle', frames: [frames[0]], fps: 4, loop: true },
      { id: 'walk', frames, fps: 4, loop: true },
      { id: 'settle', frames, fps: 2, loop: false },
    ],
  };

  assert.deepEqual(getLevelAnimationActivity(staticLevel), { continuous: false, until: 0 });
  assert.equal(hasAnimatedLevelContent(staticLevel), false);
  assert.deepEqual(getLevelAnimationActivity({ ...staticLevel, collectibles: { powerUps: [{ x: 1, y: 1 }] } }), { continuous: true, until: 0 });
  assert.deepEqual(getLevelAnimationActivity({
    ...staticLevel,
    decorations: [{ appearance, spriteAnimation: 'idle' }],
  }), { continuous: false, until: 0 }, 'unused multi-frame appearances remain static');
  assert.deepEqual(getLevelAnimationActivity({
    ...staticLevel,
    decorations: [{ appearance, spriteAnimation: 'walk' }],
  }), { continuous: true, until: 0 });
  assert.deepEqual(getLevelAnimationActivity({
    ...staticLevel,
    actors: { ...staticLevel.actors, player: { appearance, direction: 'none' } },
  }), { continuous: false, until: 0 }, 'only the actor state selected by the renderer matters');
  assert.deepEqual(getLevelAnimationActivity({
    ...staticLevel,
    actors: { ...staticLevel.actors, player: { appearance, direction: 'right' } },
  }), { continuous: true, until: 0 });
  assert.deepEqual(getLevelAnimationActivity({
    ...staticLevel,
    decorations: [{ appearance, spriteAnimation: 'settle' }],
  }), { continuous: false, until: 1 });
});

test('a selected non-loop appearance wakes until its visible duration then sleeps', () => {
  const harness = createStudioRenderHarness();
  harness.level.setAnimationActivity({ continuous: false, until: 0.1 });
  harness.clock.present(0);
  harness.clock.present(99);
  harness.clock.present(116);
  assert.equal(harness.level.renderCount, 3);
  assert.equal(harness.clock.pendingCount(), 0);
  assert.equal(harness.coordinator.snapshot().surfaces['studio-level-canvas'].active, false);

  harness.level.setAnimationActivity({ continuous: true, until: 0 });
  harness.clock.present(200);
  assert.equal(harness.clock.pendingCount(), 1);
  harness.level.setReducedMotion(true);
  harness.clock.present(300);
  harness.clock.present(400);
  assert.equal(harness.clock.pendingCount(), 0);
});
test('only visible authored animation and effects keep the level surface active', () => {
  const staticLevel = createStaticLevel();
  assert.equal(hasAnimatedLevelContent(staticLevel), false);
  assert.equal(hasAnimatedLevelContent({
    ...staticLevel,
    decorations: [{ appearance: { animations: [{ id: 'idle', frames: [{}] }] } }],
  }), false);

  const animatedValues = [
    { theme: { ...staticLevel.theme, edgeEffects: [{ type: 'water-flow' }] } },
    { theme: { ...staticLevel.theme, landmark: 'zauberberg', elements: [{ id: 'stage-lights', animation: { type: 'pulse' } }] } },
    { board: { walls: [{ effects: [{ type: 'glitch' }] }] } },
    { decorations: [{ type: 'custom', animation: { type: 'bob' } }] },
    { decorations: [{ type: 'text', effects: [{ type: 'neon' }] }] },
    { actors: { ...staticLevel.actors, characters: [{ appearance: { animations: [{ id: 'idle', frames: [{}, {}] }] } }] } },
    { events: [{ visual: { type: 'sprite', appearance: { animations: [{ id: 'idle', frames: [{}, {}], loop: true }] }, spriteAnimation: 'idle' } }] },
  ];
  for (const value of animatedValues) {
    assert.equal(hasAnimatedLevelContent({ ...staticLevel, ...value }, { showEvents: true }), true);
  }
});
