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

  return {
    rendererFrames,
    schedulerFrames: requiredFinite(debug.scheduler.renderCount, 'scheduler.renderCount', scenario),
    uploadedBytes: requiredFinite(debug.uploadedBytes, 'uploadedBytes', scenario),
    sceneUploadedBytes: requiredFinite(debug.sceneUploadedBytes, 'sceneUploadedBytes', scenario),
    overlayUploadedBytes: requiredFinite(debug.overlayUploadedBytes, 'overlayUploadedBytes', scenario),
    worldOverlayUploadedBytes: requiredFinite(debug.worldOverlayUploadedBytes, 'worldOverlayUploadedBytes', scenario),
    textureReallocations: requiredFinite(debug.textureReallocations, 'textureReallocations', scenario),
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
  assert.ok(Number.isFinite(durationSeconds) && durationSeconds >= 5, `[${scenario}] WebM must contain at least five seconds of media`);
}

export function assertHighRefreshResult({ presentationDelta, positionError, tolerance }, scenario) {
  assert.ok(Number.isFinite(presentationDelta) && presentationDelta > 0, `[${scenario}] presentation delta must be a positive finite number`);
  assert.ok(presentationDelta <= 301, `[${scenario}] presentation delta exceeds 301`);
  assert.ok(Number.isFinite(positionError), `[${scenario}] position error must be finite`);
  assert.ok(Number.isFinite(tolerance) && tolerance >= 0, `[${scenario}] position tolerance must be finite`);
  assert.ok(positionError <= tolerance, `[${scenario}] player drift exceeds one fixed step`);
}

export function highRefreshCaptureTimeout(refreshRate) {
  assert.ok(Number.isFinite(refreshRate) && refreshRate > 0, 'refresh rate must be a positive finite number');
  return Math.ceil(5_000 * Math.max(1, refreshRate / 60) + 5_000);
}

function readRadarSnapshot(radar, scenario) {
  assert.ok(radar && typeof radar === 'object', `[${scenario}] radar diagnostics are missing`);
  const updateCount = requiredFinite(radar.updateCount, 'radar.updateCount', scenario);
  assert.ok(Number.isSafeInteger(updateCount) && updateCount >= 0, `[${scenario}] radar.updateCount must be a non-negative safe integer`);
  assert.ok(radar.frame && typeof radar.frame === 'object', `[${scenario}] radar frame diagnostics are missing`);
  assert.ok(Number.isSafeInteger(radar.frame.frameId) && radar.frame.frameId > 0, `[${scenario}] radar frameId must be positive`);
  const viewport = radar.frame.camera?.viewport;
  assert.ok(viewport && typeof viewport === 'object', `[${scenario}] radar viewport diagnostics are missing`);
  for (const key of ['x', 'y', 'width', 'height']) requiredFinite(viewport[key], `radar.viewport.${key}`, scenario);
  assert.ok(viewport.width > 0 && viewport.height > 0, `[${scenario}] radar viewport must be positive`);
  const playerScreen = radar.frame.player?.screen;
  assert.ok(playerScreen && typeof playerScreen === 'object', `[${scenario}] radar player screen diagnostics are missing`);
  for (const key of ['x', 'y']) requiredFinite(playerScreen[key], `radar.player.screen.${key}`, scenario);
  const cats = requiredArray(radar.frame.cats, 'radar frame cats', scenario);
  cats.forEach((cat, index) => {
    assert.ok(cat && typeof cat.id === 'string' && cat.id.length > 0, `[${scenario}] radar cat ${index} id is missing`);
    for (const key of ['x', 'y']) requiredFinite(cat.screen?.[key], `radar.cat.${cat.id}.screen.${key}`, scenario);
    assert.equal(typeof cat.onScreen, 'boolean', `[${scenario}] radar cat ${cat.id} onScreen is missing`);
    requiredFinite(cat.respawnTimer, `radar.cat.${cat.id}.respawnTimer`, scenario);
  });
  assert.ok(radar.state && typeof radar.state.visible === 'boolean', `[${scenario}] radar state diagnostics are missing`);
  const indicators = requiredArray(radar.state.indicators, 'radar indicators', scenario);
  indicators.forEach((indicator, index) => {
    assert.ok(indicator && typeof indicator.id === 'string' && indicator.id.length > 0, `[${scenario}] radar indicator ${index} id is missing`);
    for (const key of ['x', 'y', 'angle', 'distance']) requiredFinite(indicator[key], `radar.indicator.${indicator.id}.${key}`, scenario);
    assert.equal(typeof indicator.hidden, 'boolean', `[${scenario}] radar indicator ${indicator.id} hidden is missing`);
  });
  return radar;
}

