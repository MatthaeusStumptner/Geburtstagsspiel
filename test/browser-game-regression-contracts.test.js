import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertActionableBoundingBox,
  assertDprContract,
  assertFinalHealth,
  assertHighRefreshResult,
  assertRectNear,
  assertReducedPostProcess,
  assertVideoEvidence,
  readRendererCounters,
  settleCleanup,
} from '../scripts/browser-regression-contracts.mjs';

function healthyRenderer() {
  return {
    requestedBackend: 'webgl2', backend: 'webgl2', contextLost: false, fallbackReason: null,
    frameCount: 12, uploadedBytes: 20, sceneUploadedBytes: 10, overlayUploadedBytes: 4,
    worldOverlayUploadedBytes: 6, staticWorldRevision: 2,
    scheduler: { renderCount: 12 },
  };
}

test('renderer counters fail closed when required diagnostics are missing or non-finite', () => {
  assert.throws(() => readRendererCounters({}, 'missing'), /frameCount/);
  assert.throws(() => readRendererCounters({ ...healthyRenderer(), uploadedBytes: Number.NaN }, 'nan'), /uploadedBytes/);
  assert.deepEqual(readRendererCounters(healthyRenderer(), 'healthy'), {
    rendererFrames: 12, schedulerFrames: 12, uploadedBytes: 20, sceneUploadedBytes: 10,
    overlayUploadedBytes: 4, worldOverlayUploadedBytes: 6, staticWorldRevision: 2,
  });
  const canvas = { ...healthyRenderer(), backend: 'canvas2d' };
  delete canvas.uploadedBytes; delete canvas.sceneUploadedBytes; delete canvas.overlayUploadedBytes; delete canvas.worldOverlayUploadedBytes;
  assert.deepEqual(readRendererCounters(canvas, 'canvas'), {
    rendererFrames: 12, schedulerFrames: 12, uploadedBytes: 0, sceneUploadedBytes: 0,
    overlayUploadedBytes: 0, worldOverlayUploadedBytes: 0, staticWorldRevision: 2,
  });
});

test('final health fails on crashes, evaluation gaps, and dirty browser diagnostics', () => {
  const clean = {
    renderer: healthyRenderer(),
    diagnostics: { contextLosses: [], unhandledRejections: [], windowErrors: [] },
  };
  assert.doesNotThrow(() => assertFinalHealth({ scenario: 'clean', expectedBackend: 'webgl2', health: clean, consoleErrors: [], warnings: [], pageErrors: [], crashes: [] }));
  assert.throws(() => assertFinalHealth({ scenario: 'missing', expectedBackend: 'webgl2', health: null, consoleErrors: [], warnings: [], pageErrors: [], crashes: [] }), /health snapshot/);
  assert.throws(() => assertFinalHealth({ scenario: 'crash', expectedBackend: 'webgl2', health: clean, consoleErrors: [], warnings: [], pageErrors: [], crashes: ['page crashed'] }), /page crashes/);
  assert.throws(() => assertFinalHealth({ scenario: 'dirty', expectedBackend: 'webgl2', health: { ...clean, diagnostics: { ...clean.diagnostics, contextLosses: [{ type: 'lost' }] } }, consoleErrors: [], warnings: [], pageErrors: [], crashes: [] }), /context losses/);
});

test('video evidence requires the Playwright video, readable path, bytes, and actual WebM duration', () => {
  assert.throws(() => assertVideoEvidence({ video: null, path: null, bytes: 0, durationSeconds: 0 }, 'missing'), /video object/);
  assert.throws(() => assertVideoEvidence({ video: {}, path: 'test.webm', bytes: 40_000, durationSeconds: 2.99 }, 'short'), /three seconds/);
  assert.doesNotThrow(() => assertVideoEvidence({ video: {}, path: 'test.webm', bytes: 40_000, durationSeconds: 3.01 }, 'valid'));
});

test('high-refresh and reduced-motion diagnostics are required and finite', () => {
  assert.throws(() => assertHighRefreshResult({ presentationDelta: 0, positionError: 0, tolerance: 0.1 }, 'zero'), /positive/);
  assert.throws(() => assertHighRefreshResult({ presentationDelta: 122, positionError: 0, tolerance: 0.1 }, 'fast'), /121/);
  assert.doesNotThrow(() => assertHighRefreshResult({ presentationDelta: 120, positionError: 0, tolerance: 0.1 }, 'valid'));
  assert.throws(() => assertReducedPostProcess(null, 'missing'), /postProcess/);
  assert.throws(() => assertReducedPostProcess({ scanlines: Number.NaN, rgbSplitTexels: 0 }, 'nan'), /scanlines/);
  assert.doesNotThrow(() => assertReducedPostProcess({ scanlines: 0, rgbSplitTexels: 0 }, 'valid'));
});

