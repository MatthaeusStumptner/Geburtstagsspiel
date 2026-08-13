import assert from 'node:assert/strict';
import test from 'node:test';
import { Canvas2DPresentationBackend } from '../src/gpu/canvas2d-backend.js';

function canvasFixture() {
  const context = {
    setTransform() {}, clearRect() {}, drawImage() {},
  };
  return { width: 0, height: 0, getContext: (kind) => kind === '2d' ? context : null };
}

test('Canvas2D reports GPU resources as not applicable and tracks real backing-store resizes', () => {
  const backend = new Canvas2DPresentationBackend(canvasFixture());
  backend.resize(200, 100);
  backend.resize(200, 100);
  backend.resize(300, 100);
  const snapshot = backend.snapshot();
  assert.deepEqual(snapshot.resourceMetrics, {
    applicability: 'not-applicable',
    reason: 'canvas2d-cpu-compositor',
  });
  assert.equal(snapshot.backingStoreResizes, 2);
  for (const gpuMetric of [
    'uploadedBytes', 'sceneUploadedBytes', 'overlayUploadedBytes',
    'worldOverlayUploadedBytes', 'textureReallocations',
  ]) assert.equal(Object.hasOwn(snapshot, gpuMetric), false, `${gpuMetric} must not be masked as zero`);
});
