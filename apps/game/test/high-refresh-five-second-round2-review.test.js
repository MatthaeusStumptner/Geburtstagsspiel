import assert from 'node:assert/strict';
import test from 'node:test';
import { assertHighRefreshResult } from '../scripts/browser-regression-contracts.mjs';
import { createBrowserGameSession, setDebugPlayerPosition } from '../src/game/game-session-adapter.js';
import { publishedLevel } from '../src/game/level-catalog.js';

const START = Object.freeze({ x: 1, y: 1 });
const EXPECTED_SAMPLES = Object.freeze([
  Object.freeze({ elapsedMs: 1_000, player: Object.freeze({ x: 6.8, y: 1 }) }),
  Object.freeze({ elapsedMs: 2_000, player: Object.freeze({ x: 12.6, y: 1 }) }),
  Object.freeze({ elapsedMs: 3_000, player: Object.freeze({ x: 18.4, y: 1 }) }),
  Object.freeze({ elapsedMs: 4_000, player: Object.freeze({ x: 23, y: 2.2 }) }),
  Object.freeze({ elapsedMs: 5_000, player: Object.freeze({ x: 23, y: 8 }) }),
]);

function referenceTrajectory(refreshRate) {
  const session = createBrowserGameSession({ level: publishedLevel('home'), difficulty: 'easy' });
  setDebugPlayerPosition(session, START);
  session.queueInput('right');
  const samples = [];
  for (let frame = 1; frame <= refreshRate * 5; frame += 1) {
    if (frame === Math.round(refreshRate * 3.4)) session.queueInput('down');
    const snapshot = session.step(1 / refreshRate);
    if (frame % refreshRate === 0) samples.push({
      elapsedMs: frame / refreshRate * 1_000,
      player: { x: snapshot.player.x, y: snapshot.player.y },
    });
  }
  return samples;
}

test('60, 120, and 175 Hz traverse the independent five-second Home trajectory', () => {
  for (const refreshRate of [60, 120, 175]) {
    const actual = referenceTrajectory(refreshRate);
    assert.equal(actual.length, EXPECTED_SAMPLES.length);
    actual.forEach((sample, index) => {
      assert.equal(sample.elapsedMs, EXPECTED_SAMPLES[index].elapsedMs);
      assert.ok(Math.hypot(
        sample.player.x - EXPECTED_SAMPLES[index].player.x,
        sample.player.y - EXPECTED_SAMPLES[index].player.y,
      ) <= 1e-9, `${refreshRate} Hz sample ${index + 1} must match the hand-derived route`);
    });
  }
});

test('high-refresh gate rejects a trajectory that stops after four seconds', () => {
  const saturated = EXPECTED_SAMPLES.slice(0, 4);
  assert.throws(() => assertHighRefreshResult({
    presentationDelta: 300,
    positionError: 0,
    tolerance: (5.8 / 120) + 0.006,
    baselinePlayer: START,
    finalPlayer: saturated.at(-1).player,
    expectedPlayer: saturated.at(-1).player,
    trajectorySamples: saturated,
  }, 'four-second-saturation'), /five.second|5.?000|terminal|trajectory/i);
});