function angleDifference(left, right) {
  return Math.abs(((left - right + 180) % 360 + 360) % 360 - 180);
}

export function assertRadarPresentationContract({ presentationDelta, baselineRadar, measuredRadar, samples }, scenario) {
  requiredFinite(presentationDelta, 'presentation delta', scenario);
  const baseline = readRadarSnapshot(baselineRadar, `${scenario}:baseline`);
  const measured = readRadarSnapshot(measuredRadar, `${scenario}:measured`);
  const radarDelta = measured.updateCount - baseline.updateCount;
  assert.equal(radarDelta, presentationDelta, `[${scenario}] radar update delta differs from presentation delta`);
  const sampled = requiredArray(samples, 'radar samples', scenario);
  assert.ok(sampled.length > 0, `[${scenario}] radar samples are empty`);
  let visibleBubbleCount = 0;

  sampled.forEach((sample, sampleIndex) => {
    const label = `${scenario}:radar-sample-${sampleIndex}`;
    const radar = readRadarSnapshot(sample?.radar, label);
    const viewport = sample?.viewport;
    assert.ok(viewport && typeof viewport === 'object', `[${label}] gameplay viewport geometry is missing`);
    for (const edge of ['left', 'top', 'right', 'bottom']) requiredFinite(viewport[edge], `gameplay viewport.${edge}`, label);
    assert.ok(viewport.right > viewport.left && viewport.bottom > viewport.top, `[${label}] gameplay viewport geometry is empty`);
    const bubbles = requiredArray(sample?.bubbles, 'radar bubbles', label);
    const visibleIndicators = radar.state.indicators.filter((indicator) => !indicator.hidden);
    assert.equal(bubbles.length, visibleIndicators.length, `[${label}] visible radar bubble count differs from state`);

    bubbles.forEach((bubble) => {
      visibleBubbleCount += 1;
      assert.ok(bubble && typeof bubble.id === 'string' && bubble.id.length > 0, `[${label}] radar bubble id is missing`);
      for (const edge of ['left', 'top', 'right', 'bottom']) requiredFinite(bubble[edge], `radar bubble ${bubble.id}.${edge}`, label);
      const actualAngle = requiredFinite(bubble.angle, `radar bubble ${bubble.id}.angle`, label);
      assert.ok(bubble.left >= viewport.left - 1 && bubble.top >= viewport.top - 1
        && bubble.right <= viewport.right + 1 && bubble.bottom <= viewport.bottom + 1,
      `[${label}] radar bubble ${bubble.id} leaves the gameplay viewport`);
      const cat = radar.frame.cats.find((candidate) => candidate.id === bubble.id);
      assert.ok(cat, `[${label}] radar bubble ${bubble.id} has no matching frame entity`);
      const expectedAngle = Math.atan2(
        cat.screen.y - radar.frame.player.screen.y,
        cat.screen.x - radar.frame.player.screen.x,
      ) * 180 / Math.PI + 90;
      assert.ok(angleDifference(actualAngle, expectedAngle) <= 0.5,
        `[${label}] radar bubble ${bubble.id} differs by more than 0.5 degrees from its frame entity`);
    });
  });

  assert.ok(visibleBubbleCount > 0, `[${scenario}] radar samples contain no visible bubbles`);
  return { radarDelta, visibleBubbleCount };
}

