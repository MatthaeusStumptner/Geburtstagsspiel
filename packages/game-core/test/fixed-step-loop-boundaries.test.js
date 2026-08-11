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
