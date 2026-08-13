import assert from 'node:assert/strict';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactDirectory = join(projectRoot, 'output', 'playwright', 'renderer');
const runId = `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${process.pid}`;
const benchmarkPath = '/benchmark.html?backend=webgl2&quality=quality&frames=180';
const injectLateConsoleError = process.argv.includes('--inject-late-console-error');
const injectLateContextLoss = process.argv.includes('--inject-late-context-loss');
const pacerOpenWindow = process.argv.includes('--pacer-open-window');
const report = {
  runId,
  generatedAt: new Date().toISOString(),
  scenarios: [],
  pacer: null,
  webgpu: null,
  failure: null,
};

let server;
let browser;

function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = createTcpServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function artifactPath(name, extension) {
  return join(artifactDirectory, `${name}-${runId}.${extension}`);
}

function browserMessages(page) {
  const messages = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      messages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => messages.push({ type: 'pageerror', text: error.message }));
  page.on('crash', () => messages.push({ type: 'crash', text: 'Chromium page crashed.' }));
  return messages;
}

function unexpectedBrowserMessages(messages) {
  return messages.filter(({ type, text }) => type !== 'warning'
    || (!text.includes('GPU stall due to ReadPixels') && text !== 'No available adapters.'));
}

async function webmDurationSeconds(path, name) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent('<input id="video-file" type="file"><video id="probe" muted></video>');
    await page.locator('#video-file').setInputFiles(path);
    return await page.evaluate(async (scenario) => {
      const file = document.querySelector('#video-file').files?.[0];
      if (!file) throw new Error(`${scenario} finalized WebM is missing`);
      const video = document.querySelector('#probe'); const objectUrl = URL.createObjectURL(file);
      try {
        video.src = objectUrl;
        await new Promise((resolveMetadata, rejectMetadata) => {
          const timeout = setTimeout(() => rejectMetadata(new Error(`${scenario} WebM metadata timeout`)), 10_000);
          video.addEventListener('loadedmetadata', () => { clearTimeout(timeout); resolveMetadata(); }, { once: true });
          video.addEventListener('error', () => { clearTimeout(timeout); rejectMetadata(new Error(`${scenario} WebM metadata unreadable`)); }, { once: true });
        });
        if (!Number.isFinite(video.duration)) {
          await new Promise((resolveDuration, rejectDuration) => {
            const timeout = setTimeout(() => rejectDuration(new Error(`${scenario} WebM duration timeout`)), 10_000);
            video.addEventListener('timeupdate', () => { clearTimeout(timeout); resolveDuration(); }, { once: true });
            video.currentTime = Number.MAX_SAFE_INTEGER;
          });
        }
        return video.duration;
      } finally { URL.revokeObjectURL(objectUrl); }
    }, name);
  } finally { await context.close(); }
}

async function preserveVideo(video, name) {
  assert.ok(video, `${name} Playwright video is mandatory`);
  const source = await video.path();
  const target = artifactPath(name, 'webm');
  await rename(source, target);
  const metadata = await stat(target);
  assert.ok(metadata.size > 20_000, `${name} video must contain rendered frames`);
  const durationSeconds = await webmDurationSeconds(target, name);
  assert.ok(durationSeconds >= 5, `${name} video must contain at least five seconds`);
  return { path: target, bytes: metadata.size, durationSeconds };
}

