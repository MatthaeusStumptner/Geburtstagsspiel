import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertStableResourceWindow,
  readRendererCounters,
} from '../scripts/browser-regression-contracts.mjs';

function common(backend) {
  return {
    requestedBackend: backend, backend, contextLost: false, fallbackReason: null,
    frameCount: 12, staticWorldRevision: 2, scheduler: { renderCount: 12 },
  };
}

test('browser gate reads GPU and Canvas2D resource counters with explicit applicability', () => {
  const gpu = readRendererCounters({
    ...common('webgl2'),
    resourceMetrics: { applicability: 'applicable' },
    uploadedBytes: 20, sceneUploadedBytes: 10, overlayUploadedBytes: 4,
    worldOverlayUploadedBytes: 6, textureReallocations: 3, gpuCropResizes: 2,
  }, 'gpu');
  assert.deepEqual(gpu.resources, {
    applicability: 'applicable', kind: 'gpu-textures', value: 3,
  });

  const canvas = readRendererCounters({
    ...common('canvas2d'),
    resourceMetrics: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor' },
    backingStoreResizes: 2,
  }, 'canvas');
  assert.deepEqual(canvas.resources, {
    applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor',
    kind: 'canvas-backing-store', value: 2,
  });
});

test('stable resource gate applies texture reallocations only to GPU and backing-store resizes to Canvas2D', () => {
  assert.deepEqual(assertStableResourceWindow(
    { resources: { applicability: 'applicable', kind: 'gpu-textures', value: 3 } },
    { resources: { applicability: 'applicable', kind: 'gpu-textures', value: 3 } },
    'gpu',
  ), { applicability: 'applicable', kind: 'gpu-textures', delta: 0 });
  assert.deepEqual(assertStableResourceWindow(
    { resources: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor', kind: 'canvas-backing-store', value: 2 } },
    { resources: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor', kind: 'canvas-backing-store', value: 2 } },
    'canvas',
  ), { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor', kind: 'canvas-backing-store', delta: 0 });
  assert.throws(() => assertStableResourceWindow(
    { resources: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor', kind: 'canvas-backing-store', value: 2 } },
    { resources: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor', kind: 'canvas-backing-store', value: 3 } },
    'canvas-grow',
  ), /backing-store/);
});
