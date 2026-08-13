import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertActionableBoundingBox,
  assertDprContract,
  assertFinalHealth,
  assertHighRefreshResult,
  highRefreshCaptureTimeout,
  assertRadarPresentationContract,
  assertRectNear,
  assertReducedPostProcess,
  assertReducedRadarMotion,
  assertVideoEvidence,
  assertBrowserCoverage,
  assertFiveSecondBudgets,
  assertRequiredArtifacts,
  assertWebGpuDisposition,
  readRendererCounters,
  settleCleanup,
} from '../scripts/browser-regression-contracts.mjs';

function healthyRenderer() {
  return {
    requestedBackend: 'webgl2', backend: 'webgl2', contextLost: false, fallbackReason: null,
    resourceMetrics: { applicability: 'applicable' },
    frameCount: 12, uploadedBytes: 20, sceneUploadedBytes: 10, overlayUploadedBytes: 4,
    worldOverlayUploadedBytes: 6, textureReallocations: 0, gpuCropResizes: 0, staticWorldRevision: 2,
    scheduler: { renderCount: 12 },
  };
}

test('renderer counters fail closed when required diagnostics are missing or non-finite', () => {
  assert.throws(() => readRendererCounters({}, 'missing'), /frameCount/);
  assert.throws(() => readRendererCounters({ ...healthyRenderer(), uploadedBytes: Number.NaN }, 'nan'), /uploadedBytes/);
  assert.deepEqual(readRendererCounters(healthyRenderer(), 'healthy'), {
    rendererFrames: 12, schedulerFrames: 12, uploadedBytes: 20, sceneUploadedBytes: 10,
    overlayUploadedBytes: 4, worldOverlayUploadedBytes: 6, gpuCropResizes: 0, staticWorldRevision: 2,
    resources: { applicability: 'applicable', kind: 'gpu-textures', value: 0 },
  });
  const canvas = { ...healthyRenderer(), requestedBackend: 'canvas2d', backend: 'canvas2d', resourceMetrics: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor' }, backingStoreResizes: 2 };
  for (const key of ['uploadedBytes', 'sceneUploadedBytes', 'overlayUploadedBytes', 'worldOverlayUploadedBytes', 'textureReallocations', 'gpuCropResizes']) delete canvas[key];
  assert.equal(readRendererCounters(canvas, 'canvas').resources.value, 2);
});

test('five-second rendering budgets reject missing, non-finite, slow, or desynchronized counters', () => {
  const valid = {
    durationMs: 5_000,
    staticEditorPresentations: 1,
    hiddenThumbnailPresentations: 0,
    animatedThumbnailPresentations: 150,
    activePresentations: 300,
    pausedPresentations: 0,
    mapPresentations: 0,
    resourceStability: { applicability: 'applicable', kind: 'gpu-textures', delta: 0 },
    radarUpdates: 300,
  };
  assert.doesNotThrow(() => assertFiveSecondBudgets(valid, 'valid'));
  assert.throws(() => assertFiveSecondBudgets({ ...valid, activePresentations: undefined }, 'missing'), /activePresentations/);
  assert.throws(() => assertFiveSecondBudgets({ ...valid, animatedThumbnailPresentations: 144 }, 'slow-thumbnail'), /145/);
  assert.throws(() => assertFiveSecondBudgets({ ...valid, activePresentations: 302, radarUpdates: 302 }, 'fast-active'), /301/);
  assert.throws(() => assertFiveSecondBudgets({ ...valid, radarUpdates: 299 }, 'radar-drift'), /radar/);
});

test('completion coverage requires every backend viewport refresh and reduced-motion scenario', () => {
  const coverage = [];
  for (const backend of ['webgl2', 'canvas2d']) {
    coverage.push(
      { backend, width: 390, height: 844, deviceScaleFactor: 3, refreshRate: 60, reducedMotion: false },
      { backend, width: 412, height: 915, deviceScaleFactor: 2.625, refreshRate: 60, reducedMotion: false },
      { backend, width: 915, height: 412, deviceScaleFactor: 2.625, refreshRate: 60, reducedMotion: false },
      { backend, width: 1366, height: 768, deviceScaleFactor: 1, refreshRate: 60, reducedMotion: false },
      { backend, width: 1366, height: 768, deviceScaleFactor: 1, refreshRate: 120, reducedMotion: false },
      { backend, width: 1366, height: 768, deviceScaleFactor: 1, refreshRate: 175, reducedMotion: false },
      { backend, width: 412, height: 915, deviceScaleFactor: 2.625, refreshRate: 60, reducedMotion: true },
    );
  }
  assert.doesNotThrow(() => assertBrowserCoverage(coverage));
  assert.throws(() => assertBrowserCoverage(coverage.slice(1)), /390x844/);
});

test('required artifact manifest fails closed and WebGPU skip records the real probe reason', () => {
  const artifact = { screenshot: { path: 'state.png', bytes: 9_000 }, video: { path: 'state.webm', bytes: 40_000, durationSeconds: 5.1 } };
  assert.doesNotThrow(() => assertRequiredArtifacts([artifact], 1));
  assert.throws(() => assertRequiredArtifacts([{ ...artifact, video: null }], 1), /video/);
  assert.doesNotThrow(() => assertWebGpuDisposition({ available: false, reason: 'requestAdapter() returned null' }, { status: 'skipped', reason: 'requestAdapter() returned null' }));
  assert.throws(() => assertWebGpuDisposition({ available: false, reason: 'requestAdapter() returned null' }, { status: 'skipped', reason: 'generic unavailable' }), /probe reason/);
  assert.doesNotThrow(() => assertWebGpuDisposition({ available: true, reason: null }, { status: 'passed', resolvedBackend: 'webgpu' }));
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
  assert.throws(() => assertVideoEvidence({ video: {}, path: 'test.webm', bytes: 40_000, durationSeconds: 4.99 }, 'short'), /five seconds/);
  assert.doesNotThrow(() => assertVideoEvidence({ video: {}, path: 'test.webm', bytes: 40_000, durationSeconds: 5.01 }, 'valid'));
});

test('high-refresh and reduced-motion diagnostics are required and finite', () => {
  const positions = [
    { x: 6.8, y: 1 }, { x: 12.6, y: 1 }, { x: 18.4, y: 1 }, { x: 23, y: 2.2 }, { x: 23, y: 8 },
  ];
  const trajectory = {
    baselinePlayer: { x: 1, y: 1 }, finalPlayer: positions.at(-1), expectedPlayer: positions.at(-1),
    trajectorySamples: positions.map((player, index) => ({ elapsedMs: (index + 1) * 1_000, player, expectedPlayer: player })),
  };
  assert.throws(() => assertHighRefreshResult({ presentationDelta: 0, positionError: 0, tolerance: 0.1, ...trajectory }, 'zero'), /positive/);
  assert.throws(() => assertHighRefreshResult({ presentationDelta: 302, positionError: 0, tolerance: 0.1, ...trajectory }, 'fast'), /301/);
  assert.doesNotThrow(() => assertHighRefreshResult({ presentationDelta: 300, positionError: 0, tolerance: 0.1, ...trajectory }, 'valid'));
  assert.throws(() => assertReducedPostProcess(null, 'missing'), /postProcess/);
  assert.throws(() => assertReducedPostProcess({ scanlines: Number.NaN, rgbSplitTexels: 0 }, 'nan'), /scanlines/);
  assert.doesNotThrow(() => assertReducedPostProcess({ scanlines: 0, rgbSplitTexels: 0 }, 'valid'));
});

test('high-refresh capture waits for the real-browser frame supply at every required refresh rate', async () => {
  assert.equal(highRefreshCaptureTimeout(60), 10_000);
  assert.equal(highRefreshCaptureTimeout(120), 15_000);
  assert.equal(highRefreshCaptureTimeout(175), 19_584);
  assert.throws(() => highRefreshCaptureTimeout(Number.NaN), /refresh rate/);
  const source = await readFile(new URL('../scripts/browser-game-regression.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function highRefreshWindow');
  const diagnostic = source.slice(start, source.indexOf('async function reducedRadarMotion', start));
  assert.ok(diagnostic.includes('__GASSI_DEBUG_SET_PLAYER__'));
  assert.ok(diagnostic.includes('HIGH_REFRESH_START'));
  assert.ok(diagnostic.includes('HIGH_REFRESH_TURN_X'));
  assert.ok(diagnostic.includes('trajectorySamples'));
  assert.ok(diagnostic.includes('highRefreshCaptureTimeout(scenario.refreshRate)'));
});
test('reduced motion removes radar pulsing without suppressing direct position updates', () => {
  assert.doesNotThrow(() => assertReducedRadarMotion({
    animationName: 'none',
    beforeTransform: 'translate3d(372px, 120px, 0)',
    afterTransform: 'translate3d(28px, 180px, 0)',
    modelDanger: true,
    indicatorDanger: true,
  }, 'valid'));
  assert.throws(() => assertReducedRadarMotion({
    animationName: 'cat-radar-pulse',
    beforeTransform: 'translate3d(372px, 120px, 0)',
    afterTransform: 'translate3d(28px, 180px, 0)',
    modelDanger: true,
    indicatorDanger: true,
  }, 'animated'), /decorative animation/);
  assert.throws(() => assertReducedRadarMotion({
    animationName: 'none',
    beforeTransform: 'translate3d(372px, 120px, 0)',
    afterTransform: 'translate3d(372px, 120px, 0)',
    modelDanger: true,
    indicatorDanger: true,
  }, 'stale'), /position update/);
  assert.throws(() => assertReducedRadarMotion({
    animationName: 'none',
    beforeTransform: 'translate3d(372px, 120px, 0)',
    afterTransform: 'translate3d(28px, 180px, 0)',
    modelDanger: false,
    indicatorDanger: true,
  }, 'model-safe'), /model danger/);
  assert.throws(() => assertReducedRadarMotion({
    animationName: 'none',
    beforeTransform: 'translate3d(372px, 120px, 0)',
    afterTransform: 'translate3d(28px, 180px, 0)',
    modelDanger: true,
    indicatorDanger: false,
  }, 'view-safe'), /danger class/);
});

test('reduced-motion radar diagnostics are read-only and obtain danger from presented model state', async () => {
  const source = await readFile(new URL('../scripts/browser-game-regression.mjs', import.meta.url), 'utf8');
  const diagnostic = source.match(/async function reducedRadarMotion[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(diagnostic, /classList\.(?:add|remove|toggle|replace)\(|\.style\.(?:cssText|transform)\s*=|\.style\.setProperty|\.setAttribute\(|\.toggleAttribute\(|\.append\(|\.remove\(/);
  assert.match(diagnostic, /__GASSI_DEBUG_SET_CATS__/);
  assert.match(diagnostic, /danger/);
});

function radarSnapshot(updateCount = 122) {
  return {
    updateCount,
    frame: {
      frameId: 122,
      camera: { viewport: { x: 0, y: 40, width: 400, height: 300 } },
      player: { screen: { x: 200, y: 190 } },
      cats: [{ id: 'lola', screen: { x: 520, y: 140 }, onScreen: false, respawnTimer: 0 }],
    },
    state: {
      visible: true,
      indicators: [{ id: 'lola', hidden: false, x: 372, y: 163.125, angle: 81.119, distance: 12, danger: false, color: '#f25f5c' }],
    },
  };
}

function radarSample(overrides = {}) {
  return {
    radar: radarSnapshot(),
    viewport: { left: 10, top: 60, right: 410, bottom: 360 },
    bubbles: [{ id: 'lola', left: 365, top: 206, right: 399, bottom: 240, angle: 81.119 }],
    ...overrides,
  };
}

test('radar presentation contract is finite, frame-synchronous, viewport-clamped, and angle-true', () => {
  assert.doesNotThrow(() => assertRadarPresentationContract({
    presentationDelta: 120,
    baselineRadar: radarSnapshot(2),
    measuredRadar: radarSnapshot(122),
    samples: [radarSample()],
  }, 'valid'));
  assert.throws(() => assertRadarPresentationContract({
    presentationDelta: 120,
    baselineRadar: radarSnapshot(2),
    measuredRadar: radarSnapshot(121),
    samples: [radarSample()],
  }, 'delta'), /radar update delta/);
  assert.throws(() => assertRadarPresentationContract({
    presentationDelta: 120,
    baselineRadar: radarSnapshot(2),
    measuredRadar: { ...radarSnapshot(122), updateCount: Number.NaN },
    samples: [radarSample()],
  }, 'finite'), /finite/);
  assert.throws(() => assertRadarPresentationContract({
    presentationDelta: 120,
    baselineRadar: radarSnapshot(2),
    measuredRadar: radarSnapshot(122),
    samples: [radarSample({ bubbles: [{ id: 'lola', left: 365, top: 206, right: 425, bottom: 240, angle: 81.119 }] })],
  }, 'outside'), /gameplay viewport/);
  assert.throws(() => assertRadarPresentationContract({
    presentationDelta: 120,
    baselineRadar: radarSnapshot(2),
    measuredRadar: radarSnapshot(122),
    samples: [radarSample({ bubbles: [{ id: 'lola', left: 365, top: 206, right: 399, bottom: 240, angle: 82 }] })],
  }, 'angle'), /0.5 degrees/);
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
  const underCap = { ...renderer, pixelRatio: 1, display: { ...renderer.display, pixelRatio: 1, bufferWidth: 412, bufferHeight: 727 } };
  assert.throws(() => assertDprContract({ browserDpr: 2.625, expectedDpr: 2.625, renderer: underCap, cssWidth: 412, cssHeight: 727, bufferWidth: 412, bufferHeight: 727 }, 'under-cap'), /effective DPR must equal/);
  assert.throws(() => assertDprContract({ browserDpr: 2.625, expectedDpr: 2.625, renderer: { ...renderer, display: { ...renderer.display, width: 411 } }, cssWidth: 412, cssHeight: 727, bufferWidth: 824, bufferHeight: 1454 }, 'css'), /display width/);
});

test('DPR contract accepts the exact effective ratio for every renderer quality cap', () => {
  for (const [quality, effective, width, height] of [
    ['performance', 1.25, 515, 909],
    ['balanced', 1.6, 659, 1163],
    ['quality', 2, 824, 1454],
  ]) {
    const renderer = { quality, pixelRatio: effective, display: { width: 412, height: 727, actualPixelRatio: 2.625, pixelRatio: effective, bufferWidth: width, bufferHeight: height } };
    assert.doesNotThrow(() => assertDprContract({ browserDpr: 2.625, expectedDpr: 2.625, renderer, cssWidth: 412, cssHeight: 727, bufferWidth: width, bufferHeight: height }, quality));
  }
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

test('visual health rejects blank and gray canvases without weakening screenshot evidence', async () => {
  const { assertVisualHealth } = await import('../scripts/browser-regression-contracts.mjs');
  assert.doesNotThrow(() => assertVisualHealth({ opaquePixels: 1024, uniqueColors: 32, chromaPixels: 280, luminanceRange: 170 }, 'healthy'));
  assert.throws(() => assertVisualHealth({ opaquePixels: 0, uniqueColors: 1, chromaPixels: 0, luminanceRange: 0 }, 'blank'), /opaque/);
  assert.throws(() => assertVisualHealth({ opaquePixels: 1024, uniqueColors: 3, chromaPixels: 0, luminanceRange: 12 }, 'gray'), /gray|chroma/);
  assert.throws(() => assertVisualHealth({ opaquePixels: 1024, uniqueColors: Number.NaN, chromaPixels: 280, luminanceRange: 170 }, 'nan'), /finite/);
});

test('pause overlay must match every board-frame edge', () => {
  const frame = { left: 2, top: 10, right: 390, bottom: 840, width: 388, height: 830 };
  assert.doesNotThrow(() => assertRectNear({ ...frame, left: 2.5 }, frame, 1, 'mobile', 'pause overlay'));
  assert.throws(() => assertRectNear({ ...frame, bottom: 830, height: 820 }, frame, 1, 'mobile', 'pause overlay'), /bottom/);
});
