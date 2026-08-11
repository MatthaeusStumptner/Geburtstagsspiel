import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBenchmarkAssertions } from '../scripts/benchmark-assertion.js';

const autoRow = ({ renderP95Ms = 6, frameP95Ms = 16, longFramePercent = 0 } = {}) => ({
  requestedBackend: 'auto',
  profile: 'notebook',
  scene: 'gameplay',
  renderP95Ms,
  frameP95Ms,
  longFramePercent,
  budget: {
    passed: renderP95Ms <= 14 && frameP95Ms <= 34 && longFramePercent <= 15,
    budget: { renderP95Ms: 14, frameP95Ms: 34, longFramePercent: 15 },
    failures: [],
  },
});

test('keeps a GitHub-shaped auto frame-only budget failure as a diagnostic warning', () => {
  const row = autoRow({ renderP95Ms: 6.8, frameP95Ms: 49.9, longFramePercent: 42 });
  row.budget.passed = false;
  row.budget.failures = ['Frame-p95 49.9 ms > 34 ms', 'Lange Frames 42% > 15%'];

  const selection = selectBenchmarkAssertions([row]);

  assert.equal(selection.passed, true);
  assert.deepEqual(selection.renderWorkFailures, []);
  assert.deepEqual(selection.experienceDiagnostics, [row]);
  assert.deepEqual(selection.warnings, [row]);
});

test('fails the auto renderer-work gate when render p95 exceeds its profile budget', () => {
  const row = autoRow({ renderP95Ms: 14.1 });
  row.budget.passed = false;
  row.budget.failures = ['Render-p95 14.1 ms > 14 ms'];

  const selection = selectBenchmarkAssertions([row]);

  assert.equal(selection.passed, false);
  assert.deepEqual(selection.renderWorkFailures, [row]);
  assert.deepEqual(selection.warnings, []);
});

test('leaves explicit backend rows as diagnostics rather than asserted benchmark rows', () => {
  const row = { ...autoRow({ renderP95Ms: 50 }), requestedBackend: 'webgl2' };
  row.budget.passed = false;
  row.budget.failures = ['Render-p95 50 ms > 14 ms'];

  const selection = selectBenchmarkAssertions([row]);

  assert.equal(selection.passed, true);
  assert.deepEqual(selection.assertedRows, []);
  assert.deepEqual(selection.renderWorkFailures, []);
  assert.deepEqual(selection.nonAutoDiagnostics, [row]);
});
test('fails closed when an auto renderer-work measurement or its render budget is invalid', () => {
  const missingRenderMeasurement = autoRow();
  delete missingRenderMeasurement.renderP95Ms;
  const rows = [
    missingRenderMeasurement,
    autoRow({ renderP95Ms: Infinity }),
    autoRow({ renderP95Ms: -Infinity }),
    autoRow({ renderP95Ms: Number.NaN }),
    { requestedBackend: 'auto', profile: 'notebook', scene: 'gameplay', renderP95Ms: 6 },
    { ...autoRow(), budget: { passed: true, budget: {} } },
    { ...autoRow(), budget: { passed: true, budget: { renderP95Ms: Infinity } } },
    { ...autoRow(), budget: { passed: true, budget: { renderP95Ms: Number.NaN } } },
  ];

  const selection = selectBenchmarkAssertions(rows);

  assert.equal(selection.passed, false);
  assert.equal(selection.invalidMeasurements.length, rows.length);
  assert.deepEqual(selection.renderWorkFailures, []);
  assert.deepEqual(JSON.parse(JSON.stringify(selection.invalidMeasurements)).map(({ reason }) => reason), [
    'invalid-render-p95-ms',
    'invalid-render-p95-ms',
    'invalid-render-p95-ms',
    'invalid-render-p95-ms',
    'invalid-render-p95-budget-ms',
    'invalid-render-p95-budget-ms',
    'invalid-render-p95-budget-ms',
    'invalid-render-p95-budget-ms',
  ]);
});

test('keeps valid frame-only warnings while failing closed for an invalid auto row and preserving real overflow', () => {
  const warning = autoRow({ renderP95Ms: 6.8, frameP95Ms: 49.9, longFramePercent: 42 });
  warning.budget.passed = false;
  const invalid = autoRow();
  delete invalid.renderP95Ms;
  const overflow = autoRow({ renderP95Ms: 14.1 });
  overflow.budget.passed = false;

  const selection = selectBenchmarkAssertions([warning, invalid, overflow]);

  assert.equal(selection.passed, false);
  assert.deepEqual(selection.warnings, [warning]);
  assert.deepEqual(selection.renderWorkFailures, [overflow]);
  assert.deepEqual(selection.invalidMeasurements.map(({ reason }) => reason), [
    'invalid-render-p95-ms',
  ]);
});
