import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForMinimumDuration } from '../scripts/browser-minimum-duration.mjs';

test('minimum-duration wait rechecks time after an early timer instead of failing', async () => {
  let current = 0;
  const waits = [];
  const elapsed = await waitForMinimumDuration({
    startedAt: 0,
    minimumMs: 5_000,
    now: () => current,
    delay: async (milliseconds) => {
      waits.push(milliseconds);
      current += waits.length === 1 ? milliseconds - 1 : milliseconds;
    },
  });

  assert.equal(elapsed, 5_000);
  assert.deepEqual(waits, [5_000, 1]);
});
