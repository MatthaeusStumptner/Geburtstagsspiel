import assert from 'node:assert/strict';
import test from 'node:test';
import { FixedStepLoop } from '../src/index.js';

test('advanceSeconds clamps a long frame and exposes the remaining interpolation alpha', () => {
  const loop = new FixedStepLoop({ updatesPerSecond: 10, maxFrameSeconds: 0.25, maxUpdatesPerFrame: 10 });
  const updates = [];
  assert.equal(loop.advanceSeconds(1, (dt) => updates.push(dt)), 2);
  assert.deepEqual(updates, [0.1, 0.1]);
  assert.ok(Math.abs(loop.interpolationAlpha - 0.5) < 1e-9);
});

test('max update exhaustion drops backlog beyond one fixed step', () => {
  const loop = new FixedStepLoop({ updatesPerSecond: 10, maxFrameSeconds: 1, maxUpdatesPerFrame: 2 });
  let updates = 0;
  assert.equal(loop.advanceSeconds(1, () => { updates += 1; }), 2);
  assert.equal(loop.interpolationAlpha, 1);
  assert.equal(loop.advanceSeconds(0, () => { updates += 1; }), 1);
  assert.equal(updates, 3);
  assert.equal(loop.interpolationAlpha, 0);
});

test('reset clears timestamp, backlog and interpolation state', () => {
  const loop = new FixedStepLoop({ updatesPerSecond: 10 });
  loop.advanceSeconds(0.05, () => {});
  assert.ok(loop.interpolationAlpha > 0);
  loop.reset();
  assert.equal(loop.interpolationAlpha, 0);
  assert.equal(loop.advance(500, () => assert.fail('first timestamp after reset must not update')), 0);
});

test('invalid and negative deltas cannot advance or corrupt alpha', () => {
  const loop = new FixedStepLoop({ updatesPerSecond: 10 });
  for (const delta of [-1, Number.NaN, Number.POSITIVE_INFINITY, 'invalid']) {
    assert.equal(loop.advanceSeconds(delta, () => assert.fail(`${delta} must not update`)), 0);
    assert.equal(loop.interpolationAlpha, 0);
  }
  loop.advance(1000, () => {});
  assert.equal(loop.advance(900, () => assert.fail('negative timestamp delta must not update')), 0);
  assert.equal(loop.interpolationAlpha, 0);
});
test('snapshot and restore retain only the advanceSeconds accumulator', () => {
  const source = new FixedStepLoop({ updatesPerSecond: 10 });
  source.advanceSeconds(0.06, () => assert.fail('partial frame must not update'));
  const saved = source.snapshot();
  assert.deepEqual(saved, { accumulator: 0.06 });
  assert.equal(Object.isFrozen(saved), true);
  const restored = new FixedStepLoop({ updatesPerSecond: 10 });
  restored.restore(saved);
  let updates = 0;
  restored.advanceSeconds(0.04, () => { updates += 1; });
  assert.equal(updates, 1);
  assert.equal(restored.interpolationAlpha, 0);
});
test('restore round-trips the reachable negative epsilon residue and preserves the next update decision', () => {
  const source = new FixedStepLoop({ updatesPerSecond: 1, maxFrameSeconds: 2 });
  let initialUpdates = 0;
  assert.equal(source.advanceSeconds(1 - Number.EPSILON / 2, () => { initialUpdates += 1; }), 1);
  assert.equal(initialUpdates, 1);
  const saved = source.snapshot();
  assert.ok(saved.accumulator < 0 && saved.accumulator > -Number.EPSILON, String(saved.accumulator));

  const restored = new FixedStepLoop({ updatesPerSecond: 1, maxFrameSeconds: 2 });
  assert.deepEqual(restored.restore(JSON.parse(JSON.stringify(saved))), saved);
  let sourceUpdates = 0;
  let restoredUpdates = 0;
  const nextDelta = 1 - Number.EPSILON;
  source.advanceSeconds(nextDelta, () => { sourceUpdates += 1; });
  restored.advanceSeconds(nextDelta, () => { restoredUpdates += 1; });
  assert.equal(restoredUpdates, sourceUpdates);
  assert.deepEqual(restored.snapshot(), source.snapshot());
});

test('restore rejects external accumulator values outside the finite reachable range', () => {
  const loop = new FixedStepLoop({ updatesPerSecond: 1, maxFrameSeconds: 2 });
  for (const accumulator of [
    -Number.EPSILON,
    -1,
    1 + Number.EPSILON,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '0.5',
    null,
  ]) {
    assert.deepEqual(loop.restore({ accumulator }), { accumulator: 0 }, String(accumulator));
  }
});
