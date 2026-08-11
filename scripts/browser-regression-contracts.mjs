import assert from 'node:assert/strict';

function requiredFinite(value, label, scenario) {
  assert.ok(Number.isFinite(value), `[${scenario}] ${label} must be a finite number`);
  return value;
}

function requiredArray(value, label, scenario) {
  assert.ok(Array.isArray(value), `[${scenario}] ${label} diagnostics must be an array`);
  return value;
}

export function readRendererCounters(debug, scenario) {
  assert.ok(debug && typeof debug === 'object', `[${scenario}] renderer diagnostics are missing`);
  const rendererFrames = requiredFinite(debug.frameCount, 'frameCount', scenario);
  assert.ok(debug.scheduler && typeof debug.scheduler === 'object', `[${scenario}] scheduler diagnostics are missing`);
  const uploadCounter = (name) => debug.backend === 'canvas2d' && debug[name] === undefined
    ? 0
    : requiredFinite(debug[name], name, scenario);
  return {
    rendererFrames,
    schedulerFrames: requiredFinite(debug.scheduler.renderCount, 'scheduler.renderCount', scenario),
    uploadedBytes: uploadCounter('uploadedBytes'),
    sceneUploadedBytes: uploadCounter('sceneUploadedBytes'),
    overlayUploadedBytes: uploadCounter('overlayUploadedBytes'),
    worldOverlayUploadedBytes: uploadCounter('worldOverlayUploadedBytes'),
    staticWorldRevision: requiredFinite(debug.staticWorldRevision, 'staticWorldRevision', scenario),
  };
}

export function assertFinalHealth({ scenario, expectedBackend, health, consoleErrors, warnings, pageErrors, crashes }) {
  assert.ok(health && typeof health === 'object', `[${scenario}] final health snapshot is missing`);
  const renderer = health.renderer;
  assert.ok(renderer && typeof renderer === 'object', `[${scenario}] final renderer health is missing`);
  assert.equal(renderer.requestedBackend, expectedBackend, `[${scenario}] final requested backend changed`);
  assert.equal(renderer.backend, expectedBackend, `[${scenario}] final resolved backend changed`);
  assert.equal(renderer.contextLost, false, `[${scenario}] renderer reports context loss`);
  assert.equal(renderer.fallbackReason, null, `[${scenario}] renderer reports an unexpected fallback`);
  readRendererCounters(renderer, `${scenario}:final-health`);

  const diagnostics = health.diagnostics;
  assert.ok(diagnostics && typeof diagnostics === 'object', `[${scenario}] browser diagnostics are missing`);
  assert.deepEqual(requiredArray(diagnostics.contextLosses, 'context losses', scenario), [], `[${scenario}] context losses were recorded`);
  assert.deepEqual(requiredArray(diagnostics.unhandledRejections, 'unhandled rejections', scenario), [], `[${scenario}] unhandled rejections were recorded`);
  assert.deepEqual(requiredArray(diagnostics.windowErrors, 'window errors', scenario), [], `[${scenario}] window errors were recorded`);
  assert.deepEqual(requiredArray(consoleErrors, 'console errors', scenario), [], `[${scenario}] console errors were recorded`);
  assert.deepEqual(requiredArray(warnings, 'app warnings', scenario), [], `[${scenario}] app warnings were recorded`);
  assert.deepEqual(requiredArray(pageErrors, 'page errors', scenario), [], `[${scenario}] page errors were recorded`);
  assert.deepEqual(requiredArray(crashes, 'page crashes', scenario), [], `[${scenario}] page crashes were recorded`);
  return renderer;
}

export function assertVideoEvidence({ video, path, bytes, durationSeconds }, scenario) {
  assert.ok(video && typeof video === 'object', `[${scenario}] Playwright video object is missing`);
  assert.ok(typeof path === 'string' && path.length > 0, `[${scenario}] WebM path is missing`);
  assert.ok(Number.isFinite(bytes) && bytes > 20_000, `[${scenario}] WebM artifact is missing, unreadable, or too small`);
  assert.ok(Number.isFinite(durationSeconds) && durationSeconds >= 3, `[${scenario}] WebM must contain at least three seconds of media`);
}

export function assertHighRefreshResult({ presentationDelta, positionError, tolerance }, scenario) {
  assert.ok(Number.isFinite(presentationDelta) && presentationDelta > 0, `[${scenario}] presentation delta must be a positive finite number`);
  assert.ok(presentationDelta <= 121, `[${scenario}] presentation delta exceeds 121`);
  assert.ok(Number.isFinite(positionError), `[${scenario}] position error must be finite`);
  assert.ok(Number.isFinite(tolerance) && tolerance >= 0, `[${scenario}] position tolerance must be finite`);
  assert.ok(positionError <= tolerance, `[${scenario}] player drift exceeds one fixed step`);
}

