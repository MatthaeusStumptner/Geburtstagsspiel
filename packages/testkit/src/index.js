import { createHash } from 'node:crypto';
import { goldenProjects } from './fixtures.js';
import { PassauPixelRenderer } from '@franz-lola/pixel-renderer';
export { fixturePresentationFrame } from './fixtures.js';

function captureCanvas() {
  const gradient = Object.freeze({ addColorStop() {} });
  const context = new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; },
  });
  const surface = () => ({ width: 0, height: 0, getContext: (kind) => kind === '2d' ? context : null });
  return {
    width: 0,
    height: 0,
    clientWidth: 400,
    clientHeight: 300,
    getContext: (kind) => kind === '2d' ? context : null,
    ownerDocument: { createElement: surface },
    getBoundingClientRect: () => ({ width: 400, height: 300 }),
  };
}

function captureBackend() {
  return {
    kind: 'canvas2d',
    resize() {},
    present() {},
    snapshot: () => ({
      requestedBackend: 'canvas2d',
      backend: 'canvas2d',
      fallbackReason: null,
      frameCount: 1,
      gpuAccelerated: false,
      contextLost: false,
    }),
    destroy() {},
  };
}

async function createAdapterSession(adapter, fixture) {
  if (adapter === 'game') {
    const { createBrowserGameSession } = await import('../../../apps/game/src/game/game-session-adapter.js');
    return createBrowserGameSession(fixture.session);
  }
  if (adapter === 'studio') {
    const { PlaytestEngine } = await import('../../../apps/studio/src/playtest-engine.js');
    return new PlaytestEngine(fixture.session.level, fixture.session.difficulty);
  }
  throw new RangeError(`Unknown golden presentation adapter: ${adapter}`);
}

export async function renderGoldenFrame({ adapter, fixture, presentationTime }) {
  if (!fixture || typeof fixture !== 'object') throw new TypeError('Golden presentation fixture is required.');
  if (!Number.isFinite(presentationTime)) throw new TypeError('Golden presentation time must be finite.');
  const session = await createAdapterSession(adapter, fixture);
  const snapshot = runInputScript(session, fixture.inputs);
  const renderer = new PassauPixelRenderer(captureCanvas(), {
    pixelRatio: 1,
    quality: 'quality',
    presentationBackend: captureBackend(),
  });
  try {
    renderer.resize({ width: 400, height: 300, devicePixelRatio: 1, reason: 'golden-capture' });
    return renderer.render(snapshot, {
      alpha: snapshot.interpolationAlpha,
      cameraEnabled: true,
      presentationTime,
    });
  } finally {
    renderer.destroy();
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function snapshotChecksum(snapshot) {
  return createHash('sha256').update(JSON.stringify(canonicalize(snapshot))).digest('hex');
}

export function loadGoldenProject(id) {
  const project = goldenProjects[id];
  if (!project) throw new RangeError(`Unknown golden project: ${id}`);
  return project;
}

export function runInputScript(session, script) {
  if (!session || typeof session.queueInput !== 'function' || typeof session.step !== 'function') {
    throw new TypeError('runInputScript requires a game session');
  }
  if (!Array.isArray(script)) throw new TypeError('runInputScript requires an input script');

  let snapshot = session.snapshot();
  for (const step of script) {
    if (!step || typeof step !== 'object') throw new TypeError('Input script entries must be objects');
    if (step.input !== undefined) session.queueInput(step.input);
    snapshot = session.step(step.dt);
  }

  return deepFreeze({
    ...snapshot,
    levelId: snapshot.level.id,
    checksum: snapshotChecksum(snapshot),
  });
}
