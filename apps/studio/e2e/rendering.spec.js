import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertBrowserCoverage,
  assertRequiredArtifacts,
  assertVisualHealth,
  assertWebGpuDisposition,
} from '../../game/scripts/browser-regression-contracts.mjs';
import { loadStaticCanvasFixture, openCleanEditor, persistActiveDraft } from './studio-test-helpers.js';

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runId = process.env.STUDIO_GATE_RUN_ID ?? `run-${Date.now()}-${process.pid}`;
const runDir = join(studioRoot, 'output', 'playwright', 'rendering', runId);
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const profiles = [
  { name: 'mobile-390-dpr3-60hz', width: 390, height: 844, deviceScaleFactor: 3, mobile: true, refreshRate: 60 },
  { name: 'mobile-412-dpr2625-60hz', width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, refreshRate: 60 },
  { name: 'landscape-915-dpr2625-60hz', width: 915, height: 412, deviceScaleFactor: 2.625, mobile: true, refreshRate: 60 },
  { name: 'desktop-60hz', width: 1366, height: 768, deviceScaleFactor: 1, refreshRate: 60 },
  { name: 'desktop-120hz', width: 1366, height: 768, deviceScaleFactor: 1, refreshRate: 120 },
  { name: 'desktop-175hz', width: 1366, height: 768, deviceScaleFactor: 1, refreshRate: 175 },
  { name: 'mobile-reduced-motion-60hz', width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, refreshRate: 60, reducedMotion: 'reduce' },
];
const baseMatrix = ['webgl2', 'canvas2d'].flatMap((backend) => profiles.map((profile) => ({
  ...profile,
  backend,
  name: `${profile.name}-${backend}`,
})));

function initDiagnostics(refreshRate) {
  window.__TASK7_DIAGNOSTICS__ = { unhandledRejections: [], windowErrors: [], contextLosses: [] };
  window.addEventListener('unhandledrejection', (event) => window.__TASK7_DIAGNOSTICS__.unhandledRejections.push(String(event.reason?.stack ?? event.reason)));
  window.addEventListener('error', (event) => window.__TASK7_DIAGNOSTICS__.windowErrors.push(String(event.error?.stack ?? event.message)));
  const attach = () => {
    for (const canvas of document.querySelectorAll('canvas')) {
      if (canvas.dataset.task7ContextListener) continue;
      canvas.dataset.task7ContextListener = 'true';
      canvas.addEventListener('webglcontextlost', (event) => window.__TASK7_DIAGNOSTICS__.contextLosses.push({ type: 'lost', statusMessage: event.statusMessage ?? '' }));
      canvas.addEventListener('webglcontextrestored', () => window.__TASK7_DIAGNOSTICS__.contextLosses.push({ type: 'restored' }));
    }
  };
  document.addEventListener('DOMContentLoaded', attach, { once: true });
  new MutationObserver(attach).observe(document, { childList: true, subtree: true });

  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const step = 1000 / refreshRate;
  let lastNative = Number.NaN;
  let timestamp = 0;
  let epoch = 0;
  let observedSelector = null;
  let observedBefore = null;
  let observedCapture = null;
  window.requestAnimationFrame = (callback) => nativeRaf((nativeTimestamp) => {
    if (nativeTimestamp !== lastNative) { lastNative = nativeTimestamp; timestamp += step; }
    callback(timestamp);
    if (observedSelector && !observedCapture && timestamp - epoch >= 5_000) {
      const observedAfter = Number(document.querySelector(observedSelector)?.dataset.renderCount);
      observedCapture = { refreshRate, step, timestamp, elapsed: timestamp - epoch, before: observedBefore, after: observedAfter };
    }
  });
  window.cancelAnimationFrame = nativeCancel;
  window.__TASK7_RAF__ = {
    mark(selector) {
      observedSelector = selector;
      observedBefore = Number(document.querySelector(selector)?.dataset.renderCount);
      observedCapture = null;
      epoch = timestamp;
      return { epoch, before: observedBefore };
    },
    elapsed() { return timestamp - epoch; },
    captured() { return observedCapture; },
    snapshot() { return { refreshRate, step, timestamp, elapsed: timestamp - epoch }; },
  };
}

