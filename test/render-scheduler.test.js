import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderScheduler } from '../src/render/render-scheduler.js';

test('renders continuous states through the pacer and static states once', () => {
  const renders = [];
  const scheduler = createRenderScheduler({
    render: (reason) => renders.push(reason),
    pacer: { shouldPresent: () => true, reset() {} },
  });
  scheduler.frame(0, 'continuous');
  scheduler.frame(16, 'continuous');
  scheduler.request('pause-enter');
  scheduler.frame(32, 'once');
  scheduler.frame(48, 'once');
  scheduler.request('hud-change');
  scheduler.frame(64, 'once');
  scheduler.frame(80, 'hidden');
  assert.deepEqual(renders, ['continuous', 'continuous', 'pause-enter', 'hud-change']);
});

test('replaces pending work and clears it without rendering while hidden', () => {
  const renders = [];
  const scheduler = createRenderScheduler({
    render: (reason) => renders.push(reason),
    pacer: { shouldPresent: () => true, reset() {} },
  });

  scheduler.request('state:ready');
  scheduler.request('layout:resize-observer');
  scheduler.frame(10, 'hidden');
  scheduler.frame(20, 'once');

  assert.deepEqual(renders, []);
  assert.deepEqual(scheduler.snapshot(), {
    pendingReason: 'idle',
    renderCount: 0,
    hiddenSkips: 1,
    lastReason: 'idle',
  });
  assert.equal(Object.isFrozen(scheduler.snapshot()), true);
});

test('uses a pending reason on the next paced continuous frame', () => {
  const renders = [];
  const presentedAt = [];
  const scheduler = createRenderScheduler({
    render: (reason, timestamp) => renders.push([reason, timestamp]),
    pacer: {
      shouldPresent(timestamp) {
        presentedAt.push(timestamp);
        return timestamp >= 16;
      },
      reset() {},
    },
  });

  scheduler.request('state:playing');
  scheduler.frame(0, 'continuous');
  scheduler.frame(16, 'continuous');

  assert.deepEqual(presentedAt, [0, 16]);
  assert.deepEqual(renders, [['state:playing', 16]]);
  assert.deepEqual(scheduler.snapshot(), {
    pendingReason: 'idle',
    renderCount: 1,
    hiddenSkips: 0,
    lastReason: 'state:playing',
  });
});

test('reset delegates its timestamp to the presentation pacer', () => {
  const resets = [];
  const scheduler = createRenderScheduler({
    render() {},
    pacer: { shouldPresent: () => false, reset: (timestamp) => resets.push(timestamp) },
  });

  scheduler.reset(125);

  assert.deepEqual(resets, [125]);
});
