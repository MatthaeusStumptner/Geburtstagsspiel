import { Canvas2DPresentationBackend } from './canvas2d-backend.js';
import { createWebGL2Backend } from './webgl2-backend.js';
import { createWebGPUBackend } from './webgpu-backend.js';

const backendName = (value) => ['canvas2d', 'webgl2', 'webgpu', 'auto'].includes(value) ? value : 'auto';

const unavailableMessage = {
  webgpu: 'WebGPU ist auf diesem Gerät nicht verfügbar.',
  webgl2: 'WebGL 2 ist auf diesem Gerät nicht verfügbar.',
  canvas2d: 'Canvas2D ist auf diesem Gerät nicht verfügbar.',
};

function withDiagnostics(backend, requestedBackend, fallbackReason) {
  backend.requestedBackend = requestedBackend;
  backend.fallbackReason = fallbackReason;
  if (typeof backend.snapshot === 'function') {
    const snapshot = backend.snapshot.bind(backend);
    backend.snapshot = () => ({
      requestedBackend,
      ...snapshot(),
      fallbackReason,
    });
  }
  return backend;
}

function candidateOrder(requestedBackend, options) {
  if (requestedBackend === 'canvas2d') return ['canvas2d'];
  if (requestedBackend === 'webgl2') return ['webgl2', 'canvas2d'];
  if (requestedBackend === 'webgpu') return ['webgpu', 'webgl2', 'canvas2d'];
  return options.preferWebGPU === false ? ['webgl2', 'canvas2d'] : ['webgpu', 'webgl2', 'canvas2d'];
}

function preparationCanvas(canvas) {
  const document = canvas.ownerDocument ?? globalThis.document;
  const prepared = document?.createElement?.('canvas');
  if (!prepared || prepared === canvas) return null;
  prepared.width = 1;
  prepared.height = 1;
  return prepared;
}

function createPreparedSyncBackend(canvas, factory) {
  const preparedCanvas = preparationCanvas(canvas);
  if (!preparedCanvas) return null;
  const preparedBackend = factory(preparedCanvas);
  if (!preparedBackend) return null;
  preparedBackend.destroy();
  return factory(canvas);
}

async function createPreparedBackend(canvas, factory) {
  const preparedCanvas = preparationCanvas(canvas);
  if (!preparedCanvas) return null;
  const preparedBackend = await factory(preparedCanvas);
  if (!preparedBackend) return null;
  preparedBackend.destroy();
  return factory(canvas);
}

export async function selectPresentationBackend(requestedBackend, candidates, options = {}) {
  const requested = backendName(requestedBackend);
  let firstFailure = null;
  let lastFailure = null;

  for (const kind of candidateOrder(requested, options)) {
    try {
      const backend = await candidates[kind]();
      if (!backend) throw new Error(unavailableMessage[kind]);
      return withDiagnostics(backend, requested, firstFailure?.message ?? null);
    } catch (error) {
      if (requested !== 'auto' && kind === requested && options.fallback === false) throw error;
      lastFailure = error instanceof Error ? error : new Error(String(error));
      firstFailure ??= lastFailure;
    }
  }

  throw lastFailure;
}

export function createSyncPresentationBackend(canvas, options = {}) {
  const requested = backendName(options.backend);
  if (requested === 'webgpu') throw new Error('WebGPU benötigt PassauPixelRenderer.create(...).');

  let firstFailure = null;
  if (requested === 'auto' || requested === 'webgl2') {
    try {
      const backend = createPreparedSyncBackend(canvas, (target) => createWebGL2Backend(target, options));
      if (!backend) throw new Error(unavailableMessage.webgl2);
      return withDiagnostics(backend, requested, null);
    } catch (error) {
      if (requested === 'webgl2' && options.fallback === false) throw error;
      firstFailure = error instanceof Error ? error : new Error(String(error));
    }
  }

  return withDiagnostics(new Canvas2DPresentationBackend(canvas), requested, firstFailure?.message ?? null);
}

export async function createPresentationBackend(canvas, options = {}) {
  return selectPresentationBackend(backendName(options.backend), {
    webgpu: () => createPreparedBackend(canvas, (target) => createWebGPUBackend(target, options)),
    webgl2: () => createPreparedSyncBackend(canvas, (target) => createWebGL2Backend(target, options)),
    canvas2d: () => new Canvas2DPresentationBackend(canvas),
  }, options);
}
