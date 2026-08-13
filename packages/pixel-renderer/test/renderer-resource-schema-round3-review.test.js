import assert from 'node:assert/strict';
import test from 'node:test';
import { readRendererCounters } from '../../../apps/game/scripts/browser-regression-contracts.mjs';
import { summarizeBenchmarkResources } from '../benchmark/resource-summary.js';

const EXPECTED_GPU_ONLY_FIELDS = Object.freeze([
  'uploadedBytes',
  'sceneUploadedBytes',
  'overlayUploadedBytes',
  'worldOverlayUploadedBytes',
  'textureReallocations',
  'gpuCropResizes',
  'sceneUploadSkips',
  'overlayUploadSkips',
  'worldOverlayUploadSkips',
]);

function canvasDiagnostics(extra = {}) {
  return {
    requestedBackend: 'canvas2d', backend: 'canvas2d', frameCount: 1,
    staticWorldRevision: 1, scheduler: { renderCount: 1 },
    resourceMetrics: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor' },
    backingStoreResizes: 1,
    ...extra,
  };
}

function gpuDiagnostics(extra = {}) {
  return {
    requestedBackend: 'webgl2', backend: 'webgl2', frameCount: 1,
    staticWorldRevision: 1, scheduler: { renderCount: 1 },
    resourceMetrics: { applicability: 'applicable' },
    ...Object.fromEntries(EXPECTED_GPU_ONLY_FIELDS.map((field, index) => [field, index + 1])),
    ...extra,
  };
}

test('shared schema rejects every GPU-only field on Canvas and requires every field for GPU', async () => {
  const module = await import('../src/index.js');
  assert.deepEqual(module.GPU_ONLY_RENDERER_FIELDS, EXPECTED_GPU_ONLY_FIELDS);

  for (const field of EXPECTED_GPU_ONLY_FIELDS) {
    assert.throws(
      () => module.validateRendererResourceMetrics(canvasDiagnostics({ [field]: 0 })),
      new RegExp(field),
      `${field} must be rejected on Canvas`,
    );
    const incomplete = gpuDiagnostics();
    delete incomplete[field];
    assert.throws(
      () => module.validateRendererResourceMetrics(incomplete),
      new RegExp(field),
      `${field} must be required on GPU`,
    );
  }

  assert.deepEqual(module.validateRendererResourceMetrics(canvasDiagnostics()), {
    applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor',
    kind: 'canvas-backing-store', value: 1,
  });
  assert.deepEqual(module.validateRendererResourceMetrics(gpuDiagnostics()), {
    applicability: 'applicable', kind: 'gpu-textures', value: 5,
  });
  assert.throws(
    () => module.validateRendererResourceMetrics({ resourceMetrics: { applicability: 'unknown' } }),
    /applicability/,
  );
});

test('Game and benchmark Canvas gates reject the complete shared GPU-only schema', () => {
  for (const field of EXPECTED_GPU_ONLY_FIELDS) {
    const diagnostics = canvasDiagnostics({ [field]: 0 });
    assert.throws(() => readRendererCounters(diagnostics, `game-${field}`), new RegExp(field));
    assert.throws(() => summarizeBenchmarkResources(diagnostics), new RegExp(field));
  }
});

test('Game and benchmark GPU gates require finite measured values for every shared field', () => {
  assert.doesNotThrow(() => readRendererCounters(gpuDiagnostics(), 'game-gpu'));
  assert.doesNotThrow(() => summarizeBenchmarkResources(gpuDiagnostics()));
  for (const field of EXPECTED_GPU_ONLY_FIELDS) {
    assert.throws(() => readRendererCounters(gpuDiagnostics({ [field]: Number.NaN }), `game-${field}`), new RegExp(field));
    assert.throws(() => summarizeBenchmarkResources(gpuDiagnostics({ [field]: Number.NaN })), new RegExp(field));
  }
});
