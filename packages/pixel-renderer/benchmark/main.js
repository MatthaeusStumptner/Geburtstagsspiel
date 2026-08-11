import { PassauPixelRenderer, createLevelDocument, evaluatePerformanceBudget, summarizeRenderSamples } from '../src/index.js';

const parameters = new URLSearchParams(location.search);
const requestedBackend = parameters.get('backend') ?? 'webgl2';
const supportedProfiles = new Set(['notebook', 'tablet', 'mobile', 'weak-mobile', 'desktop']);
const profileName = supportedProfiles.has(parameters.get('profile')) ? parameters.get('profile') : 'notebook';
const quality = parameters.get('quality') ?? 'auto';
const scene = parameters.get('scene') === 'cutscene' ? 'cutscene' : 'gameplay';
const frameTarget = Math.max(60, Math.min(900, Number(parameters.get('frames')) || 180));
const canvas = document.querySelector('#benchmark');
const output = document.querySelector('#result');
const backendLabel = document.querySelector('#backend');
const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

function benchmarkLevel() {
  const walls = [];
  for (let x = 2; x < 23; x += 4) walls.push({ x, y: 3 + x % 7, width: 2, height: 4 + x % 5 });
  const decorations = [...Array.from({ length: 48 }, (_, index) => ({
    id: `decoration-${index}`,
    type: index % 4 === 0 ? 'lamp' : index % 4 === 1 ? 'tree' : index % 4 === 2 ? 'bench' : 'water',
    x: 1 + index * 7 % 23,
    y: 1 + index * 11 % 23,
    width: 1,
    height: 1,
    color: index % 3 === 0 ? '#55d9dd' : '#6fdb9e',
    animation: { type: index % 2 ? 'pulse' : 'float', speed: 0.8 + index % 5 * 0.15, amplitude: 0.14 },
  })), {
    id: 'benchmark-text-primary', type: 'text', x: 7, y: 5, width: 10, height: 2, color: '#f7e7ba',
    content: { standard: 'FRANZ & LOLA', dialect: 'DA FRANZ & D LOLA' },
    textStyle: { fontSize: 0.85, backgroundOpacity: 0, borderOpacity: 0 },
  }, {
    id: 'benchmark-text-secondary', type: 'text', x: 15, y: 18, width: 8, height: 2, color: '#7de3ff',
    content: { standard: 'Gutti voraus!', dialect: 'Do gibt’s a Gutti!' },
    textStyle: { fontSize: 0.72, backgroundOpacity: 0, borderOpacity: 0 },
  }];
  return createLevelDocument({
    id: 'zauberberg',
    board: { columns: 25, rows: 25, tileSize: 24, tunnelRows: [12], walls },
    theme: {
      id: 'zauberberg',
      landmark: 'zauberberg',
      palette: { ground: ['#211829', '#17262c'], curb: '#704b78', walls: ['#4b285b', '#174150'], water: '#2379a3' },
      edgeEffects: [
        { id: 'pulse', type: 'stage-pulse', side: 'both', speed: 1.2, intensity: 0.8, count: 10, color: '#ff4f87', accent: '#55d9dd' },
        { id: 'sparks', type: 'sparks', side: 'both', speed: 1.7, intensity: 0.8, count: 12, color: '#f5c451', accent: '#ff4f87' },
      ],
    },
    actors: {
      player: { x: 12, y: 18, color: '#f5c451', effects: [{ type: 'neon', intensity: 0.7, speed: 1.2, color: '#55d9dd' }] },
      cats: Array.from({ length: 6 }, (_, index) => ({ id: `cat-${index}`, x: 5 + index * 3, y: 7 + index % 3 * 4, color: ['#ff6b5f', '#f2a65a', '#b792e8'][index % 3], effects: [{ type: index % 2 ? 'glitch' : 'echo', intensity: 0.55, speed: 1.1, color: '#ff4f87' }] })),
      characters: [],
    },
    decorations,
  });
}

function waitFrame() { return new Promise((resolve) => requestAnimationFrame(resolve)); }

