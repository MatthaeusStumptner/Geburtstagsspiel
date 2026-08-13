import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserGameSession, setDebugPlayerPosition } from '../src/game/game-session-adapter.js';
import { publishedLevel } from '../src/game/level-catalog.js';
import { assertHighRefreshResult } from '../scripts/browser-regression-contracts.mjs';

const START = Object.freeze({ x: 1, y: 1 });
const EXPECTED = Object.freeze({ x: 23, y: 8 });

function referenceTrajectory(refreshRate) {
  const session = createBrowserGameSession({ level: publishedLevel('home'), difficulty: 'easy' });
  setDebugPlayerPosition(session, START);
  session.queueInput('right');
  let snapshot;
  for (let frame = 0; frame < refreshRate * 5; frame += 1) {
    if (frame === Math.round(refreshRate * 3.4)) session.queueInput('down');
    snapshot = session.step(1 / refreshRate);
  }
  return { x: snapshot.player.x, y: snapshot.player.y };
}

test('five-second Home trajectory is nontrivial and identical at 60, 120, and 175 Hz', () => {
  const trajectories = [60, 120, 175].map(referenceTrajectory);
  for (const trajectory of trajectories) assert.ok(Math.hypot(trajectory.x - EXPECTED.x, trajectory.y - EXPECTED.y) <= 1e-9);
  assert.ok(Math.hypot(EXPECTED.x - START.x, EXPECTED.y - START.y) >= 20, 'reference path must travel through free space');
});

test('high-refresh gate rejects the previous zero-distance drift fixture', () => {
  assert.throws(() => assertHighRefreshResult({
    presentationDelta: 300,
    durationMs: 5_000,
    refreshRate: 60,
    positionError: 0,
    tolerance: 0.1,
    baselinePlayer: { x: 7, y: 20 },
    finalPlayer: { x: 7, y: 20 },
    expectedPlayer: { x: 7, y: 20 },
  }, 'blocked'), /nontrivial|travel|movement|trajectory/);
});