async function runBenchmarkScenario({
  name,
  path,
  viewport,
  deviceScaleFactor,
  reducedMotion = 'no-preference',
  capture = false,
  evaluate,
}) {
  let context;
  let page;
  let video;
  let videoPath;
  let scenario;
  let finalHealthError;
  const startedAt = Date.now();
  const screenshotPath = capture ? artifactPath(name, 'png') : null;
  let messages = [];

  try {
    context = await browser.newContext({
      viewport,
      deviceScaleFactor,
      reducedMotion,
      ...(capture ? { recordVideo: { dir: artifactDirectory, size: viewport } } : {}),
    });
    await context.addInitScript(() => {
      window.__RENDER_CONTEXT_LOSSES__ = [];
      document.addEventListener('webglcontextlost', (event) => {
        window.__RENDER_CONTEXT_LOSSES__.push({ type: event.type, statusMessage: event.statusMessage ?? '' });
      }, true);
    });
    page = await context.newPage();
    video = page.video();
    messages = browserMessages(page);
    await page.goto(`${server.resolvedUrls.local[0].replace(/\/$/, '')}${path}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.__RENDER_BENCHMARK__);

    const runtime = await page.evaluate(() => ({
      renderer: document.querySelector('#benchmark')?.dataset.rendererBackend,
      pixelRatio: devicePixelRatio,
      result: window.__RENDER_BENCHMARK_RESULT__,
      shaderScanlines: window.__RENDER_BENCHMARK_RESULT__?.postProcess?.scanlines,
      navigatorGpu: Boolean(navigator.gpu),
    }));

    assert.ok(runtime.result, `${name} must expose window.__RENDER_BENCHMARK_RESULT__`);
    assert.equal(runtime.renderer, runtime.result.resolvedBackend, `${name} dataset must report the resolved backend`);
    assert.equal(runtime.result.renderer.backend, runtime.result.resolvedBackend, `${name} diagnostics must report the resolved backend`);

    if (capture) {
      const remaining = 5_000 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, remaining));
      assert.ok(Date.now() - startedAt >= 5_000, `${name} must record at least five seconds of camera movement`);
      const screenshot = await page.locator('#benchmark').screenshot({ path: screenshotPath });
      assert.ok(screenshot.byteLength > 8_000, `${name} screenshot must contain rendered pixels`);
    }
    const extra = evaluate ? await evaluate(page, runtime) : null;
    if (name === 'webgl2-fractional-dpr' && injectLateConsoleError) {
      await page.evaluate(() => console.error('late injected console error'));
    }
    if (name === 'webgl2-fractional-dpr' && injectLateContextLoss) {
      await page.evaluate(() => {
        document.querySelector('#benchmark').dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      });
    }
    scenario = {
      name,
      requestedBackend: runtime.result.requestedBackend,
      resolvedBackend: runtime.result.resolvedBackend,
      fallbackReason: runtime.result.fallbackReason,
      pixelRatio: runtime.pixelRatio,
      renderer: runtime.result.renderer,
      postProcess: runtime.result.postProcess,
      contextLosses: [],
      console: messages,
      captureDurationMs: Date.now() - startedAt,
      screenshot: screenshotPath,
      extra,
    };
    report.scenarios.push(scenario);
    return { runtime, scenario };
  } finally {
    if (page && scenario) {
      try {
        const finalHealth = await page.evaluate(() => ({
          contextLosses: [...window.__RENDER_CONTEXT_LOSSES__],
          rendererContextLost: window.__RENDER_BENCHMARK_RESULT__?.renderer?.contextLost,
        }));
        scenario.contextLosses = finalHealth.contextLosses;
        assert.equal(finalHealth.rendererContextLost, false, `${name} renderer must not report context loss`);
        assert.deepEqual(finalHealth.contextLosses, [], `${name} must not lose its WebGL context`);
        assert.deepEqual(unexpectedBrowserMessages(messages), [], `${name} must not emit unexpected browser messages`);
      } catch (error) {
        finalHealthError = error;
      }
    }
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    videoPath = capture ? await preserveVideo(video, name) : null;
    if (scenario) scenario.video = videoPath;
    if (finalHealthError) throw finalHealthError;
  }
}

async function probeWebGpu() {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${server.resolvedUrls.local[0].replace(/\/$/, '')}/benchmark.html?backend=canvas2d&frames=1`, { waitUntil: 'domcontentloaded' });
    return await page.evaluate(async () => {
      if (!navigator.gpu) return { available: false, reason: 'navigator.gpu is not exposed' };
      try {
        return await navigator.gpu.requestAdapter()
          ? { available: true, reason: null }
          : { available: false, reason: 'requestAdapter() returned null' };
      } catch (error) {
        return { available: false, reason: `requestAdapter() failed: ${error?.message ?? error}` };
      }
    });
  } finally { await context.close(); }
}