test('map markers must be actionable and inside the viewport', () => {
  assert.throws(() => assertActionableBoundingBox({ visible: true, enabled: true, box: null, viewport: { width: 390, height: 844 } }, 'missing'), /bounding box/);
  assert.throws(() => assertActionableBoundingBox({ visible: true, enabled: true, box: { x: -1, y: 0, width: 20, height: 20 }, viewport: { width: 390, height: 844 } }, 'outside'), /viewport/);
  assert.doesNotThrow(() => assertActionableBoundingBox({ visible: true, enabled: true, box: { x: 10, y: 20, width: 20, height: 20 }, viewport: { width: 390, height: 844 } }, 'valid'));
});

test('DPR contract distinguishes browser actual DPR from quality-capped effective DPR', () => {
  const renderer = { quality: 'quality', pixelRatio: 2, display: { width: 412, height: 727, actualPixelRatio: 2.625, pixelRatio: 2, bufferWidth: 824, bufferHeight: 1454 } };
  assert.doesNotThrow(() => assertDprContract({ browserDpr: 2.625, expectedDpr: 2.625, renderer, cssWidth: 412, cssHeight: 727, bufferWidth: 824, bufferHeight: 1454 }, 'valid'));
  assert.throws(() => assertDprContract({ browserDpr: 2, expectedDpr: 2.625, renderer, cssWidth: 412, cssHeight: 727, bufferWidth: 824, bufferHeight: 1454 }, 'browser'), /browser DPR/);
  assert.throws(() => assertDprContract({ browserDpr: 2.625, expectedDpr: 2.625, renderer: { ...renderer, display: { ...renderer.display, actualPixelRatio: 1 } }, cssWidth: 412, cssHeight: 727, bufferWidth: 824, bufferHeight: 1454 }, 'actual'), /actual DPR/);
  const wrongBuffer = { ...renderer, pixelRatio: 1, display: { ...renderer.display, pixelRatio: 1, bufferWidth: 1082, bufferHeight: 1908 } };
  assert.throws(() => assertDprContract({ browserDpr: 2.625, expectedDpr: 2.625, renderer: wrongBuffer, cssWidth: 412, cssHeight: 727, bufferWidth: 1082, bufferHeight: 1908 }, 'effective'), /effective DPR/);
  assert.throws(() => assertDprContract({ browserDpr: 2.625, expectedDpr: 2.625, renderer: { ...renderer, display: { ...renderer.display, width: 411 } }, cssWidth: 412, cssHeight: 727, bufferWidth: 824, bufferHeight: 1454 }, 'css'), /display width/);
});

test('integration feeds captured DOM CSS size into DPR validation', async () => {
  const source = await readFile(new URL('../scripts/browser-game-regression.mjs', import.meta.url), 'utf8');
  const dprCall = source.match(/function assertGeometryDpr[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(dprCall, /cssWidth:\s*value\.cssSize\?\.width/);
  assert.match(dprCall, /cssHeight:\s*value\.cssSize\?\.height/);
});

test('successful fullscreen entry validates mobile geometry and paused overlay', async () => {
  const source = await readFile(new URL('../scripts/browser-game-regression.mjs', import.meta.url), 'utf8');
  const fullscreen = source.match(/async function exerciseFullscreen[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(fullscreen, /assertMobileGeometry\(entered, scenario\)/);
  assert.match(fullscreen, /assertRectNear\(fullscreenPaused\.overlay, fullscreenPaused\.boardFrame/);
});

test('cleanup attempts every closer even when one rejects', async () => {
  const attempted = [];
  const errors = await settleCleanup([
    { name: 'browser', close: async () => { attempted.push('browser'); throw new Error('browser close failed'); } },
    { name: 'http', close: async () => { attempted.push('http'); } },
    { name: 'vite', close: async () => { attempted.push('vite'); } },
  ]);
  assert.deepEqual(attempted.sort(), ['browser', 'http', 'vite']);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /browser close failed/);
});

test('pause overlay must match every board-frame edge', () => {
  const frame = { left: 2, top: 10, right: 390, bottom: 840, width: 388, height: 830 };
  assert.doesNotThrow(() => assertRectNear({ ...frame, left: 2.5 }, frame, 1, 'mobile', 'pause overlay'));
  assert.throws(() => assertRectNear({ ...frame, bottom: 830, height: 820 }, frame, 1, 'mobile', 'pause overlay'), /bottom/);
});
