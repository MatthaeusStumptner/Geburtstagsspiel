import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationBackend, selectPresentationBackend } from '../src/gpu/presentation-backend.js';
import { createWebGL2Backend } from '../src/gpu/webgl2-backend.js';
import { createWebGPUBackend, webGPUAdapterOptions } from '../src/gpu/webgpu-backend.js';

test('omits ignored WebGPU power preference on Windows', () => {
  assert.deepEqual(webGPUAdapterOptions(
    { powerPreference: 'high-performance' },
    { userAgentData: { platform: 'Windows' } },
  ), {});
  assert.deepEqual(webGPUAdapterOptions(
    { powerPreference: 'high-performance' },
    { userAgentData: { platform: 'Android' } },
  ), { powerPreference: 'high-performance' });
});

test('selects backends by capability without rendering probe frames', async () => {
  const calls = [];
  const backend = await selectPresentationBackend('auto', {
    webgpu: async () => { calls.push('webgpu'); throw new Error('adapter unavailable'); },
    webgl2: () => { calls.push('webgl2'); return { kind: 'webgl2' }; },
    canvas2d: () => { calls.push('canvas2d'); return { kind: 'canvas2d' }; },
  });

  assert.equal(backend.kind, 'webgl2');
  assert.deepEqual(calls, ['webgpu', 'webgl2']);
  assert.match(backend.fallbackReason, /adapter unavailable/);
});

test('propagates explicit backend initialization errors when fallback is disabled', async () => {
  for (const requested of ['webgpu', 'webgl2']) {
    const initializationError = new Error(requested + ' initialization failed');
    const calls = [];

    await assert.rejects(
      selectPresentationBackend(requested, {
        webgpu: async () => { calls.push('webgpu'); throw initializationError; },
        webgl2: () => { calls.push('webgl2'); throw initializationError; },
        canvas2d: () => { calls.push('canvas2d'); return { kind: 'canvas2d' }; },
      }, { fallback: false }),
      (error) => error === initializationError,
    );
    assert.deepEqual(calls, [requested]);
  }
});

test('skips WebGPU deterministically when automatic selection opts out', async () => {
  const calls = [];
  const backend = await selectPresentationBackend('auto', {
    webgpu: async () => { calls.push('webgpu'); return { kind: 'webgpu' }; },
    webgl2: () => { calls.push('webgl2'); return { kind: 'webgl2' }; },
    canvas2d: () => { calls.push('canvas2d'); return { kind: 'canvas2d' }; },
  }, { preferWebGPU: false });

  assert.equal(backend.kind, 'webgl2');
  assert.deepEqual(calls, ['webgl2']);
});

test('adds deterministic diagnostics to the selected backend snapshot', async () => {
  const backend = await selectPresentationBackend('auto', {
    webgpu: async () => ({
      kind: 'webgpu',
      snapshot: () => ({ backend: 'webgpu', frameCount: 0 }),
    }),
    webgl2: () => { throw new Error('WebGL2 should not be initialized'); },
    canvas2d: () => { throw new Error('Canvas2D should not be initialized'); },
  });

  assert.deepEqual(backend.snapshot(), {
    requestedBackend: 'auto',
    backend: 'webgpu',
    frameCount: 0,
    fallbackReason: null,
  });
});

function unavailableWebGPU() {
  const calls = { adapterOptions: null, deviceDestroys: 0 };
  const device = {
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createRenderPipelineAsync: async () => ({}),
    destroy: () => { calls.deviceDestroys += 1; },
  };
  const adapter = { requestDevice: async () => device };
  const gpu = {
    requestAdapter: async (options) => { calls.adapterOptions = options; return adapter; },
    getPreferredCanvasFormat: () => 'rgba8unorm',
  };
  const canvas = { getContext: () => null };
  return { calls, canvas, gpu };
}

async function withNavigator(navigator, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigator });
  try {
    return await callback();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
}

test('uses Windows-safe adapter options during WebGPU initialization', async () => {
  const { calls, canvas, gpu } = unavailableWebGPU();

  const backend = await withNavigator(
    { userAgentData: { platform: 'Windows' } },
    () => createWebGPUBackend(canvas, { gpu, powerPreference: 'high-performance' }),
  );

  assert.equal(backend, null);
  assert.deepEqual(calls.adapterOptions, {});
});

test('releases a WebGPU device when its canvas context is unavailable', async () => {
  const { calls, canvas, gpu } = unavailableWebGPU();

  const backend = await createWebGPUBackend(canvas, { gpu });

  assert.equal(backend, null);
  assert.equal(calls.deviceDestroys, 1);
});

