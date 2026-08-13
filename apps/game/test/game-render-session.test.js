import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderCoordinator } from '@franz-lola/render-coordinator';
import { createGameRenderSession } from '../src/render/game-render-session.js';

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

function createGameRenderHarness(onRender = () => {}) {
  const clock = createFrameClock();
  const reasons = [];
  const timestamps = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  let session;
  session = createGameRenderSession({
    coordinator,
    render: (reason, timestamp) => {
      reasons.push(reason);
      timestamps.push(timestamp);
      onRender({ reason, session, timestamp });
    },
  });
  return { clock, coordinator, reasons, session, timestamps };
}

test('shared game adapter preserves hidden, once, and continuous policies', () => {
  const harness = createGameRenderHarness();
  harness.session.invalidate('state:paused');
  harness.session.frame(0, { mode: 'once' });
  harness.clock.present(0);
  harness.session.frame(16, { mode: 'once' });
  harness.clock.present(16);
  assert.deepEqual(harness.reasons, ['state:paused']);

  harness.session.frame(32, { mode: 'hidden' });
  harness.clock.present(32);
  assert.equal(harness.reasons.length, 1);

  harness.session.frame(48, { mode: 'continuous', maxFps: 60 });
  harness.clock.present(48);
  assert.equal(harness.reasons.length, 2);
});

test('manual debug invalidation wakes an asleep once policy for one presentation', () => {
  const harness = createGameRenderHarness();
  harness.session.frame(0, { mode: 'once' });
  assert.equal(harness.clock.pendingCount(), 0);

  harness.session.invalidate('debug:step');
  assert.equal(harness.clock.pendingCount(), 1);
  harness.clock.present(1);

  assert.deepEqual(harness.reasons, ['debug:step']);
  assert.equal(harness.clock.pendingCount(), 0);
});

test('frame changes eligibility but leaves presentation to the coordinator callback', () => {
  const harness = createGameRenderHarness();
  harness.session.frame(0, { mode: 'continuous', maxFps: 60 });
  assert.deepEqual(harness.reasons, []);
  assert.equal(harness.clock.pendingCount(), 1);

  harness.session.invalidate('state:playing');
  harness.session.invalidate('state:playing');
  harness.session.invalidate('layout:resize-observer');
  assert.equal(harness.clock.pendingCount(), 1);
  harness.clock.present(0);

  assert.deepEqual(harness.reasons, ['state:playing']);
  assert.deepEqual(harness.session.snapshot(), {
    pendingReason: 'idle',
    renderCount: 1,
    hiddenSkips: 0,
    lastReason: 'state:playing',
  });
  assert.equal(Object.isFrozen(harness.session.snapshot()), true);
});

test('hidden mode cancels queued presentation and discards hidden invalidations', () => {
  const harness = createGameRenderHarness();
  harness.session.frame(0, { mode: 'continuous', maxFps: 60 });
  harness.session.invalidate('state:map');
  harness.session.frame(1, { mode: 'hidden' });
  assert.equal(harness.clock.pendingCount(), 0);

  harness.session.invalidate('layout:hidden-resize');
  harness.session.frame(2, { mode: 'once' });
  harness.clock.present(2);

  assert.deepEqual(harness.reasons, []);
  assert.deepEqual(harness.session.snapshot(), {
    pendingReason: 'idle',
    renderCount: 0,
    hiddenSkips: 1,
    lastReason: 'idle',
  });
});

test('reentrant once invalidation survives the current presentation', () => {
  const harness = createGameRenderHarness(({ reason, session }) => {
    if (reason === 'initial') session.invalidate('follow-up');
  });
  harness.session.frame(0, { mode: 'once' });
  harness.session.invalidate('initial');
  harness.clock.present(0);
  assert.equal(harness.clock.pendingCount(), 1);
  harness.clock.present(1000 / 60);

  assert.deepEqual(harness.reasons, ['initial', 'follow-up']);
  assert.equal(harness.clock.pendingCount(), 0);
});

