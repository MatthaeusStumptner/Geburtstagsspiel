import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN_ID = `run-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
const RUN_DIR = join(ROOT, 'output', 'playwright', 'game', RUN_ID);
const SAVE_KEY = 'gassi-runde-hals-save';
const APP_WARNING = /(?:renderer|webgl|webgpu|svelte|unhandled|context\s*lost|gassi)/i;
const FIXED_STEP_TOLERANCE = (5.8 / 120) + 0.006;
const EXPECTED_HOME_POSITION = Object.freeze({ x: 7, y: 20 });
const BASE_MATRIX = [
  { name: 'mobile-390-dpr3', width: 390, height: 844, deviceScaleFactor: 3, backend: 'webgl2', mobile: true },
  { name: 'mobile-412-dpr2625', width: 412, height: 915, deviceScaleFactor: 2.625, backend: 'webgl2', mobile: true },
  { name: 'mobile-reduced-motion', width: 412, height: 915, deviceScaleFactor: 2.625, backend: 'webgl2', mobile: true, reducedMotion: 'reduce' },
  { name: 'landscape-915-dpr2625', width: 915, height: 412, deviceScaleFactor: 2.625, backend: 'webgl2', mobile: true },
  { name: 'desktop-webgl2-60hz', width: 1366, height: 768, deviceScaleFactor: 1, backend: 'webgl2', rafHz: 60 },
  { name: 'desktop-webgl2-120hz', width: 1366, height: 768, deviceScaleFactor: 1, backend: 'webgl2', rafHz: 120 },
  { name: 'desktop-webgl2-175hz', width: 1366, height: 768, deviceScaleFactor: 1, backend: 'webgl2', rafHz: 175 },
  { name: 'desktop-canvas2d', width: 1366, height: 768, deviceScaleFactor: 1, backend: 'canvas2d' },
];

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function ephemeralPort() {
  const probe = createNetServer();
  try {
    await new Promise((resolveListen, rejectListen) => {
      probe.once('error', rejectListen);
      probe.listen(0, '127.0.0.1', resolveListen);
    });
    const address = probe.address();
    assert.ok(address && typeof address !== 'string' && address.port > 0, 'OS did not assign an ephemeral port');
    return address.port;
  } finally {
    if (probe.listening) await new Promise((resolveClose, rejectClose) => probe.close((error) => error ? rejectClose(error) : resolveClose()));
  }
}
function deterministicSave(scenario = {}) {
  return {
    version: 9, savedAt: '2026-08-11T00:00:00.000Z', mode: 'map', runStarted: false,
    score: 0, best: 0, level: 1, lives: 5, powerTimer: 0, hitTimer: 0, graceTimer: 2.2,
    soundEnabled: false, reducedMotion: scenario.reducedMotion === 'reduce', language: 'standard', difficulty: 'easy',
    levelTreatTotal: 0, levelRunScore: 0, levelEventElapsed: 0, levelStats: {}, selectedLevelId: 'home',
    completedLevelIds: [], concertUnlocked: false, concertRevealSeen: false, unlockedEggs: [],
  };
}

function initBrowserState({ save, rafHz }) {
  localStorage.setItem('gassi-runde-hals-save', JSON.stringify(save));

  window.__PW_DIAGNOSTICS__ = { unhandledRejections: [], windowErrors: [], contextLosses: [] };
  window.addEventListener('unhandledrejection', (event) => window.__PW_DIAGNOSTICS__.unhandledRejections.push(String(event.reason?.stack ?? event.reason)));
  window.addEventListener('error', (event) => window.__PW_DIAGNOSTICS__.windowErrors.push(String(event.error?.stack ?? event.message)));
  const attach = () => {
    const canvas = document.querySelector('#game');
    if (!canvas || canvas.dataset.pwContextListener) return;
    canvas.dataset.pwContextListener = 'true';
    canvas.addEventListener('webglcontextlost', (event) => window.__PW_DIAGNOSTICS__.contextLosses.push({ type: 'lost', statusMessage: event.statusMessage ?? '' }));
    canvas.addEventListener('webglcontextrestored', () => window.__PW_DIAGNOSTICS__.contextLosses.push({ type: 'restored' }));
  };
  document.addEventListener('DOMContentLoaded', attach, { once: true });
  new MutationObserver(attach).observe(document, { childList: true, subtree: true });

  if (!rafHz) return;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const step = 1000 / rafHz;
  let lastNative = Number.NaN; let virtualTimestamp = 0; let nativeFrames = 0; let epoch = 0; let marked = false; let captured = null;
  window.requestAnimationFrame = (callback) => nativeRaf((nativeTimestamp) => {
    if (nativeTimestamp !== lastNative) { lastNative = nativeTimestamp; virtualTimestamp += step; nativeFrames += 1; }
    callback(virtualTimestamp);
    if (marked && !captured && virtualTimestamp - epoch >= 2_000 && window.__GASSI_DEBUG__ && window.__GASSI_RENDERER_DEBUG__) {
      captured = { game: window.__GASSI_DEBUG__(), renderer: window.__GASSI_RENDERER_DEBUG__(), raf: { hz: rafHz, step, nativeFrames, virtualTimestamp, elapsed: virtualTimestamp - epoch } };
    }
  });
  window.cancelAnimationFrame = nativeCancel;
  window.__PW_RAF__ = {
    mark() { epoch = virtualTimestamp; marked = true; captured = null; return epoch; },
    elapsed() { return virtualTimestamp - epoch; },
    captured() { return captured; },
    snapshot() { return { hz: rafHz, step, nativeFrames, virtualTimestamp, elapsed: virtualTimestamp - epoch }; },
  };
}

function counters(debug = {}) {
  return {
    rendererFrames: finite(debug.frameCount), schedulerFrames: finite(debug.scheduler?.renderCount),
    uploadedBytes: finite(debug.uploadedBytes), sceneUploadedBytes: finite(debug.sceneUploadedBytes),
    overlayUploadedBytes: finite(debug.overlayUploadedBytes), worldOverlayUploadedBytes: finite(debug.worldOverlayUploadedBytes),
    staticWorldRevision: finite(debug.staticWorldRevision),
  };
}

async function debugState(page) {
  return page.evaluate(() => ({ game: window.__GASSI_DEBUG__?.() ?? null, renderer: window.__GASSI_RENDERER_DEBUG__?.() ?? null }));
}

async function waitFor(page, scenario, predicate, description, timeout = 15_000) {
  const deadline = Date.now() + timeout; let last = null;
  while (Date.now() < deadline) {
    last = await debugState(page);
    if (predicate(last)) return last;
    await delay(40);
  }
  throw new Error(`[${scenario}] timeout waiting for ${description}; last=${JSON.stringify(last)}`);
}

async function settleStatic(page, scenario, policy) {
  const deadline = Date.now() + 4_000; let previous = null;
  while (Date.now() < deadline) {
    const debug = await page.evaluate(() => window.__GASSI_RENDERER_DEBUG__?.() ?? null);
    if (debug?.renderPolicy === policy && debug.scheduler?.pendingReason === 'idle') {
      const current = counters(debug);
      if (previous && Object.keys(current).every((key) => current[key] === previous[key])) return current;
      previous = current;
    }
    await delay(80);
  }
  throw new Error(`[${scenario}] ${policy} render state did not settle`);
}

async function assertStaticSleep(page, scenario, policy, label) {
  const before = await settleStatic(page, scenario, policy);
  await delay(1_000);
  const after = counters(await page.evaluate(() => window.__GASSI_RENDERER_DEBUG__?.() ?? null));
  assert.deepEqual(after, before, `[${scenario}] ${label} advanced while static`);
  return { before, after };
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const target = document.querySelector(selector); if (!target) return null;
      const value = target.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const canvas = document.querySelector('#game');
    return {
      viewport: { width: innerWidth, height: innerHeight }, canvas: rect('#game'), header: rect('#mobile-game-header'),
      board: rect('.board-column'), boardFrame: rect('.board-frame'), overlay: rect('.game-overlay'),
      buffer: { width: canvas.width, height: canvas.height },
      document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      playerScreen: { x: Number(canvas.dataset.playerScreenX), y: Number(canvas.dataset.playerScreenY) },
      renderer: window.__GASSI_RENDERER_DEBUG__?.() ?? null,
      mobileGameActive: document.body.classList.contains('mobile-game-active'),
      fullscreenEnabled: Boolean(document.fullscreenEnabled),
      fullscreenControl: Boolean(document.querySelector('[data-fullscreen-control], #mobile-fullscreen-button')),
      layoutDiagnostics: {
        bodyClass: document.body.className,
        landscapeMedia: matchMedia('(max-width: 900px) and (max-height: 600px) and (orientation: landscape)').matches,
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        boardOffsetParent: document.querySelector('.board-column')?.offsetParent?.className ?? null,
        frameOffsetParent: document.querySelector('.board-frame')?.offsetParent?.className ?? null,
        canvasOffsetParent: canvas.offsetParent?.className ?? null,
        boardCustomHeaderHeight: getComputedStyle(document.querySelector('.board-column')).getPropertyValue('--mobile-game-header-height').trim(),
        canvasComputed: { position: getComputedStyle(canvas).position, top: getComputedStyle(canvas).top, height: getComputedStyle(canvas).height },
      },
    };
  });
}

function inside(inner, outer, tolerance = 1) {
  return inner.left >= outer.left - tolerance && inner.top >= outer.top - tolerance
    && inner.right <= outer.right + tolerance && inner.bottom <= outer.bottom + tolerance;
}

function assertMobileGeometry(value, scenario) {
  assert.ok(value.mobileGameActive, `[${scenario.name}] mobile runtime class is absent`);
  assert.ok(value.canvas.top >= value.header.bottom - 1, `[${scenario.name}] canvas overlaps the DOM HUD (canvasTop=${value.canvas.top}, headerBottom=${value.header.bottom}, diagnostics=${JSON.stringify(value.layoutDiagnostics)})`);
  assert.ok(inside(value.canvas, value.board), `[${scenario.name}] canvas escapes the board`);
  assert.ok(value.canvas.right <= value.viewport.width + 1 && value.canvas.bottom <= value.viewport.height + 1, `[${scenario.name}] canvas escapes viewport`);
  assert.ok(value.document.scrollWidth <= value.viewport.width + 1 && value.document.scrollHeight <= value.viewport.height + 1, `[${scenario.name}] viewport overflow detected`);
  assert.ok(value.buffer.height < Math.round(scenario.height * Math.min(2, scenario.deviceScaleFactor)), `[${scenario.name}] backbuffer still includes HUD height`);
  assert.equal(value.buffer.height, value.renderer.display?.bufferHeight, `[${scenario.name}] renderer/canvas backbuffer mismatch`);
  assert.ok(value.playerScreen.x >= -1 && value.playerScreen.x <= value.buffer.width + 1, `[${scenario.name}] player X leaves canvas`);
  assert.ok(value.playerScreen.y >= -1 && value.playerScreen.y <= value.buffer.height + 1, `[${scenario.name}] player Y leaves canvas`);
}

async function shot(page, artifactDir, name) {
  const path = join(artifactDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false, animations: 'allow' });
  const info = await stat(path);
  assert.ok(info.size > 8_000, `${name} screenshot is unexpectedly small (${info.size} bytes)`);
  return { path, bytes: info.size };
}

async function enterLevel(page, scenario) {
  await page.locator('[data-level-id="home"] .map-marker').click({ force: true });
  await page.locator('#map-start-button').click();
  await page.locator('#overlay-button').waitFor({ state: 'visible', timeout: 12_000 });
  await page.locator('#overlay-button').click();
  const skip = page.locator('#level-cutscene-skip');
  if (await skip.isVisible({ timeout: 2_000 }).catch(() => false)) await skip.click();
  await waitFor(page, scenario.name, ({ game }) => game?.state === 'playing', 'active gameplay');
  await page.keyboard.press('ArrowLeft');
}

async function highRefreshWindow(page, scenario) {
  await page.keyboard.press('KeyP');
  await waitFor(page, scenario.name, ({ game }) => game?.state === 'paused', 'high-Hz baseline pause');
  await page.keyboard.press('ArrowLeft');
  const baseline = await page.evaluate(() => ({ player: window.__GASSI_DEBUG__().player, renderer: window.__GASSI_RENDERER_DEBUG__(), mark: window.__PW_RAF__.mark() }));
  await page.locator('#overlay-button').click();
  await waitFor(page, scenario.name, ({ game }) => game?.state === 'playing', 'high-Hz resume');
  await page.waitForFunction(() => window.__PW_RAF__.captured(), null, { timeout: 10_000 });
  const measured = await page.evaluate(() => window.__PW_RAF__.captured());
  await page.keyboard.press('KeyP');
  await waitFor(page, scenario.name, ({ game }) => game?.state === 'paused', 'high-Hz final pause');
  const presentationDelta = finite(measured.renderer.frameCount) - finite(baseline.renderer.frameCount);
  const positionError = Math.hypot(measured.game.player.x - EXPECTED_HOME_POSITION.x, measured.game.player.y - EXPECTED_HOME_POSITION.y);
  assert.ok(presentationDelta <= 121, `[${scenario.name}] ${presentationDelta} presentations in two virtual seconds`);
  assert.ok(positionError <= FIXED_STEP_TOLERANCE, `[${scenario.name}] player drift ${positionError} exceeds one fixed step`);
  return { baselinePlayer: baseline.player, finalPlayer: measured.game.player, expectedPlayer: EXPECTED_HOME_POSITION, positionError, presentationDelta, raf: measured.raf };
}

async function resizeRoundTrip(page, scenario, artifactDir) {
  const rotated = scenario.mobile ? { width: scenario.height, height: scenario.width } : { width: 1180, height: 700 };
  await page.setViewportSize(rotated); await delay(250);
  const changed = await geometry(page);
  if (scenario.mobile) assertMobileGeometry(changed, { ...scenario, ...rotated });
  const screenshot = await shot(page, artifactDir, 'post-resize');
  await page.setViewportSize({ width: scenario.width, height: scenario.height }); await delay(250);
  const restored = await geometry(page);
  if (scenario.mobile) assertMobileGeometry(restored, scenario);
  return { rotated, changed, restored, screenshot };
}

async function returnMap(page, scenario) {
  if (await page.locator('#mobile-game-menu-button').isVisible()) {
    await page.locator('#mobile-game-menu-button').click();
    await page.locator('#settings-map-button').waitFor({ state: 'visible' });
    await page.locator('#settings-map-button').click();
  } else await page.locator('#map-button').click();
  await page.locator('#map-screen').waitFor({ state: 'visible' });
  await waitFor(page, scenario.name, ({ game, renderer }) => game?.state === 'map' && renderer?.renderPolicy === 'hidden', 'map return');
}

async function runScenario(browser, baseUrl, scenario) {
  const artifactDir = join(RUN_DIR, scenario.name); await mkdir(artifactDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height }, deviceScaleFactor: scenario.deviceScaleFactor,
    isMobile: Boolean(scenario.mobile), hasTouch: Boolean(scenario.mobile), reducedMotion: scenario.reducedMotion ?? 'no-preference',
    recordVideo: { dir: artifactDir, size: { width: scenario.width, height: scenario.height } },
  });
  const startedAt = Date.now(); let page; let video; let result; let failure = null;
  const consoleErrors = []; const warnings = []; const ignoredDriverWarnings = []; const pageErrors = []; const screenshots = [];
  try {
    page = await context.newPage(); video = page.video();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
      if (message.type() === 'warning' && /GL Driver Message.*ReadPixels/i.test(message.text())) ignoredDriverWarnings.push(message.text());
      else if (message.type() === 'warning' && APP_WARNING.test(message.text())) warnings.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    await page.addInitScript(initBrowserState, { save: deterministicSave(scenario), rafHz: scenario.rafHz ?? null });
    await page.goto(`${baseUrl}?renderer=${scenario.backend}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    const ready = await waitFor(page, scenario.name, ({ game, renderer }) => game?.state === 'map' && renderer?.backend && renderer.backend !== 'initializing', 'startup', 20_000);
    assert.equal(ready.renderer.requestedBackend, scenario.backend, `[${scenario.name}] requested backend not recorded`);
    assert.equal(ready.renderer.backend, scenario.backend, `[${scenario.name}] resolved backend ${ready.renderer.backend}`);
    assert.equal(ready.renderer.fallbackReason, null, `[${scenario.name}] unexpected fallback`);
    screenshots.push(await shot(page, artifactDir, 'map'));
    const reducedMap = scenario.reducedMotion === 'reduce' ? await page.evaluate(() => ({
      root: document.documentElement.dataset.reducedMotion,
      grid: getComputedStyle(document.querySelector('.map-canvas'), '::before').animationPlayState,
      marker: getComputedStyle(document.querySelector('.map-marker-wrap')).animationPlayState,
    })) : null;
    if (reducedMap) {
      assert.equal(reducedMap.root, 'true');
      assert.ok(['paused', 'none'].includes(reducedMap.grid)); assert.ok(['paused', 'none'].includes(reducedMap.marker));
    }
    await enterLevel(page, scenario); await delay(320);
    screenshots.push(await shot(page, artifactDir, 'active-level'));
    const active = await geometry(page); if (scenario.mobile) assertMobileGeometry(active, scenario);
    const highRefresh = scenario.rafHz ? await highRefreshWindow(page, scenario) : null;
    if (!scenario.rafHz) { await page.keyboard.press('KeyP'); await waitFor(page, scenario.name, ({ game }) => game?.state === 'paused', 'pause'); }
    const paused = await geometry(page); if (scenario.mobile) assertMobileGeometry(paused, scenario);
    assert.ok(paused.overlay && inside(paused.overlay, paused.boardFrame, 1), `[${scenario.name}] pause overlay does not cover board frame`);
    screenshots.push(await shot(page, artifactDir, 'paused-level'));
    const pausedSleep = await assertStaticSleep(page, scenario.name, 'once', 'paused level');
    const frameOne = await page.locator('#game').screenshot(); await delay(300); const frameTwo = await page.locator('#game').screenshot();
    assert.equal(hash(frameOne), hash(frameTwo), `[${scenario.name}] paused canvas flickers`);
    const resize = await resizeRoundTrip(page, scenario, artifactDir);
    screenshots.push(resize.screenshot);
    const reducedRenderer = scenario.reducedMotion === 'reduce' ? await page.evaluate(() => window.__GASSI_RENDERER_DEBUG__?.().postProcess ?? null) : null;
    if (reducedRenderer) { assert.equal(finite(reducedRenderer.scanlines), 0); assert.equal(finite(reducedRenderer.rgbSplitTexels), 0); }
    await returnMap(page, scenario); screenshots.push(await shot(page, artifactDir, 'map-return'));
    const mapSleep = await assertStaticSleep(page, scenario.name, 'hidden', 'map');
    const remaining = 3_200 - (Date.now() - startedAt); if (remaining > 0) await delay(remaining);
    const late = await page.evaluate(() => ({ renderer: window.__GASSI_RENDERER_DEBUG__?.() ?? null, game: window.__GASSI_DEBUG__?.() ?? null, diagnostics: window.__PW_DIAGNOSTICS__ ?? null }));
    assert.equal(late.renderer.requestedBackend, scenario.backend); assert.equal(late.renderer.backend, scenario.backend);
    assert.equal(late.renderer.contextLost, false); assert.equal(late.renderer.fallbackReason, null);
    assert.deepEqual(late.diagnostics?.contextLosses ?? [], []); assert.deepEqual(late.diagnostics?.unhandledRejections ?? [], []); assert.deepEqual(late.diagnostics?.windowErrors ?? [], []);
    assert.deepEqual(consoleErrors, []); assert.deepEqual(warnings, []); assert.deepEqual(pageErrors, []);
    result = {
      name: scenario.name, status: 'passed', requestedBackend: scenario.backend, resolvedBackend: late.renderer.backend,
      quality: late.renderer.quality, pixelRatio: late.renderer.pixelRatio, display: late.renderer.display, counters: counters(late.renderer),
      geometry: { active, paused, resize }, staticSleep: { paused: pausedSleep, map: mapSleep }, highRefresh,
      reducedMotion: { map: reducedMap, renderer: reducedRenderer },
      fullscreen: { status: 'skipped', reason: active.fullscreenControl ? 'No stable app-owned fullscreen action is exposed.' : 'No fullscreen UI control is exposed; app-owned mobile-game-active geometry was tested instead.' },
      screenshots, pausedFrameHash: hash(frameOne), ignoredDriverWarnings, elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    failure = error; result = { name: scenario.name, status: 'failed', error: error.stack ?? String(error), console: { consoleErrors, warnings, pageErrors }, elapsedMs: Date.now() - startedAt };
  } finally {
    if (page && !page.isClosed()) {
      try { result.finalLateHealth = await page.evaluate(() => ({ renderer: window.__GASSI_RENDERER_DEBUG__?.() ?? null, diagnostics: window.__PW_DIAGNOSTICS__ ?? null })); }
      catch (error) { result.finalLateHealthError = String(error); }
    }
    await context.close();
    if (video) {
      const original = await video.path().catch(() => null);
      if (original) {
        const target = join(artifactDir, `${scenario.name}.webm`); if (original !== target) await rename(original, target);
        const info = await stat(target); result.video = { path: target, bytes: info.size, recordedMs: Date.now() - startedAt };
        if (!failure && (info.size <= 20_000 || result.video.recordedMs < 3_000)) {
          failure = new Error(`[${scenario.name}] WebM artifact is too small or shorter than three seconds`); result.status = 'failed'; result.error = failure.stack;
        }
      }
    }
  }
  return result;
}