export function assertReducedPostProcess(postProcess, scenario) {
  assert.ok(postProcess && typeof postProcess === 'object', `[${scenario}] reduced-motion postProcess diagnostics are missing`);
  const scanlines = requiredFinite(postProcess.scanlines, 'postProcess.scanlines', scenario);
  const rgbSplitTexels = requiredFinite(postProcess.rgbSplitTexels, 'postProcess.rgbSplitTexels', scenario);
  assert.equal(scanlines, 0, `[${scenario}] reduced motion left scanlines enabled`);
  assert.equal(rgbSplitTexels, 0, `[${scenario}] reduced motion left RGB split enabled`);
}

export function assertReducedRadarMotion({ animationName, beforeTransform, afterTransform, modelDanger, indicatorDanger }, scenario) {
  assert.equal(modelDanger, true, '[' + scenario + '] reduced radar fixture did not originate from model danger state');
  assert.equal(indicatorDanger, true, '[' + scenario + '] radar view did not reflect the model danger class');
  assert.equal(animationName, 'none', `[${scenario}] reduced motion left decorative animation enabled`);
  assert.ok(typeof beforeTransform === 'string' && beforeTransform.length > 0, `[${scenario}] initial radar transform is missing`);
  assert.ok(typeof afterTransform === 'string' && afterTransform.length > 0, `[${scenario}] updated radar transform is missing`);
  assert.notEqual(afterTransform, beforeTransform, `[${scenario}] reduced motion suppressed the direct radar position update`);
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
export function assertFiveSecondBudgets(budgets, scenario) {
  assert.ok(budgets && typeof budgets === 'object', `[${scenario}] five-second budgets are missing`);
  const required = [
    'durationMs', 'staticEditorPresentations', 'hiddenThumbnailPresentations',
    'animatedThumbnailPresentations', 'activePresentations', 'pausedPresentations',
    'mapPresentations', 'textureReallocations', 'radarUpdates',
  ];
  const values = Object.fromEntries(required.map((name) => [name, requiredFinite(budgets[name], name, scenario)]));
  assert.ok(values.durationMs >= 5_000, `[${scenario}] budget window must cover five seconds`);
  assert.ok(values.staticEditorPresentations <= 1, `[${scenario}] static editor exceeded one presentation`);
  assert.equal(values.hiddenThumbnailPresentations, 0, `[${scenario}] hidden thumbnail presented`);
  assert.ok(values.animatedThumbnailPresentations >= 145 && values.animatedThumbnailPresentations <= 155,
    `[${scenario}] animated thumbnail must present 145-155 frames`);
  assert.ok(values.activePresentations <= 301, `[${scenario}] active game/playtest exceeded 301 presentations`);
  assert.equal(values.pausedPresentations, 0, `[${scenario}] paused scene presented after settle`);
  assert.equal(values.mapPresentations, 0, `[${scenario}] map presented after settle`);
  assert.equal(values.textureReallocations, 0, `[${scenario}] texture reallocations occurred during stable-size activity`);
  assert.equal(values.radarUpdates, values.activePresentations, `[${scenario}] radar updates differ from active presentations`);
  return values;
}

export function assertBrowserCoverage(results) {
  assert.ok(Array.isArray(results), 'browser coverage results must be an array');
  const expected = [];
  for (const backend of ['webgl2', 'canvas2d']) {
    expected.push(
      [backend, 390, 844, 3, 60, false],
      [backend, 412, 915, 2.625, 60, false],
      [backend, 915, 412, 2.625, 60, false],
      [backend, 1366, 768, 1, 60, false],
      [backend, 1366, 768, 1, 120, false],
      [backend, 1366, 768, 1, 175, false],
      [backend, 412, 915, 2.625, 60, true],
    );
  }
  for (const [backend, width, height, dpr, refreshRate, reducedMotion] of expected) {
    const found = results.some((result) => result?.backend === backend
      && result.width === width && result.height === height && result.deviceScaleFactor === dpr
      && result.refreshRate === refreshRate && result.reducedMotion === reducedMotion);
    assert.ok(found, `browser coverage is missing ${backend} ${width}x${height} DPR${dpr} ${refreshRate}Hz reduced=${reducedMotion}`);
  }
}

export function assertRequiredArtifacts(entries, expectedCount) {
  assert.ok(Array.isArray(entries), 'required artifacts must be an array');
  assert.equal(entries.length, expectedCount, 'required artifact scenario count differs');
  entries.forEach((entry, index) => {
    assert.ok(typeof entry?.screenshot?.path === 'string' && entry.screenshot.path.length > 0, `artifact ${index} screenshot path is missing`);
    assert.ok(Number.isFinite(entry.screenshot.bytes) && entry.screenshot.bytes > 8_000, `artifact ${index} screenshot is unreadable`);
    assert.ok(typeof entry?.video?.path === 'string' && entry.video.path.length > 0, `artifact ${index} video path is missing`);
    assert.ok(Number.isFinite(entry.video.bytes) && entry.video.bytes > 20_000, `artifact ${index} video is unreadable`);
    assert.ok(Number.isFinite(entry.video.durationSeconds) && entry.video.durationSeconds >= 5, `artifact ${index} video is shorter than five seconds`);
  });
}

export function assertVisualHealth(sample, scenario) {
  assert.ok(sample && typeof sample === 'object', `[${scenario}] visual health sample is missing`);
  const opaquePixels = requiredFinite(sample.opaquePixels, 'visual.opaquePixels', scenario);
  const uniqueColors = requiredFinite(sample.uniqueColors, 'visual.uniqueColors', scenario);
  const chromaPixels = requiredFinite(sample.chromaPixels, 'visual.chromaPixels', scenario);
  const luminanceRange = requiredFinite(sample.luminanceRange, 'visual.luminanceRange', scenario);
  assert.ok(opaquePixels >= 512, `[${scenario}] rendered canvas has insufficient opaque pixels`);
  assert.ok(uniqueColors >= 8, `[${scenario}] rendered canvas has insufficient color variation`);
  assert.ok(chromaPixels >= 32, `[${scenario}] rendered canvas is blank or gray (insufficient chroma)`);
  assert.ok(luminanceRange >= 32, `[${scenario}] rendered canvas has insufficient luminance range`);
  return { opaquePixels, uniqueColors, chromaPixels, luminanceRange };
}

export function assertWebGpuDisposition(probe, disposition) {
  assert.ok(probe && typeof probe.available === 'boolean', 'WebGPU availability probe is malformed');
  assert.ok(disposition && typeof disposition === 'object', 'WebGPU disposition is missing');
  if (probe.available) {
    assert.equal(disposition.status, 'passed', 'available WebGPU must pass');
    assert.equal(disposition.resolvedBackend, 'webgpu', 'available WebGPU must resolve natively');
    return;
  }
  assert.ok(typeof probe.reason === 'string' && probe.reason.trim().length > 0, 'unavailable WebGPU probe reason is missing');
  assert.equal(disposition.status, 'skipped', 'unavailable WebGPU must be a structured skip');
  assert.equal(disposition.reason, probe.reason, 'WebGPU skip must preserve the real probe reason');
}

export async function settleCleanup(entries) {
  const results = await Promise.allSettled(entries.map(({ close }) => Promise.resolve().then(close)));
  return results.flatMap((result, index) => result.status === 'rejected'
    ? [new Error(`${entries[index].name} cleanup failed: ${result.reason?.message ?? result.reason}`, { cause: result.reason })]
    : []);
}
