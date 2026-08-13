import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { captureLocatorPngVisualHealth } from '../../../tools/browser-visual-health.mjs';
import {
  assertActionableBoundingBox,
  assertBrowserCoverage,
  assertDprContract,
  assertFinalHealth,
  assertHighRefreshResult,
  assertStableResourceWindow,
  highRefreshCaptureTimeout,
  assertRadarPresentationContract,
  assertRequiredArtifacts,
  assertRectNear,
  assertReducedPostProcess,
  assertReducedRadarMotion,
  assertVideoEvidence,
  assertWebGpuDisposition,
  readRendererCounters,
  settleCleanup,
} from './browser-regression-contracts.mjs';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN_ID = `run-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
const RUN_DIR = join(gameRoot, 'output', 'playwright', 'game', RUN_ID);
const SAVE_KEY = 'gassi-runde-hals-save';
const APP_WARNING = /(?:renderer|webgl|webgpu|svelte|unhandled|context\s*lost|gassi)/i;
const FIXED_STEP_TOLERANCE = (5.8 / 120) + 0.006;
const HIGH_REFRESH_START = Object.freeze({ x: 1, y: 1 });
const HIGH_REFRESH_SPEED = 5.8;
const HIGH_REFRESH_TURN_X = 23;
const HIGH_REFRESH_TURN_DELAY_MS = 3_400;
const MATRIX_PROFILES = [
  { name: 'mobile-390-dpr3-60hz', width: 390, height: 844, deviceScaleFactor: 3, mobile: true, refreshRate: 60 },
  { name: 'mobile-412-dpr2625-60hz', width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, refreshRate: 60 },
  { name: 'mobile-448-dpr3-120hz', width: 448, height: 998, deviceScaleFactor: 3, mobile: true, refreshRate: 120 },
  { name: 'landscape-915-dpr2625-60hz', width: 915, height: 412, deviceScaleFactor: 2.625, mobile: true, refreshRate: 60 },
  { name: 'desktop-60hz', width: 1366, height: 768, deviceScaleFactor: 1, refreshRate: 60 },
  { name: 'desktop-120hz', width: 1366, height: 768, deviceScaleFactor: 1, refreshRate: 120 },
  { name: 'desktop-175hz', width: 1366, height: 768, deviceScaleFactor: 1, refreshRate: 175 },
  { name: 'mobile-reduced-motion-60hz', width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, refreshRate: 60, reducedMotion: 'reduce' },
];
const BASE_MATRIX = ['webgl2', 'canvas2d'].flatMap((backend) => MATRIX_PROFILES.map((profile) => ({
  ...profile, name: `${profile.name}-${backend}`, backend, rafHz: profile.refreshRate,
})));

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function listenHttp(server) {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string' && address.port > 0, 'Node HTTP server did not bind an ephemeral port');
  return address;
}

async function closeHttp(server) {
  if (!server?.listening) return;
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
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
  let lastNative = Number.NaN; let virtualTimestamp = 0; let nativeFrames = 0; let epoch = 0; let marked = false; let captured = null; let radarSamples = [];
  const sampleRadar = () => {
    const radar = window.__GASSI_DEBUG__?.().radar;
    const container = document.querySelector('#cat-radar');
    if (!radar?.frame || !container) return null;
    const containerRect = container.getBoundingClientRect();
    const viewport = radar.frame.camera.viewport;
    return {
      radar,
      viewport: {
        left: containerRect.left + viewport.x,
        top: containerRect.top + viewport.y,
        right: containerRect.left + viewport.x + viewport.width,
        bottom: containerRect.top + viewport.y + viewport.height,
      },
      bubbles: [...container.querySelectorAll('.cat-indicator:not([hidden])')].map((indicator) => {
        const rect = indicator.getBoundingClientRect();
        const arrow = indicator.querySelector('.cat-indicator-arrow');
        return {
          id: indicator.dataset.catId,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          angle: Number.parseFloat(arrow?.style.getPropertyValue('--cat-angle')),
        };
      }),
    };
  };
  window.requestAnimationFrame = (callback) => nativeRaf((nativeTimestamp) => {
    if (nativeTimestamp !== lastNative) { lastNative = nativeTimestamp; virtualTimestamp += step; nativeFrames += 1; }
    callback(virtualTimestamp);
    if (marked && !captured) {
      const radarSample = sampleRadar();
      if (radarSample) radarSamples.push(radarSample);
    }
    if (marked && !captured && virtualTimestamp - epoch >= 5_000 && window.__GASSI_DEBUG__ && window.__GASSI_RENDERER_DEBUG__) {
      captured = { game: window.__GASSI_DEBUG__(), renderer: window.__GASSI_RENDERER_DEBUG__(), radarSamples, raf: { hz: rafHz, step, nativeFrames, virtualTimestamp, elapsed: virtualTimestamp - epoch } };
    }
  });
  window.cancelAnimationFrame = nativeCancel;
  window.__PW_RAF__ = {
    mark() { epoch = virtualTimestamp; marked = true; captured = null; radarSamples = []; return epoch; },
    elapsed() { return virtualTimestamp - epoch; },
    captured() { return captured; },
    snapshot() { return { hz: rafHz, step, nativeFrames, virtualTimestamp, elapsed: virtualTimestamp - epoch }; },
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
      const current = readRendererCounters(debug, scenario);
      if (previous && JSON.stringify(current) === JSON.stringify(previous)) return current;
      previous = current;
    }
    await delay(80);
  }
  throw new Error(`[${scenario}] ${policy} render state did not settle`);
}

async function assertStaticSleep(page, scenario, policy, label, durationMs = 5_000) {
  const before = await settleStatic(page, scenario, policy);
  const startedAt = Date.now();
  await delay(durationMs);
  const after = readRendererCounters(await page.evaluate(() => window.__GASSI_RENDERER_DEBUG__?.() ?? null), scenario);
  assert.deepEqual(after, before, `[${scenario}] ${label} advanced while static`);
  return { durationMs: Date.now() - startedAt, before, after };
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
      viewport: { width: innerWidth, height: innerHeight }, browserDpr: devicePixelRatio, canvas: rect('#game'), header: rect('#mobile-game-header'),
      board: rect('.board-column'), boardFrame: rect('.board-frame'), overlay: rect('.game-overlay'),
      cssSize: { width: canvas.clientWidth, height: canvas.clientHeight },
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

function assertGeometryDpr(value, scenario) {
  assertDprContract({
    browserDpr: value.browserDpr,
    expectedDpr: scenario.deviceScaleFactor,
    renderer: value.renderer,
    cssWidth: value.cssSize?.width,
    cssHeight: value.cssSize?.height,
    bufferWidth: value.buffer?.width,
    bufferHeight: value.buffer?.height,
  }, scenario.name);
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

async function canvasVisualHealth(page, artifactDir, scenario) {
  return captureLocatorPngVisualHealth(page.locator('#game'), join(artifactDir, 'active-level-compositor.png'), scenario);
}

async function enterLevel(page, scenario) {
  const marker = page.locator('[data-level-id="home"] .map-marker');
  await marker.waitFor({ state: 'visible', timeout: 12_000 });
  const markerState = {
    visible: await marker.isVisible(),
    enabled: await marker.isEnabled(),
    box: await marker.boundingBox(),
    viewport: page.viewportSize(),
  };
  assertActionableBoundingBox(markerState, scenario.name);
  await page.mouse.click(markerState.box.x + markerState.box.width / 2, markerState.box.y + markerState.box.height / 2);
  await page.locator('#map-start-button').click();
  await page.locator('#overlay-button').waitFor({ state: 'visible', timeout: 12_000 });
  await page.locator('#overlay-button').click();
  const skip = page.locator('#level-cutscene-skip');
  if (await skip.isVisible({ timeout: 2_000 }).catch(() => false)) await skip.click();
  await waitFor(page, scenario.name, ({ game }) => game?.state === 'playing' && game.radar?.frame, 'presented active gameplay');
  await page.evaluate(() => {
    if (typeof window.__GASSI_DEBUG_SET_CATS__ !== 'function') throw new Error('Cat debug positioning is unavailable');
    const game = window.__GASSI_DEBUG__();
    const count = game.radar.frame?.cats?.length;
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Presented cat count is unavailable');
    window.__GASSI_DEBUG_SET_CATS__(Array.from({ length: count }, (_, index) => ({ x: 40 + index, y: 4 })));
  });
  await waitFor(page, scenario.name, ({ game }) => game?.radar?.state?.visible === true, 'active offscreen cat radar');
  await page.keyboard.press('ArrowLeft');
}

async function highRefreshWindow(page, scenario) {
  await page.keyboard.press('KeyP');
  await waitFor(page, scenario.name, ({ game }) => game?.state === 'paused', 'high-Hz baseline pause');
  await page.evaluate(({ player, cat }) => {
    const game = window.__GASSI_DEBUG__();
    window.__GASSI_DEBUG_SET_PLAYER__(player.x, player.y);
    window.__GASSI_DEBUG_SET_CATS__(Array.from({ length: game.radar.frame.cats.length }, (_, index) => ({ x: cat.x + index, y: cat.y })));
  }, { player: HIGH_REFRESH_START, cat: { x: 40, y: 4 } });
  await waitFor(page, scenario.name, ({ game }) => game?.state === 'paused' && game.player?.x === HIGH_REFRESH_START.x && game.player?.y === HIGH_REFRESH_START.y, 'deterministic paused high-Hz fixture');
  await page.locator('#overlay-button').click();
  const baseline = await page.evaluate((player) => {
    if (window.__GASSI_DEBUG__().state !== 'playing') throw new Error('high-Hz resume was not confirmed before mark');
    window.__GASSI_DEBUG_SET_PLAYER__(player.x, player.y);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    const game = window.__GASSI_DEBUG__();
    return { player: game.player, radar: game.radar, renderer: window.__GASSI_RENDERER_DEBUG__(), mark: window.__PW_RAF__.mark() };
  }, HIGH_REFRESH_START);
  const sampleAt = async (targetMs) => {
    const sampleHandle = await page.waitForFunction((target) => window.__PW_RAF__.elapsed() >= target
      ? { elapsedMs: window.__PW_RAF__.elapsed(), player: window.__GASSI_DEBUG__().player }
      : false, targetMs);
    const sample = await sampleHandle.jsonValue();
    await sampleHandle.dispose();
    const seconds = sample.elapsedMs / 1_000;
    const horizontalSeconds = (HIGH_REFRESH_TURN_X - HIGH_REFRESH_START.x) / HIGH_REFRESH_SPEED;
    return {
      ...sample,
      expectedPlayer: seconds <= horizontalSeconds
        ? { x: HIGH_REFRESH_START.x + HIGH_REFRESH_SPEED * seconds, y: HIGH_REFRESH_START.y }
        : { x: HIGH_REFRESH_TURN_X, y: HIGH_REFRESH_START.y + HIGH_REFRESH_SPEED * (seconds - horizontalSeconds) },
    };
  };
  const trajectorySamples = [await sampleAt(1_000), await sampleAt(2_000), await sampleAt(3_000)];
  await page.waitForFunction((target) => window.__PW_RAF__.elapsed() >= target, HIGH_REFRESH_TURN_DELAY_MS);
  await page.keyboard.press('ArrowDown');
  trajectorySamples.push(await sampleAt(4_000));
  await page.waitForFunction(() => window.__PW_RAF__.captured(), null, { timeout: highRefreshCaptureTimeout(scenario.refreshRate) });
  const measured = await page.evaluate(() => window.__PW_RAF__.captured());
  const finalSeconds = measured.raf.elapsed / 1_000;
  const horizontalSeconds = (HIGH_REFRESH_TURN_X - HIGH_REFRESH_START.x) / HIGH_REFRESH_SPEED;
  const expectedPlayer = { x: HIGH_REFRESH_TURN_X, y: HIGH_REFRESH_START.y + HIGH_REFRESH_SPEED * (finalSeconds - horizontalSeconds) };
  trajectorySamples.push({ elapsedMs: measured.raf.elapsed, player: measured.game.player, expectedPlayer });
  await page.keyboard.press('KeyP');
  await waitFor(page, scenario.name, ({ game }) => game?.state === 'paused', 'high-Hz final pause');
  const baselineCounters = readRendererCounters(baseline.renderer, scenario.name);
  const measuredCounters = readRendererCounters(measured.renderer, scenario.name);
  const presentationDelta = measuredCounters.rendererFrames - baselineCounters.rendererFrames;
  const resourceStability = assertStableResourceWindow(baselineCounters, measuredCounters, scenario.name);
  const positionError = Math.hypot(measured.game.player.x - expectedPlayer.x, measured.game.player.y - expectedPlayer.y);
  assertHighRefreshResult({ presentationDelta, durationMs: measured.raf.elapsed, refreshRate: scenario.refreshRate, positionError, tolerance: FIXED_STEP_TOLERANCE, baselinePlayer: baseline.player, finalPlayer: measured.game.player, expectedPlayer, trajectorySamples }, scenario.name);
  const radar = assertRadarPresentationContract({ presentationDelta, baselineRadar: baseline.radar, measuredRadar: measured.game.radar, samples: measured.radarSamples }, scenario.name);
  return { durationMs: measured.raf.elapsed, baselinePlayer: baseline.player, finalPlayer: measured.game.player, expectedPlayer, trajectorySamples, positionError, presentationDelta, resourceStability, radar, raf: measured.raf };
}
async function reducedRadarMotion(page, scenario) {
  const player = await page.evaluate(() => window.__GASSI_DEBUG__().player);
  const candidates = [
    { x: player.x + 5, y: player.y },
    { x: player.x - 5, y: player.y },
    { x: player.x, y: player.y + 5 },
    { x: player.x, y: player.y - 5 },
  ];
  let before = null;
  for (const position of candidates) {
    const updateCount = await page.evaluate((next) => {
      const game = window.__GASSI_DEBUG__();
      const count = game.radar.frame.cats.length;
      window.__GASSI_DEBUG_SET_CATS__(Array.from({ length: count }, () => next));
      return game.radar.updateCount;
    }, position);
    const state = await waitFor(page, scenario.name, ({ game }) => (
      game?.radar?.updateCount > updateCount
      && game.radar.state.visible
      && game.radar.state.indicators.some((indicator) => !indicator.hidden && indicator.danger)
    ), 'model-dangerous offscreen radar', 500).catch(() => null);
    if (!state) continue;
    before = await page.evaluate(() => {
      const indicator = document.querySelector('.cat-indicator:not([hidden])');
      if (!indicator) throw new Error('Visible radar indicator is missing');
      const modelIndicator = window.__GASSI_DEBUG__().radar.state.indicators.find((candidate) => !candidate.hidden);
      return {
        animationName: getComputedStyle(indicator, '::before').animationName,
        beforeTransform: indicator.style.transform,
        updateCount: window.__GASSI_DEBUG__().radar.updateCount,
        modelDanger: modelIndicator?.danger,
        indicatorDanger: indicator.classList.contains('danger'),
      };
    });
    break;
  }
  if (!before) throw new Error('[' + scenario.name + '] no model-dangerous offscreen cat position was available');
  const updateCount = await page.evaluate(() => {
    const count = window.__GASSI_DEBUG__().radar.updateCount;
    window.__GASSI_DEBUG_SET_PLAYER__(7, 4);
    const catCount = window.__GASSI_DEBUG__().radar.frame.cats.length;
    window.__GASSI_DEBUG_SET_CATS__(Array.from({ length: catCount }, () => ({ x: 7, y: -1 })));
    return count;
  });
  await waitFor(page, scenario.name, ({ game }) => (
    game?.radar?.updateCount > updateCount
    && game.player.x === 7 && game.player.y === 4
    && game.radar.state.visible
    && game.radar.state.indicators.some((indicator) => !indicator.hidden && indicator.danger)
  ), 'relocated model-dangerous offscreen radar');
  const afterTransform = await page.locator('.cat-indicator:not([hidden])').first().evaluate((indicator) => indicator.style.transform);
  const result = { ...before, afterTransform, geometryMode: 'dev-player-relocation' };
  assertReducedRadarMotion(result, scenario.name);
  return result;
}

async function directPlayingToMap(page, scenario, artifactDir) {
  if (scenario.mobile) return { status: 'not-applicable', reason: 'Desktop sidepanel command is not part of the mobile layout.' };
  const transition = await page.evaluate(() => {
    const before = window.__GASSI_DEBUG__().radar;
    document.querySelector('#map-button').click();
    const after = window.__GASSI_DEBUG__().radar;
    const container = document.querySelector('#cat-radar');
    return {
      state: window.__GASSI_DEBUG__().state,
      beforeUpdateCount: before.updateCount,
      afterUpdateCount: after.updateCount,
      frame: after.frame,
      radarVisible: after.state.visible,
      indicatorCount: after.state.indicators.length,
      nodeCount: container.querySelectorAll('.cat-indicator').length,
      containerHidden: container.hidden,
    };
  });
  const label = '[' + scenario.name + '] ';
  assert.equal(transition.state, 'map', label + 'direct map action did not transition synchronously');
  assert.equal(transition.afterUpdateCount, transition.beforeUpdateCount, label + 'map cleanup faked a radar presentation');
  assert.equal(transition.frame, null, label + 'map cleanup retained a stale presentation frame');
  assert.equal(transition.radarVisible, false, label + 'radar remained visible over the map');
  assert.equal(transition.indicatorCount, 0, label + 'radar diagnostics retained indicators over the map');
  assert.equal(transition.nodeCount, 0, label + 'radar DOM remained over the map');
  assert.equal(transition.containerHidden, true, label + 'radar container remained exposed over the map');
  await page.locator('#map-screen').waitFor({ state: 'visible' });
  const screenshot = await shot(page, artifactDir, 'direct-map-return');
  await enterLevel(page, scenario);
  const resumedGeometry = await waitForGameGeometry(page, scenario);
  return { status: 'exercised', ...transition, screenshot, resumedGeometry };
}

async function waitForGameGeometry(page, scenario, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    const value = await geometry(page);
    try {
      assertGeometryDpr(value, scenario);
      if (scenario.mobile) assertMobileGeometry(value, scenario);
      return value;
    } catch (error) {
      lastError = error;
      await delay(40);
    }
  }
  throw lastError ?? new Error('[' + scenario.name + '] gameplay geometry did not settle');
}

async function resizeRoundTrip(page, scenario, artifactDir) {
  const rotated = scenario.mobile ? { width: scenario.height, height: scenario.width } : { width: 1180, height: 700 };
  await page.setViewportSize(rotated); await delay(250);
  const changed = await geometry(page);
  assertGeometryDpr(changed, scenario);
  if (scenario.mobile) assertMobileGeometry(changed, { ...scenario, ...rotated });
  const screenshot = await shot(page, artifactDir, 'post-resize');
  await page.setViewportSize({ width: scenario.width, height: scenario.height }); await delay(250);
  const restored = await geometry(page);
  assertGeometryDpr(restored, scenario);
  if (scenario.mobile) assertMobileGeometry(restored, scenario);
  return { rotated, changed, restored, screenshot };
}

async function exerciseFullscreen(page, scenario, active) {
  if (!active.fullscreenControl) return { status: 'skipped', reason: 'No app-owned fullscreen UI control is exposed.' };
  if (!active.fullscreenEnabled) return { status: 'skipped', reason: 'The Fullscreen API is unsupported in this browser context.' };
  const control = page.locator('[data-fullscreen-control], #mobile-fullscreen-button').first();
  const controlState = {
    visible: await control.isVisible(),
    enabled: await control.isEnabled(),
    box: await control.boundingBox(),
    viewport: page.viewportSize(),
  };
  assertActionableBoundingBox(controlState, `${scenario.name}:fullscreen-control`);
  await control.click({ timeout: 12_000 });
  await page.waitForFunction(() => Boolean(document.fullscreenElement), null, { timeout: 8_000 });
  const entered = await geometry(page);
  assertGeometryDpr(entered, scenario);
  if (scenario.mobile) assertMobileGeometry(entered, scenario);
  await page.keyboard.press('KeyP');
  await waitFor(page, scenario.name, ({ game }) => game?.state === 'paused', 'fullscreen pause');
  const fullscreenPaused = await geometry(page);
  assertGeometryDpr(fullscreenPaused, scenario);
  if (scenario.mobile) assertMobileGeometry(fullscreenPaused, scenario);
  assertRectNear(fullscreenPaused.overlay, fullscreenPaused.boardFrame, 1, scenario.name, 'fullscreen pause overlay');
  await page.locator('#overlay-button').click();
  await waitFor(page, scenario.name, ({ game }) => game?.state === 'playing', 'fullscreen resume');
  const exitControl = page.locator('[data-fullscreen-control], #mobile-fullscreen-button').first();
  await exitControl.click({ timeout: 12_000 });
  await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 8_000 });
  return { status: 'exercised', entered, paused: fullscreenPaused };
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

function markScenarioFailed(result, scenario, error, startedAt) {
  const message = error?.stack ?? String(error);
  const errors = [...(result?.errors ?? []), message];
  return {
    ...(result ?? {}),
    name: scenario.name,
    status: 'failed',
    error: errors.join('\n\n'),
    errors,
    elapsedMs: Date.now() - startedAt,
  };
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
      const video = document.querySelector('#probe');
      const objectUrl = URL.createObjectURL(file);
      try {
        video.src = objectUrl;
        await new Promise((resolveMetadata, rejectMetadata) => {
          const timeout = setTimeout(() => rejectMetadata(new Error(`[${scenarioName}] timed out reading WebM metadata`)), 10_000);
          video.addEventListener('loadedmetadata', () => { clearTimeout(timeout); resolveMetadata(); }, { once: true });
          video.addEventListener('error', () => { clearTimeout(timeout); rejectMetadata(new Error(`[${scenarioName}] WebM metadata is unreadable`)); }, { once: true });
        });
        if (!Number.isFinite(video.duration)) {
          await new Promise((resolveDuration, rejectDuration) => {
            const timeout = setTimeout(() => rejectDuration(new Error(`[${scenarioName}] timed out resolving WebM duration`)), 10_000);
            video.addEventListener('timeupdate', () => { clearTimeout(timeout); resolveDuration(); }, { once: true });
            video.currentTime = Number.MAX_SAFE_INTEGER;
          });
        }
        return video.duration;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }, scenario);
  } finally {
    await context.close();
  }
}
async function runScenario(browser, baseUrl, scenario) {
  const artifactDir = join(RUN_DIR, scenario.name); await mkdir(artifactDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height }, deviceScaleFactor: scenario.deviceScaleFactor,
    isMobile: Boolean(scenario.mobile), hasTouch: Boolean(scenario.mobile), reducedMotion: scenario.reducedMotion ?? 'no-preference',
    recordVideo: { dir: artifactDir, size: { width: scenario.width, height: scenario.height } },
  });
  const startedAt = Date.now(); let page; let video; let result;
  const consoleErrors = []; const warnings = []; const ignoredDriverWarnings = []; const pageErrors = []; const crashes = []; const screenshots = [];
  try {
    page = await context.newPage(); video = page.video();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
      if (message.type() === 'warning' && /GL Driver Message.*ReadPixels/i.test(message.text())) ignoredDriverWarnings.push(message.text());
      else if (message.type() === 'warning' && APP_WARNING.test(message.text())) warnings.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    page.on('crash', () => crashes.push('Playwright page crash event'));
    await page.addInitScript(initBrowserState, { save: deterministicSave(scenario), rafHz: scenario.rafHz ?? null });
    await page.goto(`${baseUrl}?renderer=${scenario.backend}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    const ready = await waitFor(page, scenario.name, ({ game, renderer }) => game?.state === 'map' && renderer?.backend && renderer.backend !== 'initializing', 'startup', 20_000);
    assert.equal(ready.renderer.requestedBackend, scenario.backend, `[${scenario.name}] requested backend not recorded`);
    assert.equal(ready.renderer.backend, scenario.backend, `[${scenario.name}] resolved backend ${ready.renderer.backend}`);
    assert.equal(ready.renderer.fallbackReason, null, `[${scenario.name}] unexpected fallback`);
    readRendererCounters(ready.renderer, `${scenario.name}:startup`);
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
    const visualEvidence = await canvasVisualHealth(page, artifactDir, scenario.name);
    const visualHealth = visualEvidence.sample; screenshots.push(visualEvidence.artifact);
    const active = await geometry(page); assertGeometryDpr(active, scenario); if (scenario.mobile) assertMobileGeometry(active, scenario);
    const reducedRadar = scenario.reducedMotion === 'reduce' ? await reducedRadarMotion(page, scenario) : null;
    const directMap = await directPlayingToMap(page, scenario, artifactDir);
    if (directMap.status === 'exercised') screenshots.push(directMap.screenshot);
    const fullscreen = await exerciseFullscreen(page, scenario, directMap.resumedGeometry ?? active);
    const highRefresh = await highRefreshWindow(page, scenario);
    const paused = await geometry(page); assertGeometryDpr(paused, scenario); if (scenario.mobile) assertMobileGeometry(paused, scenario);
    assertRectNear(paused.overlay, paused.boardFrame, 1, scenario.name, 'pause overlay');
    screenshots.push(await shot(page, artifactDir, 'paused-level'));
    const pausedSleep = await assertStaticSleep(page, scenario.name, 'once', 'paused level');
    const frameOne = await page.locator('#game').screenshot(); await delay(300); const frameTwo = await page.locator('#game').screenshot();
    assert.equal(hash(frameOne), hash(frameTwo), `[${scenario.name}] paused canvas flickers`);
    const resize = await resizeRoundTrip(page, scenario, artifactDir);
    screenshots.push(resize.screenshot);
    const reducedRenderer = scenario.reducedMotion === 'reduce' ? await page.evaluate(() => window.__GASSI_RENDERER_DEBUG__?.().postProcess ?? null) : null;
    if (scenario.reducedMotion === 'reduce') assertReducedPostProcess(reducedRenderer, scenario.name);
    await returnMap(page, scenario); screenshots.push(await shot(page, artifactDir, 'map-return'));
    const mapSleep = await assertStaticSleep(page, scenario.name, 'hidden', 'map');
    const remaining = 3_200 - (Date.now() - startedAt); if (remaining > 0) await delay(remaining);
    const late = await page.evaluate(() => ({ renderer: window.__GASSI_RENDERER_DEBUG__?.() ?? null, game: window.__GASSI_DEBUG__?.() ?? null }));
    result = {
      name: scenario.name, status: 'passed', backend: scenario.backend, requestedBackend: scenario.backend, resolvedBackend: late.renderer?.backend,
      width: scenario.width, height: scenario.height, deviceScaleFactor: scenario.deviceScaleFactor,
      refreshRate: scenario.refreshRate, reducedMotionEnabled: scenario.reducedMotion === 'reduce',
      quality: late.renderer?.quality, pixelRatio: late.renderer?.pixelRatio, display: late.renderer?.display,
      counters: readRendererCounters(late.renderer, `${scenario.name}:result`),
      geometry: { active, paused, resize }, staticSleep: { paused: pausedSleep, map: mapSleep }, highRefresh,
      reducedMotion: { map: reducedMap, renderer: reducedRenderer, radar: reducedRadar }, directMap, fullscreen,
      screenshots, visualHealth, pausedFrameHash: hash(frameOne), ignoredDriverWarnings, elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    result = markScenarioFailed(result, scenario, error, startedAt);
  } finally {
    if (page && !page.isClosed()) {
      try {
        const finalLateHealth = await page.evaluate(() => ({
          renderer: window.__GASSI_RENDERER_DEBUG__?.() ?? null,
          diagnostics: window.__PW_DIAGNOSTICS__ ?? null,
        }));
        result = { ...(result ?? {}), finalLateHealth };
        assertFinalHealth({ scenario: scenario.name, expectedBackend: scenario.backend, health: finalLateHealth, consoleErrors, warnings, pageErrors, crashes });
      } catch (error) {
        result = markScenarioFailed(result, scenario, error, startedAt);
      }
    } else {
      result = markScenarioFailed(result, scenario, new Error(`[${scenario.name}] page was unavailable for final health evaluation`), startedAt);
    }

    try {
      await context.close();
    } catch (error) {
      result = markScenarioFailed(result, scenario, error, startedAt);
    }

    try {
      assert.ok(video && typeof video === 'object', `[${scenario.name}] Playwright video object is missing`);
      const original = await video.path();
      assert.ok(typeof original === 'string' && original.length > 0, `[${scenario.name}] Playwright video path is missing`);
      const target = join(artifactDir, `${scenario.name}.webm`);
      if (original !== target) await rename(original, target);
      const info = await stat(target);
      const durationSeconds = await webmDurationSeconds(browser, target, scenario.name);
      result = { ...(result ?? {}), video: { path: target, bytes: info.size, durationSeconds } };
      assertVideoEvidence({ video, path: target, bytes: info.size, durationSeconds }, scenario.name);
    } catch (error) {
      result = markScenarioFailed(result, scenario, error, startedAt);
    }
  }
  result.console = { consoleErrors, warnings, pageErrors, crashes };
  result.elapsedMs = Date.now() - startedAt;
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
  let viteServer; let httpServer; let browser; let failure = null;
  try {
    viteServer = await createServer({ root: gameRoot, logLevel: 'error', appType: 'spa', server: { middlewareMode: true } });
    httpServer = createHttpServer(viteServer.middlewares);
    const address = await listenHttp(httpServer);
    const baseUrl = `http://127.0.0.1:${address.port}/`;
    summary.server = { host: '127.0.0.1', port: address.port, baseUrl, assignment: 'node-http-listen-0' };
    browser = await chromium.launch({ headless: true });
    const matrix = [...BASE_MATRIX]; const webGpu = await probeWebGpu(browser, baseUrl);
    if (webGpu.available) matrix.push({ name: 'mobile-412-dpr2625-60hz-webgpu', width: 412, height: 915, deviceScaleFactor: 2.625, backend: 'webgpu', mobile: true, refreshRate: 60, rafHz: 60 });
    else summary.skips.push({ scenario: 'mobile-412-dpr2625-60hz-webgpu', status: 'skipped', reason: webGpu.reason });
    const only = process.env.GASSI_BROWSER_SCENARIO;
    for (const scenario of only ? matrix.filter((item) => item.name === only) : matrix) {
      process.stdout.write(`\n[browser] ${scenario.name} ... `); const result = await runScenario(browser, baseUrl, scenario); summary.scenarios.push(result); process.stdout.write(`${result.status}\n`);
      if (result.status !== 'passed') process.stderr.write(`${result.error}\n`);
    }
    const webGpuResult = summary.scenarios.find((item) => item.backend === 'webgpu');
    summary.webGpu = webGpu.available
      ? { status: webGpuResult?.status === 'passed' ? 'passed' : 'failed', resolvedBackend: webGpuResult?.resolvedBackend ?? null }
      : { status: 'skipped', reason: webGpu.reason };
    assertWebGpuDisposition(webGpu, summary.webGpu);
    if (!only) {
      assertBrowserCoverage(summary.scenarios.map((item) => ({ ...item, reducedMotion: item.reducedMotionEnabled })), { requirePixel120: true });
      assertRequiredArtifacts(summary.scenarios.map((item) => ({
        screenshot: item.screenshots?.find((artifact) => artifact.path.endsWith('active-level.png')),
        video: item.video,
      })), matrix.length);
    }
    const failed = summary.scenarios.filter((item) => item.status !== 'passed'); if (failed.length) failure = new Error(`${failed.length} browser scenario(s) failed: ${failed.map((item) => item.name).join(', ')}`);
    if (only && summary.scenarios.length === 0) failure = new Error(`Unknown browser scenario: ${only}`);
  } catch (error) {
    failure = error;
  } finally {
    const cleanupErrors = await settleCleanup([
      { name: 'browser', close: async () => { if (browser) await browser.close(); } },
      { name: 'http', close: async () => { await closeHttp(httpServer); } },
      { name: 'vite', close: async () => { if (viteServer) await viteServer.close(); } },
    ]);
    if (cleanupErrors.length) failure = failure
      ? new AggregateError([failure, ...cleanupErrors], 'Browser regression run and cleanup failed')
      : new AggregateError(cleanupErrors, 'Browser regression cleanup failed');
    summary.finishedAt = new Date().toISOString(); summary.status = failure ? 'failed' : 'passed'; summary.error = failure ? (failure.stack ?? String(failure)) : null;
    try {
      await writeFile(join(RUN_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'Browser regression run and summary write failed') : error;
    }
  }
  if (failure) throw failure;
  process.stdout.write(`\nBrowser matrix passed. Artifacts: ${RUN_DIR}\n`);
}

await main();