async function probeWebGpu(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625 });
  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl}?renderer=canvas2d`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    return await page.evaluate(async () => {
      if (!navigator.gpu) return { available: false, reason: 'navigator.gpu is not exposed' };
      try { return await navigator.gpu.requestAdapter() ? { available: true, reason: null } : { available: false, reason: 'requestAdapter() returned null' }; }
      catch (error) { return { available: false, reason: `requestAdapter() failed: ${error?.message ?? error}` }; }
    });
  } finally { await context.close(); }
}

async function main() {
  await mkdir(RUN_DIR, { recursive: true });
  const summary = { runId: RUN_ID, startedAt: new Date().toISOString(), server: null, scenarios: [], skips: [] };
  let server; let browser; let failure = null;
  try {
    const requestedPort = await ephemeralPort();
    server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: requestedPort, strictPort: true } });
    await server.listen();
    const address = server.httpServer?.address(); assert.ok(address && typeof address !== 'string' && address.port > 0, 'Vite did not bind an ephemeral port');
    assert.equal(address.port, requestedPort, 'Vite did not bind the OS-assigned port');
    const baseUrl = `http://127.0.0.1:${address.port}/`; summary.server = { host: '127.0.0.1', requestedPort, port: address.port, baseUrl };
    browser = await chromium.launch({ headless: true });
    const matrix = [...BASE_MATRIX]; const webGpu = await probeWebGpu(browser, baseUrl);
    if (webGpu.available) matrix.push({ name: 'mobile-412-dpr2625-webgpu', width: 412, height: 915, deviceScaleFactor: 2.625, backend: 'webgpu', mobile: true });
    else summary.skips.push({ scenario: 'mobile-412-dpr2625-webgpu', status: 'skipped', reason: webGpu.reason });
    const only = process.env.GASSI_BROWSER_SCENARIO;
    for (const scenario of only ? matrix.filter((item) => item.name === only) : matrix) {
      process.stdout.write(`\n[browser] ${scenario.name} ... `); const result = await runScenario(browser, baseUrl, scenario); summary.scenarios.push(result); process.stdout.write(`${result.status}\n`);
      if (result.status !== 'passed') process.stderr.write(`${result.error}\n`);
    }
    const failed = summary.scenarios.filter((item) => item.status !== 'passed'); if (failed.length) failure = new Error(`${failed.length} browser scenario(s) failed: ${failed.map((item) => item.name).join(', ')}`);
    if (only && summary.scenarios.length === 0) failure = new Error(`Unknown browser scenario: ${only}`);
  } catch (error) { failure = error; }
  finally {
    summary.finishedAt = new Date().toISOString(); summary.status = failure ? 'failed' : 'passed'; summary.error = failure ? (failure.stack ?? String(failure)) : null;
    await writeFile(join(RUN_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    if (browser) await browser.close(); if (server) await server.close();
  }
  if (failure) throw failure;
  process.stdout.write(`\nBrowser matrix passed. Artifacts: ${RUN_DIR}\n`);
}

await main();
