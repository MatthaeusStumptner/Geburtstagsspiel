import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderCoordinator } from '@franz-lola/render-coordinator';
import { createRenderSurfaceLifecycle } from '../src/render/use-render-surface.svelte.js';

function createFrameClock() {
  let pending = null;
  let nextHandle = 1;
  return {
    adapter: {
      requestFrame(callback) {
        assert.equal(pending, null);
        pending = { callback, handle: nextHandle++ };
        return pending.handle;
      },
      cancelFrame(handle) {
        if (pending?.handle === handle) pending = null;
      },
      now: () => 0,
    },
    present(timestamp) {
      const frame = pending;
      pending = null;
      frame?.callback(timestamp);
    },
    pendingCount: () => pending ? 1 : 0,
  };
}

test('surface lifecycle measures outside presentation and owns resize, visibility and cleanup', () => {
  const clock = createFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  const frames = [];
  const observers = {};
  let rectReads = 0;
  let mediaRemoved = false;
  const node = {
    getBoundingClientRect() {
      rectReads += 1;
      return { width: 640, height: 480 };
    },
  };
  const environment = {
    devicePixelRatio: () => 2,
    createResizeObserver(callback) {
      observers.resize = { callback, disconnected: false };
      return { observe() {}, disconnect() { observers.resize.disconnected = true; } };
    },
    createIntersectionObserver(callback) {
      observers.intersection = { callback, disconnected: false };
      return { observe() {}, disconnect() { observers.intersection.disconnected = true; } };
    },
    reducedMotionQuery() {
      return {
        matches: false,
        addEventListener() {},
        removeEventListener() { mediaRemoved = true; },
      };
    },
  };
  const surface = createRenderSurfaceLifecycle({
    coordinator,
    id: 'test-level',
    profile: 'editor',
    visible: true,
    render: (frame) => {
      frames.push(frame);
      assert.equal(rectReads, 1, 'presentation must reuse observer measurements without DOM reads');
    },
    environment,
  });

  const mounted = surface.action(node);
  clock.present(0);
  assert.equal(frames[0].measurement.width, 640);
  assert.equal(frames[0].measurement.devicePixelRatio, 2);

  observers.resize.callback([{ contentRect: { width: 800, height: 450 } }]);
  clock.present(1000 / 60);
  assert.equal(frames[1].measurement.width, 800);
  assert.equal(frames[1].reason, 'layout:resize-observer');

  observers.intersection.callback([{ isIntersecting: false }]);
  surface.invalidate('pointer:hidden');
  clock.present(1000 / 30);
  assert.equal(frames.length, 2);
  surface.setVisible(false);
  observers.intersection.callback([{ isIntersecting: true }]);
  assert.equal(clock.pendingCount(), 0);

  surface.setVisible(true);
  clock.present(50);
  assert.equal(frames.length, 3);

  mounted.destroy();
  assert.equal(observers.resize.disconnected, true);
  assert.equal(observers.intersection.disconnected, true);
  assert.equal(mediaRemoved, true);
  assert.deepEqual(coordinator.snapshot().surfaces, {});
});

test('surface lifecycle preserves the canvas border box for pointer-to-world geometry', () => {
  const clock = createFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  const frames = [];
  const observers = {};
  const surface = createRenderSurfaceLifecycle({
    coordinator,
    id: 'border-box-level',
    profile: 'editor',
    render: (frame) => frames.push(frame),
    environment: {
      devicePixelRatio: () => 1,
      createResizeObserver(callback) {
        observers.resize = callback;
        return { observe() {}, disconnect() {} };
      },
      createIntersectionObserver() { return { observe() {}, disconnect() {} }; },
      reducedMotionQuery: () => null,
    },
  });

  surface.action({ getBoundingClientRect: () => ({ width: 642, height: 482 }) });
  clock.present(0);
  observers.resize([{
    contentRect: { width: 640, height: 480 },
    borderBoxSize: [{ inlineSize: 642, blockSize: 482 }],
  }]);
  clock.present(1000 / 60);

  assert.equal(frames[1].measurement.width, 642);
  assert.equal(frames[1].measurement.height, 482);
});