async function run() {
  await mkdir(artifactDirectory, { recursive: true });
  const port = await availablePort();
  server = await createServer({
    root: projectRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.equal(typeof address, 'object', 'Vite must listen on an ephemeral TCP port');
  assert.equal(address.port, port, 'Vite must use the OS-selected available port');
  assert.notEqual(address.port, 5173, 'Vite must not use its fixed default port');
  report.port = address.port;
  browser = await chromium.launch({ headless: true });

  const webGpuProbe = await probeWebGpu();

  const fractional = await runBenchmarkScenario({
    name: 'webgl2-fractional-dpr',
    path: benchmarkPath,
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    capture: true,
    evaluate: async (_page, runtime) => {
      assert.equal(runtime.pixelRatio, 2.625);
      assert.equal(runtime.renderer, 'webgl2', `WebGL2 fallback: ${runtime.result.fallbackReason ?? 'unknown reason'}`);
      assert.equal(runtime.shaderScanlines, 0);
      return { shaderScanlines: runtime.shaderScanlines };
    },
  });

  await runBenchmarkScenario({
    name: 'webgl2-reduced-motion',
    path: benchmarkPath,
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    reducedMotion: 'reduce',
    capture: true,
    evaluate: async (_page, runtime) => {
      assert.equal(runtime.result.postProcess.scanlines, 0);
      assert.equal(runtime.result.postProcess.rgbSplitTexels, 0);
      return { reducedMotion: runtime.result.reducedMotion };
    },
  });

  const canvas = await runBenchmarkScenario({
    name: 'canvas2d-desktop',
    path: '/benchmark.html?backend=canvas2d&quality=quality&frames=180',
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    capture: true,
    evaluate: async (page, runtime) => {
      assert.equal(runtime.renderer, 'canvas2d', `Canvas2D fallback: ${runtime.result.fallbackReason ?? 'unknown reason'}`);
      return page.evaluate(async (openWindow) => {
        const { PresentationFramePacer } = await import('/src/index.js');
        return [60, 120, 175].map((refreshRate) => {
          const pacer = new PresentationFramePacer({ framesPerSecond: 60 });
          let presentations = 0;
          const frames = Math.round(refreshRate * 2);
          for (let frame = 0; (openWindow ? frame < frames : frame <= frames); frame += 1) {
            if (pacer.shouldPresent(frame * 1000 / refreshRate)) presentations += 1;
          }
          return { refreshRate, presentations };
        });
      }, pacerOpenWindow);
    },
  });
  report.pacer = canvas.scenario.extra;
  assert.deepEqual(report.pacer.map(({ refreshRate }) => refreshRate), [60, 120, 175]);
  for (const { refreshRate, presentations } of report.pacer) {
    assert.ok(presentations <= 121, `${refreshRate} Hz presented ${presentations} frames, above the 121-frame ceiling`);
  }

  if (webGpuProbe.available) {
    const webgpu = await runBenchmarkScenario({
      name: 'webgpu-fractional-dpr',
      path: '/benchmark.html?backend=webgpu&quality=quality&frames=180',
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      capture: true,
      evaluate: async (_page, runtime) => {
        assert.equal(runtime.pixelRatio, 2.625);
        assert.equal(runtime.shaderScanlines, 0);
        return null;
      },
    });
    assert.equal(webgpu.scenario.resolvedBackend, 'webgpu', 'available WebGPU must resolve natively');
    report.webgpu = { status: 'passed', resolvedBackend: 'webgpu' };
  } else {
    report.webgpu = { status: 'skipped', reason: webGpuProbe.reason };
  }
}

try {
  await run();
} catch (error) {
  report.failure = { name: error.name, message: error.message, stack: error.stack };
  throw error;
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(join(artifactDirectory, `result-${runId}.json`), `${JSON.stringify(report, null, 2)}\n`);
}

const artifactCount = report.scenarios.reduce((count, scenario) => count
  + Number(Boolean(scenario.screenshot)) + Number(Boolean(scenario.video)), 0);
process.stdout.write(`Renderer browser regression passed: webgl2=${report.scenarios[0].resolvedBackend} dpr=${report.scenarios[0].pixelRatio} scanlines=${report.scenarios[0].postProcess.scanlines}; reduced-motion=0/0; canvas2d=${report.scenarios[2].resolvedBackend}; pacer=${report.pacer.map(({ presentations }) => presentations).join('/')}; webgpu=${report.webgpu.status}; artifacts=${artifactCount}; port=${report.port}\n`);
