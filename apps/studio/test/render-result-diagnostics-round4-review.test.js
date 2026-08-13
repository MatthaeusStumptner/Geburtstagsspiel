import assert from 'node:assert/strict';
import test from 'node:test';
import { createPresentationFrame, isPresentationFrame } from '@franz-lola/pixel-renderer';
import { captureStudioPresentation, studioRenderDiagnostics } from '../src/render/studio-render-diagnostics.js';

function renderResult() {
  const frame = createPresentationFrame({
    frameId: 9,
    presentationTime: 2,
    camera: { source: { x: 0, y: 0, width: 100, height: 80 }, viewport: { x: 0, y: 0, width: 400, height: 300 } },
    player: { id: 'player', world: { x: 20, y: 30 }, screen: { x: 80, y: 90 } },
    cats: [],
    characters: [],
    display: { width: 400, height: 300, actualPixelRatio: 1, pixelRatio: 1, bufferWidth: 400, bufferHeight: 300 },
    renderer: { requestedBackend: 'canvas2d', backend: 'canvas2d', fallbackReason: null, contextLost: false },
  });
  return Object.freeze({
    ...frame,
    playerScreen: frame.player.screen,
    entities: frame.cats,
    characterEntities: frame.characters,
  });
}

test('Studio explicitly unwraps renderer results and retains only a strict diagnostic frame', () => {
  const result = renderResult();
  assert.equal(isPresentationFrame(result), false);
  captureStudioPresentation('round4-render-result', result, { renderCount: 4, profile: 'editor' });
  const captured = studioRenderDiagnostics().surfaces['round4-render-result'].frame;

  assert.deepEqual(Object.keys(captured), ['kind', 'frameId', 'presentationTime', 'camera', 'player', 'cats', 'characters', 'display', 'renderer']);
  assert.equal(Object.hasOwn(captured, 'entities'), false);
});
