import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePerformanceBudget, summarizeRenderSamples } from '../src/performance.js';

test('summarizes deterministic render and frame percentiles', () => {
  const summary = summarizeRenderSamples([1, 2, 3, 4, 12], [16, 16.5, 17, 20, 40], 8.4);
  assert.equal(summary.renderP50Ms, 3);
  assert.equal(summary.renderP95Ms, 12);
  assert.equal(summary.frameP95Ms, 40);
  assert.equal(summary.longFramePercent, 20);
  assert.equal(summary.longTaskDurationMs, 8.4);
});

test('evaluates notebook and weak-mobile budgets independently', () => {
  const summary = { renderP95Ms: 12, frameP95Ms: 30, longFramePercent: 20 };
  assert.equal(evaluatePerformanceBudget(summary, 'notebook').passed, false);
  assert.equal(evaluatePerformanceBudget(summary, 'weak-mobile').passed, true);
});