test('propagates the terminal initialization error when every fallback fails', async () => {
  const terminalError = new Error('Canvas2D context creation failed');

  await assert.rejects(
    selectPresentationBackend('auto', {
      webgpu: async () => { throw new Error('adapter unavailable'); },
      webgl2: () => { throw new Error('WebGL2 unavailable'); },
      canvas2d: () => { throw terminalError; },
    }),
    (error) => error === terminalError,
  );
});

function modeLockedCanvas(ownerDocument, contexts) {
  const listeners = new Map();
  const requests = [];
  let claimedMode = null;
  return {
    ownerDocument,
    requests,
    get claimedMode() { return claimedMode; },
    get activeListenerCount() { return [...listeners.values()].reduce((total, entries) => total + entries.size, 0); },
    getContext(kind) {
      requests.push(kind);
      if (claimedMode && claimedMode !== kind) return null;
      const context = contexts[kind]?.();
      if (context) claimedMode = kind;
      return context ?? null;
    },
    addEventListener(kind, listener) {
      if (!listeners.has(kind)) listeners.set(kind, new Set());
      listeners.get(kind).add(listener);
    },
    removeEventListener(kind, listener) { listeners.get(kind)?.delete(listener); },
  };
}

function failingWebGL2Environment() {
  const calls = { deletedShaders: [] };
  const context = () => ({
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    createShader: (type) => ({ type }),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: (shader) => shader.type === 1,
    getShaderInfoLog: () => 'fragment compilation failed',
    deleteShader: (shader) => { calls.deletedShaders.push(shader.type); },
  });
  const document = {
    surfaces: [],
    createElement() {
      const surface = modeLockedCanvas(document, { '2d': () => ({}), webgl2: context });
      document.surfaces.push(surface);
      return surface;
    },
  };
  const visible = modeLockedCanvas(document, { '2d': () => ({}), webgl2: context });
  return { calls, document, visible };
}

test('cleans WebGL2 preparation resources and listeners after shader failure', () => {
  const { calls, visible } = failingWebGL2Environment();

  assert.throws(() => createWebGL2Backend(visible), /fragment compilation failed/);

  assert.deepEqual(calls.deletedShaders.sort(), [1, 2]);
  assert.equal(visible.activeListenerCount, 0);
});

test('keeps the visible canvas available for Canvas2D after WebGL2 preparation fails', async () => {
  const { calls, document, visible } = failingWebGL2Environment();

  const backend = await createPresentationBackend(visible, { backend: 'auto', preferWebGPU: false });

  assert.equal(backend.kind, 'canvas2d');
  assert.match(backend.fallbackReason, /fragment compilation failed/);
  assert.deepEqual(visible.requests, ['2d']);
  assert.equal(visible.claimedMode, '2d');
  assert.equal(document.surfaces[0].activeListenerCount, 0);
  assert.deepEqual(calls.deletedShaders.sort(), [1, 2]);
});

function failingWebGPUEnvironment({ failDuringConstruction = false } = {}) {
  const calls = { deviceDestroys: 0 };
  const device = {
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createRenderPipelineAsync: async () => ({}),
    createSampler() {
      if (failDuringConstruction) throw new Error('sampler creation failed');
      return {};
    },
    createBuffer: () => ({}),
    destroy: () => { calls.deviceDestroys += 1; },
    lost: new Promise(() => {}),
  };
  const adapter = { requestDevice: async () => device };
  const gpu = {
    requestAdapter: async () => adapter,
    getPreferredCanvasFormat: () => 'rgba8unorm',
  };
  const webgpu = () => ({
    configure() {
      if (!failDuringConstruction) throw new Error('WebGPU configuration failed');
    },
  });
  const document = {
    surfaces: [],
    createElement() {
      const surface = modeLockedCanvas(document, { '2d': () => ({ clearRect() {}, fillRect() {} }), webgpu });
      document.surfaces.push(surface);
      return surface;
    },
  };
  const visible = modeLockedCanvas(document, {
    '2d': () => ({}),
    webgpu,
  });
  return { calls, device, document, gpu, visible };
}

test('cleans the WebGPU device when backend construction fails', async () => {
  const { calls, gpu, visible } = failingWebGPUEnvironment({ failDuringConstruction: true });

  await assert.rejects(createWebGPUBackend(visible, { gpu }), /sampler creation failed/);

  assert.equal(calls.deviceDestroys, 1);
});

test('keeps the visible canvas available for Canvas2D after WebGPU preparation fails', async () => {
  const { calls, document, gpu, visible } = failingWebGPUEnvironment();

  const backend = await createPresentationBackend(visible, { backend: 'auto', gpu });

  assert.equal(backend.kind, 'canvas2d');
  assert.match(backend.fallbackReason, /WebGPU configuration failed/);
  assert.deepEqual(visible.requests, ['2d']);
  assert.equal(visible.claimedMode, '2d');
  assert.equal(document.surfaces[0].claimedMode, 'webgpu');
  assert.equal(calls.deviceDestroys, 1);
});