async function waitForStableCount(locator, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  let previous = Number.NaN;
  while (Date.now() < deadline) {
    const current = Number(await locator.getAttribute('data-render-count'));
    if (Number.isSafeInteger(current) && current === previous) return current;
    previous = current;
    await delay(180);
  }
  throw new Error(`Render count did not settle; last=${previous}`);
}

async function virtualWindow(page, locator, scenario, { reduced = false } = {}) {
  const identity = await locator.evaluate((element) => element.id
    ? `#${element.id}`
    : `[data-surface-id="${element.dataset.surfaceId}"]`);
  const before = Number(await locator.getAttribute('data-render-count'));
  const startedAt = Date.now();
  await page.evaluate((selector) => window.__TASK7_RAF__.mark(selector), identity);
  let raf;
  if (reduced) {
    await delay(5_000);
    raf = { ...(await page.evaluate(() => window.__TASK7_RAF__.snapshot())), before, after: Number(await locator.getAttribute('data-render-count')) };
  } else {
    await page.waitForFunction(() => window.__TASK7_RAF__.captured(), null, { timeout: 35_000 });
    raf = await page.evaluate(() => window.__TASK7_RAF__.captured());
  }
  assert.ok(Number.isSafeInteger(raf.before) && Number.isSafeInteger(raf.after), `[${scenario}] render count is not finite`);
  return { durationMs: reduced ? Date.now() - startedAt : raf.elapsed, before: raf.before, after: raf.after, delta: raf.after - raf.before, raf };
}

async function realStaticWindow(locator, scenario, label) {
  const before = await waitForStableCount(locator);
  const startedAt = Date.now();
  await delay(5_000);
  const after = Number(await locator.getAttribute('data-render-count'));
  assert.ok(Number.isSafeInteger(after), `[${scenario}] ${label} final render count is not finite`);
  return { durationMs: Date.now() - startedAt, before, after, delta: after - before };
}

function finite(value, label, scenario) {
  assert.ok(Number.isFinite(value), `[${scenario}] ${label} must be finite`);
  return value;
}

function assertPresentationCapture(debug, surfaceId, backend, scenario) {
  assert.ok(debug && typeof debug === 'object', `[${scenario}] Studio render diagnostics are missing`);
  const capture = debug.surfaces?.[surfaceId];
  assert.ok(capture && typeof capture === 'object', `[${scenario}] ${surfaceId} capture is missing`);
  assert.ok(Number.isSafeInteger(capture.renderCount) && capture.renderCount > 0, `[${scenario}] ${surfaceId} renderCount is invalid`);
  const frame = capture.frame;
  assert.equal(frame?.kind, 'franz-lola-presentation-frame', `[${scenario}] PresentationFrame kind is invalid`);
  assert.ok(Number.isSafeInteger(frame.frameId) && frame.frameId > 0, `[${scenario}] frameId is invalid`);
  for (const key of ['x', 'y', 'width', 'height']) finite(frame.camera?.viewport?.[key], `camera.viewport.${key}`, scenario);
  for (const key of ['x', 'y']) {
    finite(frame.player?.world?.[key], `player.world.${key}`, scenario);
    finite(frame.player?.screen?.[key], `player.screen.${key}`, scenario);
  }
  assert.ok(Array.isArray(frame.cats), `[${scenario}] cats capture is missing`);
  frame.cats.forEach((cat, index) => {
    finite(cat.world?.x, `cats.${index}.world.x`, scenario); finite(cat.world?.y, `cats.${index}.world.y`, scenario);
    finite(cat.screen?.x, `cats.${index}.screen.x`, scenario); finite(cat.screen?.y, `cats.${index}.screen.y`, scenario);
  });
  for (const key of ['width', 'height', 'bufferWidth', 'bufferHeight', 'pixelRatio']) finite(frame.display?.[key], `display.${key}`, scenario);
  assert.equal(frame.renderer?.requestedBackend, backend, `[${scenario}] requested backend changed`);
  assert.equal(frame.renderer?.backend, backend, `[${scenario}] resolved backend changed`);
  assert.equal(frame.renderer?.fallbackReason, null, `[${scenario}] backend fallback is not allowed`);
  assert.equal(frame.renderer?.contextLost, false, `[${scenario}] renderer reports context loss`);
  finite(frame.renderer?.frameCount, 'renderer.frameCount', scenario);
  finite(frame.renderer?.textureReallocations, 'renderer.textureReallocations', scenario);
  return capture;
}

