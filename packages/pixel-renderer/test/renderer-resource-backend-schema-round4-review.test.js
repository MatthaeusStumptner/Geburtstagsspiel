import assert from 'node:assert/strict';
import test from 'node:test';
import { readRendererCounters } from '../../../apps/game/scripts/browser-regression-contracts.mjs';
import { summarizeBenchmarkResources } from '../benchmark/resource-summary.js';
import { validateRendererResourceMetrics } from '../src/index.js';

const GPU_FIELDS = Object.freeze({
  uploadedBytes: 10,
  sceneUploadedBytes: 4,
  overlayUploadedBytes: 3,
  worldOverlayUploadedBytes: 3,
  textureReallocations: 2,
  gpuCropResizes: 1,
  sceneUploadSkips: 0,
  overlayUploadSkips: 5,
  worldOverlayUploadSkips: 6,
});

function diagnostics(backend, resources) {
  return {
    requestedBackend: backend,
    backend,
    frameCount: 1,
    staticWorldRevision: 1,
    scheduler: { renderCount: 1 },
    ...resources,
  };
}

const canvas = () => diagnostics('canvas2d', {
  resourceMetrics: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor' },
  backingStoreResizes: 2,
});
const gpu = (backend) => diagnostics(backend, {
  resourceMetrics: { applicability: 'applicable' },
  ...GPU_FIELDS,
});

function everyGateRejects(info, label) {
  assert.throws(() => validateRendererResourceMetrics(info), undefined, `${label}: shared validator`);
  assert.throws(() => readRendererCounters(info, label), undefined, `${label}: Game gate`);
  assert.throws(() => summarizeBenchmarkResources(info), undefined, `${label}: benchmark gate`);
}

test('backend selects one exact resource schema and rejects cross-schema or unknown resource keys', () => {
  everyGateRejects(diagnostics('canvas2d', {
    resourceMetrics: { applicability: 'applicable' },
    ...GPU_FIELDS,
  }), 'canvas-applicable');
  for (const backend of ['webgl2', 'webgpu']) {
    everyGateRejects(diagnostics(backend, {
      resourceMetrics: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor' },
      backingStoreResizes: 2,
    }), `${backend}-not-applicable`);
    everyGateRejects({ ...gpu(backend), backingStoreResizes: 0 }, `${backend}-canvas-field`);
  }
  everyGateRejects({ ...gpu('webgl2'), resourceMetrics: { applicability: 'applicable', extra: 0 } }, 'gpu-resource-extra');
  everyGateRejects({ ...canvas(), resourceMetrics: { ...canvas().resourceMetrics, extra: 0 } }, 'canvas-resource-extra');
  everyGateRejects({ ...gpu('webgl2'), backend: 'unknown' }, 'unknown-backend');
  everyGateRejects({ ...canvas(), backend: undefined }, 'missing-backend');

  assert.deepEqual(validateRendererResourceMetrics(canvas()), {
    applicability: 'not-applicable',
    reason: 'canvas2d-cpu-compositor',
    kind: 'canvas-backing-store',
    value: 2,
    backingStoreResizes: 2,
  });
  for (const backend of ['webgl2', 'webgpu']) {
    assert.deepEqual(validateRendererResourceMetrics(gpu(backend)), {
      applicability: 'applicable',
      kind: 'gpu-textures',
      value: 2,
      ...GPU_FIELDS,
    });
  }
});
test('all consumers use the same normalized backend-specific values', () => {
  assert.deepEqual(readRendererCounters(canvas(), 'canvas').resources, validateRendererResourceMetrics(canvas()));
  for (const backend of ['webgl2', 'webgpu']) {
    const normalized = validateRendererResourceMetrics(gpu(backend));
    const game = readRendererCounters(gpu(backend), backend);
    assert.strictEqual(game.resources.value, normalized.value);
    assert.equal(game.sceneUploadSkips, 0);
    assert.equal(summarizeBenchmarkResources(gpu(backend)).sceneUploadSkips, 0);
  }
});
