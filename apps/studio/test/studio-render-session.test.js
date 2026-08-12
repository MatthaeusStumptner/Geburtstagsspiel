import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderCoordinator } from '@franz-lola/render-coordinator';
import { createStudioRenderSession, hasAnimatedLevelContent } from '../src/render/studio-render-session.svelte.js';

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

test('reduced motion sleeps ambient animation but preserves one-shot edits', () => {
  const harness = createStudioRenderHarness();
  harness.level.setActive(true);
  harness.level.setReducedMotion(true);
  assert.equal(harness.clock.pendingCount(), 0);

  harness.level.invalidate('pointer:selection');
  harness.clock.present(0);
  harness.clock.present(1000 / 60);
  assert.equal(harness.level.renderCount, 1);

  harness.level.setReducedMotion(false);
  assert.equal(harness.clock.pendingCount(), 1);
  harness.clock.present(1000 / 30);
  assert.equal(harness.level.renderCount, 2);
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

test('only visible authored animation and effects keep the level surface active', () => {
  const staticLevel = {
    board: { walls: [] },
    theme: { edgeEffects: [], elements: [] },
    actors: { player: {}, cats: [], characters: [] },
    decorations: [],
    events: [],
  };
  assert.equal(hasAnimatedLevelContent(staticLevel), false);
  assert.equal(hasAnimatedLevelContent({
    ...staticLevel,
    decorations: [{ appearance: { animations: [{ id: 'idle', frames: [{}] }] } }],
  }), false);

  const animatedValues = [
    { theme: { ...staticLevel.theme, edgeEffects: [{ type: 'water-flow' }] } },
    { theme: { ...staticLevel.theme, elements: [{ animation: { type: 'pulse' } }] } },
    { board: { walls: [{ effects: [{ type: 'glitch' }] }] } },
    { decorations: [{ type: 'custom', animation: { type: 'bob' } }] },
    { decorations: [{ type: 'text', effects: [{ type: 'neon' }] }] },
    { actors: { ...staticLevel.actors, characters: [{ appearance: { animations: [{ id: 'idle', frames: [{}, {}] }] } }] } },
    { events: [{ visual: { animation: { type: 'spin' } } }] },
  ];
  for (const value of animatedValues) {
    assert.equal(hasAnimatedLevelContent({ ...staticLevel, ...value }), true);
  }
});