async function canvasVisualHealth(locator, scenario) {
  const screenshot = await locator.screenshot({ type: 'png', animations: 'allow' });
  const dataUrl = 'data:image/png;base64,' + screenshot.toString('base64');
  const sample = await locator.evaluate(async (_source, imageUrl) => {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data; const colors = new Set();
    let opaquePixels = 0; let chromaPixels = 0; let minimum = 255; let maximum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]; const green = pixels[index + 1]; const blue = pixels[index + 2]; const alpha = pixels[index + 3];
      if (alpha > 0) opaquePixels += 1;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) >= 12) chromaPixels += 1;
      const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
      minimum = Math.min(minimum, luminance); maximum = Math.max(maximum, luminance);
      colors.add([red >> 3, green >> 3, blue >> 3, alpha >> 5].join(','));
    }
    return { opaquePixels, uniqueColors: colors.size, chromaPixels, luminanceRange: maximum - minimum };
  }, dataUrl);
  return assertVisualHealth(sample, scenario);
}
async function switchWorkspace(page, id) {
  const mobilePicker = page.getByLabel('Arbeitsbereich auswählen');
  if (await mobilePicker.isVisible()) await mobilePicker.selectOption(id);
  else await page.locator(`[data-workspace="${id}"]`).click();
  await expect(page.locator(`[data-workspace="${id}"]`)).toHaveAttribute('aria-current', 'page');
}

async function webmDurationSeconds(browser, path, scenario) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent('<input id="video-file" type="file"><video id="probe" muted></video>');
    await page.locator('#video-file').setInputFiles(path);
    return await page.evaluate(async (scenarioName) => {
      const file = document.querySelector('#video-file').files?.[0];
      if (!file) throw new Error(`[${scenarioName}] finalized WebM could not be loaded`);
      const video = document.querySelector('#probe'); const objectUrl = URL.createObjectURL(file);
      try {
        video.src = objectUrl;
        await new Promise((resolveMetadata, rejectMetadata) => {
          const timeout = setTimeout(() => rejectMetadata(new Error('WebM metadata timeout')), 10_000);
          video.addEventListener('loadedmetadata', () => { clearTimeout(timeout); resolveMetadata(); }, { once: true });
          video.addEventListener('error', () => { clearTimeout(timeout); rejectMetadata(new Error('WebM metadata unreadable')); }, { once: true });
        });
        if (!Number.isFinite(video.duration)) {
          await new Promise((resolveDuration, rejectDuration) => {
            const timeout = setTimeout(() => rejectDuration(new Error('WebM duration timeout')), 10_000);
            video.addEventListener('timeupdate', () => { clearTimeout(timeout); resolveDuration(); }, { once: true });
            video.currentTime = Number.MAX_SAFE_INTEGER;
          });
        }
        return video.duration;
      } finally { URL.revokeObjectURL(objectUrl); }
    }, scenario);
  } finally { await context.close(); }
}

async function probeWebGpu(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage(); await page.goto(`${baseUrl}/?renderer=canvas2d`, { waitUntil: 'domcontentloaded' });
    return page.evaluate(async () => {
      if (!navigator.gpu) return { available: false, reason: 'navigator.gpu is not exposed' };
      try { return await navigator.gpu.requestAdapter() ? { available: true, reason: null } : { available: false, reason: 'requestAdapter() returned null' }; }
      catch (error) { return { available: false, reason: `requestAdapter() failed: ${error?.message ?? error}` }; }
    });
  } finally { await context.close(); }
}

