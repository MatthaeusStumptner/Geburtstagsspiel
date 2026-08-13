import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop } from '../src/index.js';

function simulate(displayHz, durationSeconds = 10) {
  const loop = new FixedStepLoop({ updatesPerSecond: 120 });
  let simulated = 0;
  loop.advance(0, () => {});
  const frames = Math.round(displayHz * durationSeconds);
  for (let frame = 1; frame <= frames; frame += 1) {
    loop.advance(frame * 1000 / displayHz, (dt) => { simulated += dt; });
  }
  return simulated;
}

test('simulates equal wall-clock time at 60, 120 and 175 Hz', () => {
  const values = [60, 120, 175].map((hz) => simulate(hz));
  values.forEach((value) => assert.ok(Math.abs(value - 10) < 1 / 120));
  assert.ok(Math.max(...values) - Math.min(...values) < 1 / 120);
});
