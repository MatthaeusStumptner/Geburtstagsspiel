import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderCoordinator } from '@franz-lola/render-coordinator';
import { createRenderScheduler } from '../src/render/render-scheduler.js';

function createHarness() {
  let pending = null;
  let handle = 0;
  const reasons = [];
  const coordinator = createRenderCoordinator({
    requestFrame(callback) {
      pending = { callback, handle: ++handle };
      return handle;
    },
    cancelFrame(cancelledHandle) {
      if (pending?.handle === cancelledHandle) pending = null;
    },
    now() {
      return 0;
    },
  });
  const scheduler = createRenderScheduler({
    coordinator,
    render: (reason) => reasons.push(reason),
  });
  return {
    reasons,
    scheduler,
    present(timestamp) {
      const frame = pending;
      pending = null;
      frame?.callback(timestamp);
    },
  };
}

test('legacy scheduler entry point delegates presentation to the shared coordinator', () => {
  const harness = createHarness();
  harness.scheduler.invalidate('state:paused');
  harness.scheduler.frame(0, { mode: 'once' });
  assert.deepEqual(harness.reasons, []);
  harness.present(0);
  harness.present(16);
  assert.deepEqual(harness.reasons, ['state:paused']);
});

test('legacy scheduler entry point exposes the coordinator-backed diagnostics', () => {
  const harness = createHarness();
  harness.scheduler.invalidate('state:won');
  harness.scheduler.invalidate('overlay:show');
  harness.scheduler.frame(0, { mode: 'once' });
  harness.present(0);
  assert.deepEqual(harness.scheduler.snapshot(), {
    pendingReason: 'idle',
    renderCount: 1,
    hiddenSkips: 0,
    lastReason: 'state:won',
  });
});