async function runScenario(browser, scenario) {
  const artifactDir = join(runDir, scenario.name); await mkdir(artifactDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    deviceScaleFactor: scenario.deviceScaleFactor,
    isMobile: Boolean(scenario.mobile), hasTouch: Boolean(scenario.mobile),
    reducedMotion: scenario.reducedMotion ?? 'no-preference',
    recordVideo: { dir: artifactDir, size: { width: scenario.width, height: scenario.height } },
  });
  const consoleErrors = []; const pageErrors = []; const crashes = [];
  let page; let video; let result;
  try {
    page = await context.newPage(); video = page.video();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    page.on('crash', () => crashes.push('Playwright page crash event'));
    await page.addInitScript(initDiagnostics, scenario.refreshRate);
    await openCleanEditor(page, `/?renderer=${scenario.backend}`);
    const cleanErrors = pageErrors.splice(0);
    assert.deepEqual(cleanErrors, [], `[${scenario.name}] editor bootstrap page errors`);
    await persistActiveDraft(page); await loadStaticCanvasFixture(page);
    const level = page.locator('#level-canvas');
    await expect(level).toHaveAttribute('data-renderer-backend', scenario.backend, { timeout: 20_000 });
    const staticEditor = await realStaticWindow(level, scenario.name, 'static editor');
    assert.ok(staticEditor.durationMs >= 5_000, `[${scenario.name}] static editor window was shorter than five seconds`);
    assert.ok(staticEditor.delta <= 1, `[${scenario.name}] static editor exceeded one presentation`);
    const levelVisual = await canvasVisualHealth(level, `${scenario.name}:level`);
    const levelDebug = await page.evaluate(() => window.__FRANZ_LOLA_STUDIO_RENDER_DEBUG__?.());
    assertPresentationCapture(levelDebug, 'studio-level-canvas', scenario.backend, `${scenario.name}:level`);

    await switchWorkspace(page, 'objects');
    await page.locator('.object-sidebar .sidebar-mode-tabs').getByRole('button', { name: /Assets/ }).click();
    const animated = page.locator('[data-asset-id="music-note"] .object-thumbnail');
    await animated.scrollIntoViewIfNeeded();
    await expect(animated).toBeInViewport();
    const animatedWindow = await virtualWindow(page, animated, `${scenario.name}:animated-thumbnail`, { reduced: scenario.reducedMotion === 'reduce' });
    if (scenario.reducedMotion === 'reduce') assert.ok(animatedWindow.delta <= 1, `[${scenario.name}] reduced animated thumbnail did not sleep`);
    else assert.ok(animatedWindow.delta >= 145 && animatedWindow.delta <= 155, `[${scenario.name}] animated thumbnail delta ${animatedWindow.delta} is outside 145-155`);
    await page.locator('.object-sidebar').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(animated).not.toBeInViewport();
    const hiddenThumbnail = await realStaticWindow(animated, scenario.name, 'hidden thumbnail');
    assert.equal(hiddenThumbnail.delta, 0, `[${scenario.name}] hidden thumbnail presented`);

    await switchWorkspace(page, 'playtest'); await page.locator('#start-playtest').click();
    const skipIntro = page.getByRole('button', { name: /Intro überspringen/ });
    if (await skipIntro.isVisible({ timeout: 3_000 }).catch(() => false)) await skipIntro.click();
    const playtest = page.locator('#playtest-canvas');
    await expect(playtest).toHaveAttribute('data-render-profile', 'playtest', { timeout: 20_000 });
    await expect(playtest).toHaveAttribute('data-renderer-backend', scenario.backend);
    const beforeDebug = await page.evaluate(() => window.__FRANZ_LOLA_STUDIO_RENDER_DEBUG__?.());
    const beforeCapture = assertPresentationCapture(beforeDebug, 'studio-playtest-workspace', scenario.backend, `${scenario.name}:playtest-before`);
    const activePlaytest = await virtualWindow(page, playtest, `${scenario.name}:active-playtest`, { reduced: scenario.reducedMotion === 'reduce' });
    assert.ok(activePlaytest.delta <= 301, `[${scenario.name}] active playtest exceeded 301 presentations`);
    const afterDebug = await page.evaluate(() => window.__FRANZ_LOLA_STUDIO_RENDER_DEBUG__?.());
    const afterCapture = assertPresentationCapture(afterDebug, 'studio-playtest-workspace', scenario.backend, `${scenario.name}:playtest-after`);
    const textureReallocations = afterCapture.frame.renderer.textureReallocations - beforeCapture.frame.renderer.textureReallocations;
    assert.equal(textureReallocations, 0, `[${scenario.name}] stable-size playtest reallocated textures`);
    const playtestVisual = await canvasVisualHealth(playtest, `${scenario.name}:playtest`);
    await page.locator('.playtest-hud').getByRole('button', { name: /Pause/ }).click();
    await expect(playtest).toHaveAttribute('data-render-profile', 'editor');
    const pausedPlaytest = await realStaticWindow(playtest, scenario.name, 'paused playtest');
    assert.equal(pausedPlaytest.delta, 0, `[${scenario.name}] paused playtest presented`);

    const screenshotPath = join(artifactDir, `${scenario.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'allow' });
    const screenshotInfo = await stat(screenshotPath);
    assert.ok(screenshotInfo.size > 8_000, `[${scenario.name}] screenshot is unexpectedly small`);
    const browserDiagnostics = await page.evaluate(() => window.__TASK7_DIAGNOSTICS__);
    assert.deepEqual(browserDiagnostics?.unhandledRejections ?? null, [], `[${scenario.name}] unhandled promises`);
    assert.deepEqual(browserDiagnostics?.windowErrors ?? null, [], `[${scenario.name}] window errors`);
    assert.deepEqual(browserDiagnostics?.contextLosses ?? null, [], `[${scenario.name}] context losses`);
    assert.deepEqual(consoleErrors, [], `[${scenario.name}] console errors`);
    assert.deepEqual(pageErrors, [], `[${scenario.name}] page errors`);
    assert.deepEqual(crashes, [], `[${scenario.name}] crashes`);
    result = {
      name: scenario.name, status: 'passed', backend: scenario.backend, resolvedBackend: afterCapture.frame.renderer.backend,
      width: scenario.width, height: scenario.height, deviceScaleFactor: scenario.deviceScaleFactor,
      refreshRate: scenario.refreshRate, reducedMotion: scenario.reducedMotion === 'reduce',
      budgets: { staticEditor, animatedThumbnail: animatedWindow, hiddenThumbnail, activePlaytest, pausedPlaytest, textureReallocations },
      visuals: { level: levelVisual, playtest: playtestVisual },
      screenshot: { path: screenshotPath, bytes: screenshotInfo.size },
      diagnostics: { browser: browserDiagnostics, consoleErrors, pageErrors, crashes },
    };
  } finally {
    if (page && !page.isClosed()) await page.close();
    await context.close();
  }
  const originalVideo = await video.path();
  const targetVideo = join(artifactDir, `${scenario.name}.webm`);
  if (originalVideo !== targetVideo) await rename(originalVideo, targetVideo);
  const videoInfo = await stat(targetVideo); const durationSeconds = await webmDurationSeconds(browser, targetVideo, scenario.name);
  result.video = { path: targetVideo, bytes: videoInfo.size, durationSeconds };
  assertRequiredArtifacts([{ screenshot: result.screenshot, video: result.video }], 1);
  return result;
}

test('shared rendering completion matrix @rendering-gate', async ({ browser }) => {
  assert.ok(baseUrl, 'PLAYWRIGHT_BASE_URL is required; run through the ephemeral-port gate wrapper.');
  await mkdir(runDir, { recursive: true });
  const summary = { runId, port: Number(process.env.STUDIO_GATE_PORT), baseUrl, startedAt: new Date().toISOString(), scenarios: [] };
  const webGpu = await probeWebGpu(browser);
  const matrix = [...baseMatrix];
  if (webGpu.available) matrix.push({ ...profiles[1], name: `${profiles[1].name}-webgpu`, backend: 'webgpu' });
  const only = process.env.STUDIO_GATE_SCENARIO;
  const selectedMatrix = only ? matrix.filter((scenario) => scenario.name === only) : matrix;
  assert.ok(selectedMatrix.length > 0, 'Unknown Studio gate scenario: ' + only);
  for (const scenario of selectedMatrix) summary.scenarios.push(await runScenario(browser, scenario));
  summary.webGpu = webGpu.available
    ? { status: 'passed', resolvedBackend: summary.scenarios.find((scenario) => scenario.backend === 'webgpu')?.resolvedBackend }
    : { status: 'skipped', reason: webGpu.reason };
  if (!only) {
    assertWebGpuDisposition(webGpu, summary.webGpu);
    assertBrowserCoverage(summary.scenarios);
    assertRequiredArtifacts(summary.scenarios.map(({ screenshot, video }) => ({ screenshot, video })), matrix.length);
  }
  summary.finishedAt = new Date().toISOString(); summary.status = 'passed';
  await writeFile(join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
});
