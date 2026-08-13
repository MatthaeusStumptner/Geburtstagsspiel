import assert from 'node:assert/strict';
import test from 'node:test';
import { readRendererCounters } from '../../../apps/game/scripts/browser-regression-contracts.mjs';
import { summarizeBenchmarkResources } from '../benchmark/resource-summary.js';
import { PassauPixelRenderer } from '../src/index.js';

function fakeCanvas() {
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  const document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
  return { width: 0, height: 0, getContext: () => context, ownerDocument: document };
}

function backend(kind) {
  return {
    kind,
    snapshot: () => kind === 'canvas2d' ? {
      requestedBackend: 'canvas2d', backend: 'canvas2d', fallbackReason: null,
      frameCount: 0, gpuAccelerated: false, contextLost: false,
      resourceMetrics: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor' },
      backingStoreResizes: 0,
    } : {
      requestedBackend: kind, backend: kind, fallbackReason: null,
      frameCount: 0, gpuAccelerated: true, contextLost: false,
      resourceMetrics: { applicability: 'applicable' },
      uploadedBytes: 0, sceneUploadedBytes: 0, overlayUploadedBytes: 0, worldOverlayUploadedBytes: 0,
      textureReallocations: 0, overlayUploadSkips: 0, worldOverlayUploadSkips: 0,
    },
  };
}

test('real rendererInfo omits GPU crop counters for Canvas and requires them for GPU backends', () => {
  const canvasInfo = new PassauPixelRenderer(fakeCanvas(), { presentationBackend: backend('canvas2d') }).rendererInfo();
  assert.equal(canvasInfo.resourceMetrics.applicability, 'not-applicable');
  assert.equal(Object.hasOwn(canvasInfo, 'gpuCropResizes'), false);

  const gpuInfo = new PassauPixelRenderer(fakeCanvas(), { presentationBackend: backend('webgl2') }).rendererInfo();
  assert.equal(gpuInfo.resourceMetrics.applicability, 'applicable');
  assert.equal(gpuInfo.gpuCropResizes, 0);
});

test('Canvas benchmark and Game gates fail closed on fake GPU crop counters', () => {
  const canvasInfo = {
    backend: 'canvas2d', frameCount: 1, staticWorldRevision: 1,
    scheduler: { renderCount: 1 },
    resourceMetrics: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor' },
    backingStoreResizes: 0,
    gpuCropResizes: 0,
  };
  assert.throws(() => summarizeBenchmarkResources(canvasInfo), /Canvas2D|gpuCropResizes|GPU metric/i);
  assert.throws(() => readRendererCounters(canvasInfo, 'canvas-review'), /gpuCropResizes|fake GPU metric/i);
});
