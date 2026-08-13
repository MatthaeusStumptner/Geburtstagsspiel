import assert from 'node:assert/strict';
import test from 'node:test';
import { createPresentationFrame } from '@franz-lola/pixel-renderer';
import { captureStudioPresentation, studioRenderDiagnostics } from '../src/render/studio-render-diagnostics.js';

function frame(frameId = 1) {
  return createPresentationFrame({
    frameId,
    presentationTime: 2,
    camera: { source: { x: 0, y: 0, width: 100, height: 80 }, viewport: { x: 0, y: 0, width: 400, height: 300 } },
    player: { id: 'player', world: { x: 20, y: 30 }, screen: { x: 80, y: 90 } },
    cats: [],
    characters: [],
    display: { width: 400, height: 300, actualPixelRatio: 1, pixelRatio: 1, bufferWidth: 400, bufferHeight: 300 },
    renderer: { requestedBackend: 'canvas2d', backend: 'canvas2d', fallbackReason: null, contextLost: false },
  });
}

test('studio diagnostics retain immutable frames and return detached serializable copies', () => {
  const internal = frame(7);
  captureStudioPresentation('studio-level-canvas', internal, { renderCount: 3, profile: 'editor' });
  const first = studioRenderDiagnostics();
  const second = studioRenderDiagnostics();

  assert.equal(first.surfaces['studio-level-canvas'].frame.frameId, 7);
  assert.equal(first.surfaces['studio-level-canvas'].renderCount, 3);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.surfaces['studio-level-canvas'].frame, internal);
  first.surfaces['studio-level-canvas'].frame.camera.source.x = 99;
  assert.equal(studioRenderDiagnostics().surfaces['studio-level-canvas'].frame.camera.source.x, 0);
  assert.doesNotThrow(() => JSON.stringify(first));
  assert.throws(() => captureStudioPresentation('broken', { frameId: Number.NaN }, {}), /valid PresentationFrame/i);
});