test('renderer exceptions keep scheduler health and preserve reentrant follow-up work', () => {
  let fail = true;
  const harness = createGameRenderHarness(({ reason, session }) => {
    if (fail) {
      fail = false;
      session.invalidate('follow-up');
      throw new Error(`renderer failed during ${reason}`);
    }
  });
  harness.session.frame(0, { mode: 'once' });
  harness.session.invalidate('initial');

  assert.throws(() => harness.clock.present(0), /renderer failed during initial/);
  assert.deepEqual(harness.session.snapshot(), {
    pendingReason: 'follow-up',
    renderCount: 0,
    hiddenSkips: 0,
    lastReason: 'idle',
  });
  assert.equal(harness.clock.pendingCount(), 1);

  harness.clock.present(1000 / 60);
  assert.deepEqual(harness.reasons, ['initial', 'follow-up']);
  assert.equal(harness.session.snapshot().renderCount, 1);
  assert.equal(harness.clock.pendingCount(), 0);
});

test('renderer exceptions do not revive work discarded by a reentrant hidden transition', () => {
  const harness = createGameRenderHarness(({ session }) => {
    session.frame(1, { mode: 'hidden' });
    throw new Error('renderer failed after hiding');
  });
  harness.session.frame(0, { mode: 'continuous', maxFps: 60 });
  harness.session.invalidate('state:playing');

  assert.throws(() => harness.clock.present(0), /renderer failed after hiding/);
  assert.equal(harness.session.snapshot().pendingReason, 'idle');
  assert.equal(harness.clock.pendingCount(), 0);

  harness.session.frame(2, { mode: 'once' });
  harness.clock.present(2);
  assert.deepEqual(harness.reasons, ['state:playing']);
});

test('renderer exceptions reactivate a retry after a reentrant once transition', () => {
  let fail = true;
  const harness = createGameRenderHarness(({ session }) => {
    if (!fail) return;
    fail = false;
    session.frame(1, { mode: 'once' });
    throw new Error('renderer failed after switching to once');
  });
  harness.session.frame(0, { mode: 'continuous', maxFps: 60 });
  harness.session.invalidate('state:playing');

  assert.throws(() => harness.clock.present(0), /renderer failed after switching to once/);
  assert.equal(harness.session.snapshot().pendingReason, 'state:playing');
  assert.equal(harness.clock.pendingCount(), 1);

  harness.clock.present(1000 / 60);
  assert.deepEqual(harness.reasons, ['state:playing', 'state:playing']);
  assert.equal(harness.session.snapshot().pendingReason, 'idle');
  assert.equal(harness.clock.pendingCount(), 0);
});

test('continuous presentation follows the native display rate', () => {
  for (const displayRate of [60, 90, 120, 175]) {
    const harness = createGameRenderHarness();
    harness.session.frame(0, { mode: 'continuous', maxFps: null });
    for (let frame = 0; frame <= displayRate * 2; frame += 1) {
      harness.clock.present(frame * 1000 / displayRate);
    }
    assert.equal(harness.reasons.length, displayRate * 2 + 1, `${displayRate} Hz must present every display frame`);
  }
});

test('continuous cadence recovers from suspended and backwards timestamps without bursts', () => {
  const harness = createGameRenderHarness();
  harness.session.frame(0, { mode: 'continuous', maxFps: null });
  for (const timestamp of [0, 1000, 1008, -10, -2, -10 + 1000 / 60]) harness.clock.present(timestamp);
  assert.deepEqual(harness.timestamps, [0, 1000, 1008, -10, -2, -10 + 1000 / 60]);
});

test('reset starts a fresh coordinator cadence without losing legacy diagnostics', () => {
  const harness = createGameRenderHarness();
  harness.session.frame(0, { mode: 'continuous', maxFps: null });
  harness.session.invalidate('state:playing');
  harness.clock.present(0);
  harness.clock.present(1);
  assert.deepEqual(harness.timestamps, [0, 1]);

  harness.session.reset();
  assert.equal(harness.clock.pendingCount(), 1);
  harness.clock.present(1);

  assert.deepEqual(harness.timestamps, [0, 1, 1]);
  assert.deepEqual(harness.session.snapshot(), {
    pendingReason: 'idle',
    renderCount: 3,
    hiddenSkips: 0,
    lastReason: 'continuous',
  });
});