async function run() {
  const level = benchmarkLevel();
  const renderer = await PassauPixelRenderer.create(canvas, {
    backend: requestedBackend,
    preferWebGPU: requestedBackend === 'webgpu',
    fallback: true,
    quality,
    zoom: 1.12,
  });
  renderer.setLevel(level);
  const pellets = new Set(Array.from({ length: 210 }, (_, index) => `${1 + index * 7 % 23},${1 + index * 13 % 23}`));
  const powerUps = new Set(['1,1', '23,1', '1,23', '23,23']);
  const renderSamples = [];
  const frameSamples = [];
  let previousFrame = 0;
  let longTaskDuration = 0;
  const observer = 'PerformanceObserver' in window ? new PerformanceObserver((list) => {
    longTaskDuration += list.getEntries().reduce((sum, entry) => sum + entry.duration, 0);
  }) : null;
  try { observer?.observe({ type: 'longtask', buffered: true }); } catch { /* Not every browser exposes long tasks. */ }

  const draw = (frame, measured) => {
    const elapsed = frame / 60;
    const player = { x: 12 + Math.sin(elapsed * 0.85) * 7.5, y: 12 + Math.cos(elapsed * 0.63) * 7.5, direction: { name: 'right', x: 1, y: 0 }, effects: level.actors.player.effects };
    const cats = level.actors.cats.map((cat, index) => ({ ...cat, x: cat.x + Math.sin(elapsed * (0.7 + index * 0.04)) * 2.5, y: cat.y + Math.cos(elapsed * (0.6 + index * 0.05)) * 2 }));
    const decorations = scene === 'cutscene'
      ? level.decorations.map((item, index) => item.type === 'text' ? item : { ...item, x: item.x + Math.sin(elapsed * 0.7 + index) * 0.35 })
      : undefined;
    const started = performance.now();
    const result = renderer.render({ level, player, cats, decorations, pellets, powerUps, elapsed, powerTimer: Math.sin(elapsed * 0.5) > 0.78 ? 3 : 0, hitTimer: 0 }, { cameraEnabled: true, quality, reducedMotion });
    if (measured) renderSamples.push(performance.now() - started);
    return result.renderer;
  };

  for (let frame = 0; frame < 45; frame += 1) { await waitFrame(); draw(frame, false); }
  let info;
  for (let frame = 0; frame < frameTarget; frame += 1) {
    const timestamp = await waitFrame();
    if (previousFrame) frameSamples.push(timestamp - previousFrame);
    previousFrame = timestamp;
    info = draw(frame + 45, true);
  }
  await renderer.finish();
  observer?.disconnect();
  const summary = summarizeRenderSamples(renderSamples, frameSamples, longTaskDuration);
  const budget = evaluatePerformanceBudget(summary, profileName);
  const result = Object.freeze({
    requestedBackend,
    resolvedBackend: info.backend,
    fallback: requestedBackend !== 'auto' && requestedBackend !== info.backend,
    fallbackReason: info.fallbackReason,
    autoSelected: requestedBackend === 'auto' ? info.backend : null,
    quality: info.quality,
    profile: profileName,
    scene,
    reducedMotion,
    pixelRatio: info.pixelRatio,
    renderer: info,
    postProcess: info.postProcess,
    uploadedMegabytes: Math.round((info.uploadedBytes ?? 0) / 1024 / 1024 * 10) / 10,
    sceneUploadedMegabytes: Math.round((info.sceneUploadedBytes ?? 0) / 1024 / 1024 * 10) / 10,
    overlayUploadedMegabytes: Math.round((info.overlayUploadedBytes ?? 0) / 1024 / 1024 * 10) / 10,
    worldOverlayUploadedMegabytes: Math.round((info.worldOverlayUploadedBytes ?? 0) / 1024 / 1024 * 10) / 10,
    textureReallocations: info.textureReallocations ?? 0,
    gpuCropResizes: info.gpuCropResizes ?? 0,
    overlayUploadSkips: info.overlayUploadSkips ?? 0,
    worldOverlayUploadSkips: info.worldOverlayUploadSkips ?? 0,
    ...summary,
    budget,
  });
  canvas.dataset.rendererBackend = result.resolvedBackend;
  backendLabel.textContent = `${result.resolvedBackend.toUpperCase()} · ${result.quality.toUpperCase()}`;
  output.textContent = JSON.stringify(result, null, 2);
  document.documentElement.dataset.benchmark = budget.passed ? 'passed' : 'failed';
  window.__RENDER_BENCHMARK_RESULT__ = result;
  return result;
}

window.__RENDER_BENCHMARK__ = run().catch((error) => {
  output.textContent = error.stack || error.message;
  document.documentElement.dataset.benchmark = 'error';
  throw error;
});
