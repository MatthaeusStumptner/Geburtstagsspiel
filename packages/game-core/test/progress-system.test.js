import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateProgress } from '../src/progress-system.js';

test('global Gutti scale stays at 630 independently of difficulty targets', () => {
  const ids = Array.from({ length: 9 }, (_, index) => `level-${index}`);
  for (const target of [70, 110, 160]) {
    const stats = Object.fromEntries(ids.map((id) => [id, { bestTreats: target / 2, treatsTotal: target }]));
    const progress = aggregateProgress(ids, new Set(), stats);
    assert.equal(progress.treatsTotal, 630);
    assert.equal(progress.treatsFound, 315);
  }
});
