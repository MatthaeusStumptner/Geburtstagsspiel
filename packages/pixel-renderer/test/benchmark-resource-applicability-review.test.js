import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBenchmarkResources } from '../benchmark/resource-summary.js';

test('benchmark reports Canvas resource metrics as not applicable without synthetic GPU zeros', () => {
  const summary = summarizeBenchmarkResources({
    backend: 'canvas2d',
    resourceMetrics: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor' },
    backingStoreResizes: 1,
  });

  assert.deepEqual(summary, {
    resourceMetrics: {
      applicability: 'not-applicable',
      reason: 'canvas2d-cpu-compositor',
      backingStoreResizes: 1,
    },
  });
  for (const key of [
    'uploadedMegabytes', 'sceneUploadedMegabytes', 'overlayUploadedMegabytes',
    'worldOverlayUploadedMegabytes', 'textureReallocations', 'gpuCropResizes',
    'overlayUploadSkips', 'worldOverlayUploadSkips',
  ]) assert.equal(Object.hasOwn(summary, key), false, `${key} must remain N/A for Canvas2D`);
});

test('benchmark requires and reports finite GPU resource metrics for an applicable backend', () => {
  const info = {
    backend: 'webgl2',
    resourceMetrics: { applicability: 'applicable' },
    uploadedBytes: 1_572_864,
    sceneUploadedBytes: 1_048_576,
    overlayUploadedBytes: 262_144,
    worldOverlayUploadedBytes: 262_144,
    textureReallocations: 3,
    gpuCropResizes: 2,
    overlayUploadSkips: 4,
    worldOverlayUploadSkips: 5,
  };

  assert.deepEqual(summarizeBenchmarkResources(info), {
    resourceMetrics: { applicability: 'applicable' },
    uploadedMegabytes: 1.5,
    sceneUploadedMegabytes: 1,
    overlayUploadedMegabytes: 0.3,
    worldOverlayUploadedMegabytes: 0.3,
    textureReallocations: 3,
    gpuCropResizes: 2,
    overlayUploadSkips: 4,
    worldOverlayUploadSkips: 5,
  });
  assert.throws(
    () => summarizeBenchmarkResources({ ...info, uploadedBytes: Number.NaN }),
    /uploadedBytes must be a finite non-negative number/,
  );
});