export function assertReducedPostProcess(postProcess, scenario) {
  assert.ok(postProcess && typeof postProcess === 'object', `[${scenario}] reduced-motion postProcess diagnostics are missing`);
  const scanlines = requiredFinite(postProcess.scanlines, 'postProcess.scanlines', scenario);
  const rgbSplitTexels = requiredFinite(postProcess.rgbSplitTexels, 'postProcess.rgbSplitTexels', scenario);
  assert.equal(scanlines, 0, `[${scenario}] reduced motion left scanlines enabled`);
  assert.equal(rgbSplitTexels, 0, `[${scenario}] reduced motion left RGB split enabled`);
}

export function assertActionableBoundingBox({ visible, enabled, box, viewport }, scenario) {
  assert.equal(visible, true, `[${scenario}] map marker is not visible`);
  assert.equal(enabled, true, `[${scenario}] map marker is not enabled`);
  assert.ok(box && typeof box === 'object', `[${scenario}] map marker bounding box is missing`);
  for (const key of ['x', 'y', 'width', 'height']) requiredFinite(box[key], `marker.${key}`, scenario);
  assert.ok(box.width > 0 && box.height > 0, `[${scenario}] map marker bounding box is empty`);
  assert.ok(viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height), `[${scenario}] viewport diagnostics are missing`);
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `[${scenario}] map marker leaves the viewport`);
}

export function assertDprContract({ browserDpr, expectedDpr, renderer, cssWidth, cssHeight, bufferWidth, bufferHeight }, scenario) {
  assert.equal(browserDpr, expectedDpr, `[${scenario}] browser DPR differs from the scenario`);
  assert.ok(renderer && renderer.display, `[${scenario}] renderer display diagnostics are missing`);
  const cap = { performance: 1.25, balanced: 1.6, quality: 2 }[renderer.quality];
  assert.ok(Number.isFinite(cap), `[${scenario}] renderer quality has no DPR cap`);
  const rendererRatio = requiredFinite(renderer.pixelRatio, 'renderer.pixelRatio', scenario);
  const actualRatio = requiredFinite(renderer.display.actualPixelRatio, 'display.actualPixelRatio', scenario);
  const effectiveRatio = requiredFinite(renderer.display.pixelRatio, 'display.pixelRatio', scenario);
  assert.ok(Math.abs(actualRatio - browserDpr) <= 0.01, `[${scenario}] renderer actual DPR differs from browser DPR`);
  assert.equal(rendererRatio, effectiveRatio, `[${scenario}] renderer effective DPR fields disagree`);
  const expectedEffectiveRatio = Math.min(actualRatio, cap);
  assert.ok(Math.abs(effectiveRatio - expectedEffectiveRatio) <= 0.001,
    `[${scenario}] renderer effective DPR must equal min(actual DPR, ${renderer.quality} cap)`);
  for (const [name, value] of [['cssWidth', cssWidth], ['cssHeight', cssHeight], ['bufferWidth', bufferWidth], ['bufferHeight', bufferHeight]]) requiredFinite(value, name, scenario);
  const displayWidth = requiredFinite(renderer.display.width, 'display.width', scenario);
  const displayHeight = requiredFinite(renderer.display.height, 'display.height', scenario);
  assert.equal(displayWidth, cssWidth, `[${scenario}] renderer display width differs from CSS width`);
  assert.equal(displayHeight, cssHeight, `[${scenario}] renderer display height differs from CSS height`);
  assert.equal(bufferWidth, Math.max(1, Math.round(cssWidth * effectiveRatio)), `[${scenario}] backbuffer width does not match CSS width × effective DPR`);
  assert.equal(bufferHeight, Math.max(1, Math.round(cssHeight * effectiveRatio)), `[${scenario}] backbuffer height does not match CSS height × effective DPR`);
  assert.equal(renderer.display.bufferWidth, bufferWidth, `[${scenario}] renderer/canvas buffer width mismatch`);
  assert.equal(renderer.display.bufferHeight, bufferHeight, `[${scenario}] renderer/canvas buffer height mismatch`);
}

export function assertRectNear(actual, expected, tolerance, scenario, label) {
  assert.ok(actual && expected, `[${scenario}] ${label} geometry is missing`);
  for (const edge of ['left', 'top', 'right', 'bottom', 'width', 'height']) {
    requiredFinite(actual[edge], `${label}.${edge}`, scenario);
    requiredFinite(expected[edge], `boardFrame.${edge}`, scenario);
    assert.ok(Math.abs(actual[edge] - expected[edge]) <= tolerance,
      `[${scenario}] ${label} ${edge} differs from board frame (${actual[edge]} vs ${expected[edge]})`);
  }
}
export async function settleCleanup(entries) {
  const results = await Promise.allSettled(entries.map(({ close }) => Promise.resolve().then(close)));
  return results.flatMap((result, index) => result.status === 'rejected'
    ? [new Error(`${entries[index].name} cleanup failed: ${result.reason?.message ?? result.reason}`, { cause: result.reason })]
    : []);
}
