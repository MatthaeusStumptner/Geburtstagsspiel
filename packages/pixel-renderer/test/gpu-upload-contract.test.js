import test from 'node:test';
import assert from 'node:assert/strict';
import { PassauPixelRenderer } from '../src/passau-pixel-renderer.js';
import { WebGL2PresentationBackend } from '../src/gpu/webgl2-backend.js';
import { WebGPUPresentationBackend } from '../src/gpu/webgpu-backend.js';

function fakeCanvas() {
  const emptyContext = { clearRect() {}, fillRect() {} };
  return {
    width: 320,
    height: 240,
    ownerDocument: { createElement: () => ({ width: 0, height: 0, getContext: () => emptyContext }) },
    addEventListener() {},
    removeEventListener() {},
  };
}

function rendererCanvas() {
  const gradient = { addColorStop() {} };
  const createContext = () => new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; },
  });
  const createSurface = () => ({ width: 0, height: 0, getContext: () => createContext() });
  return {
    width: 0,
    height: 0,
    clientWidth: 120,
    clientHeight: 120,
    getContext: () => createContext(),
    ownerDocument: { createElement: createSurface },
    getBoundingClientRect: () => ({ width: 120, height: 120 }),
    addEventListener() {},
    removeEventListener() {},
  };
}

function presentationFrame() {
  return {
    scene: { width: 8, height: 4 },
    overlay: { width: 3, height: 2 },
    hasOverlay: true,
    worldOverlay: { width: 2, height: 3 },
    hasWorldOverlay: true,
    camera: {
      source: { x: 0, y: 0, width: 8, height: 4 },
      viewport: { x: 0, y: 0, width: 320, height: 240 },
    },
    pixelRatio: 1,
    profile: {
      modeIndex: 0,
      intensity: 0,
      motionScale: 0,
      tint: [0, 0, 0],
      vignette: 0,
      power: 0,
      hit: 0,
      distortion: 0,
      scanlines: 0,
    },
  };
}

function frameUploadBytes(frame) {
  return (frame.scene.width * frame.scene.height
    + frame.overlay.width * frame.overlay.height
    + frame.worldOverlay.width * frame.worldOverlay.height) * 4;
}

function recordingWebGL2Context() {
  const calls = { texStorage2D: 0, texSubImage2D: 0, deleteTexture: 0 };
  let textureId = 0;
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TEXTURE_2D: 5,
    TEXTURE_MIN_FILTER: 6,
    TEXTURE_MAG_FILTER: 7,
    TEXTURE_WRAP_S: 8,
    TEXTURE_WRAP_T: 9,
    NEAREST: 10,
    CLAMP_TO_EDGE: 11,
    TEXTURE0: 12,
    TEXTURE1: 13,
    TEXTURE2: 14,
    UNPACK_FLIP_Y_WEBGL: 15,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 16,
    RGBA: 17,
    RGBA8: 18,
    UNSIGNED_BYTE: 19,
    BLEND: 20,
    DEPTH_TEST: 21,
    COLOR_BUFFER_BIT: 22,
    TRIANGLES: 23,
    createShader: () => ({}),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader() {},
    createProgram: () => ({}),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    deleteProgram() {},
    createTexture: () => ({ id: ++textureId }),
    bindTexture() {},
    texParameteri() {},
    texStorage2D() { calls.texStorage2D += 1; },
    texImage2D() {},
    texSubImage2D() { calls.texSubImage2D += 1; },
    deleteTexture() { calls.deleteTexture += 1; },
    getUniformLocation: (_program, name) => name,
    useProgram() {},
    uniform1i() {},
    activeTexture() {},
    pixelStorei() {},
    disable() {},
    clearColor() {},
    clear() {},
    viewport() {},
    uniform2f() {},
    uniform4f() {},
    drawArrays() {},
    isContextLost: () => false,
    finish() {},
  };
  return { gl, calls };
}

function recordingWebGPUDevice() {
  const calls = { copies: [], destroyedTextures: 0 };
  let textureId = 0;
  const pass = { setPipeline() {}, setBindGroup() {}, setViewport() {}, draw() {}, end() {} };
  const device = {
    lost: new Promise(() => {}),
    createSampler: () => ({}),
    createBuffer: () => ({ destroy() {} }),
    createTexture() {
      const id = ++textureId;
      return {
        id,
        createView: () => ({ id }),
        destroy() { calls.destroyedTextures += 1; },
      };
    },
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({ beginRenderPass: () => pass, finish: () => ({}) }),
    queue: {
      copyExternalImageToTexture(...args) { calls.copies.push(args); },
      writeBuffer() {},
      submit() {},
      onSubmittedWorkDone: async () => {},
    },
  };
  return { device, calls };
}

async function withWebGPUUsage(run) {
  const previousBufferUsage = globalThis.GPUBufferUsage;
  const previousTextureUsage = globalThis.GPUTextureUsage;
  globalThis.GPUBufferUsage = { UNIFORM: 1, COPY_DST: 2 };
  globalThis.GPUTextureUsage = { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 };
  try {
    return await run();
  } finally {
    if (previousBufferUsage === undefined) delete globalThis.GPUBufferUsage;
    else globalThis.GPUBufferUsage = previousBufferUsage;
    if (previousTextureUsage === undefined) delete globalThis.GPUTextureUsage;
    else globalThis.GPUTextureUsage = previousTextureUsage;
  }
}

function createWebGPUBackend() {
  const { device, calls } = recordingWebGPUDevice();
  const context = { getCurrentTexture: () => ({ createView: () => ({}) }) };
  const pipeline = { getBindGroupLayout: () => ({}) };
  return { backend: new WebGPUPresentationBackend(fakeCanvas(), {}, {}, device, context, 'rgba8unorm', pipeline), calls };
}

test('allocates WebGL2 textures immutably and skips clean uploads', () => {
  const { gl, calls } = recordingWebGL2Context();
  const backend = new WebGL2PresentationBackend(fakeCanvas(), gl);
  const frame = presentationFrame();

  backend.present({ ...frame, sceneChanged: true });
  backend.present({ ...frame, sceneChanged: false, overlayChanged: false, worldOverlayChanged: false });

  assert.equal(calls.texStorage2D, 3);
  assert.equal(calls.texSubImage2D, 3);
  assert.deepEqual(backend.snapshot(), {
    backend: 'webgl2',
    frameCount: 2,
    gpuAccelerated: true,
    contextLost: false,
    resourceMetrics: { applicability: 'applicable' },
    uploadedBytes: frameUploadBytes(frame),
    sceneUploadedBytes: frame.scene.width * frame.scene.height * 4,
    overlayUploadedBytes: frame.overlay.width * frame.overlay.height * 4,
    worldOverlayUploadedBytes: frame.worldOverlay.width * frame.worldOverlay.height * 4,
    textureReallocations: 3,
    sceneUploadSkips: 1,
    overlayUploadSkips: 1,
    worldOverlayUploadSkips: 1,
  });
});

test('recreates immutable WebGL2 storage and uploads after a clean-marked resize', () => {
  const { gl, calls } = recordingWebGL2Context();
  const backend = new WebGL2PresentationBackend(fakeCanvas(), gl);
  const frame = presentationFrame();
  backend.present(frame);

  backend.present({
    ...frame,
    scene: { width: 9, height: 4 },
    sceneChanged: false,
    overlayChanged: false,
    worldOverlayChanged: false,
  });

  assert.equal(calls.texStorage2D, 4);
  assert.equal(calls.texSubImage2D, 4);
  assert.equal(calls.deleteTexture, 1);
  assert.equal(backend.snapshot().sceneUploadSkips, 0);
});

test('reuploads clean-marked WebGL2 textures after context restoration', () => {
  const { gl, calls } = recordingWebGL2Context();
  const backend = new WebGL2PresentationBackend(fakeCanvas(), gl);
  const frame = presentationFrame();
  backend.present(frame);

  backend.handleLost({ preventDefault() {} });
  backend.handleRestored();
  backend.present({ ...frame, sceneChanged: false, overlayChanged: false, worldOverlayChanged: false });

  assert.equal(calls.texStorage2D, 6);
  assert.equal(calls.texSubImage2D, 6);
  assert.equal(backend.snapshot().textureReallocations, 6);
  assert.equal(backend.snapshot().sceneUploadSkips, 0);
});
test('skips the same clean uploads and reports the same counters on WebGPU', () => withWebGPUUsage(() => {
  const { backend, calls } = createWebGPUBackend();
  const frame = presentationFrame();

  backend.present({ ...frame, sceneChanged: true });
  backend.present({ ...frame, sceneChanged: false, overlayChanged: false, worldOverlayChanged: false });

  assert.equal(calls.copies.length, 3);
  assert.deepEqual(backend.snapshot(), {
    backend: 'webgpu',
    frameCount: 2,
    gpuAccelerated: true,
    contextLost: false,
    resourceMetrics: { applicability: 'applicable' },
    uploadedBytes: frameUploadBytes(frame),
    sceneUploadedBytes: frame.scene.width * frame.scene.height * 4,
    overlayUploadedBytes: frame.overlay.width * frame.overlay.height * 4,
    worldOverlayUploadedBytes: frame.worldOverlay.width * frame.worldOverlay.height * 4,
    textureReallocations: 3,
    sceneUploadSkips: 1,
    overlayUploadSkips: 1,
    worldOverlayUploadSkips: 1,
  });
}));

test('uploads a clean-marked WebGPU scene after texture recreation', () => withWebGPUUsage(() => {
  const { backend, calls } = createWebGPUBackend();
  const frame = presentationFrame();
  backend.present(frame);

  backend.present({
    ...frame,
    scene: { width: 9, height: 4 },
    sceneChanged: false,
    overlayChanged: false,
    worldOverlayChanged: false,
  });

  assert.equal(calls.copies.length, 4);
  assert.equal(calls.destroyedTextures, 1);
  assert.equal(backend.snapshot().sceneUploadSkips, 0);
}));
test('reuploads clean-marked WebGPU textures after device recovery', async () => withWebGPUUsage(async () => {
  const initial = recordingWebGPUDevice();
  const replacement = recordingWebGPUDevice();
  const pipeline = { getBindGroupLayout: () => ({}) };
  const context = {
    configure() {},
    getCurrentTexture: () => ({ createView: () => ({}) }),
  };
  replacement.device.createShaderModule = () => ({ getCompilationInfo: async () => ({ messages: [] }) });
  replacement.device.createRenderPipelineAsync = async () => pipeline;
  const gpu = { getPreferredCanvasFormat: () => 'rgba8unorm' };
  const adapter = { requestDevice: async () => replacement.device };
  const canvas = { ...fakeCanvas(), getContext: () => context };
  const backend = new WebGPUPresentationBackend(canvas, gpu, adapter, initial.device, context, 'rgba8unorm', pipeline);
  const frame = presentationFrame();
  backend.present(frame);

  await backend.recover();
  backend.present({ ...frame, sceneChanged: false, overlayChanged: false, worldOverlayChanged: false });

  assert.equal(initial.calls.copies.length, 3);
  assert.equal(replacement.calls.copies.length, 3);
  assert.equal(backend.snapshot().textureReallocations, 6);
  assert.equal(backend.snapshot().sceneUploadSkips, 0);
}));

test('forces a clean-marked scene upload when the GPU crop origin changes', () => {
  const canvas = rendererCanvas();
  const { gl, calls } = recordingWebGL2Context();
  const backend = new WebGL2PresentationBackend(canvas, gl);
  const renderer = new PassauPixelRenderer(canvas, { pixelRatio: 1, presentationBackend: backend });
  renderer.resize({ width: 120, height: 120, devicePixelRatio: 1 });
  renderer.scene.width = 600;
  renderer.scene.height = 600;
  const frame = presentationFrame();
  const camera = {
    source: { x: 60, y: 60, width: 120, height: 120 },
    viewport: { x: 0, y: 0, width: 120, height: 120 },
  };

  renderer.present(camera, frame.profile, 0, false, false, { visible: false, changed: false }, false);
  const firstUploadBytes = backend.snapshot().sceneUploadedBytes;
  assert.equal(firstUploadBytes, 128 * 128 * 4);
  assert.equal(calls.texSubImage2D, 3);
  renderer.present(camera, frame.profile, 0, false, false, { visible: false, changed: false }, false);
  assert.equal(backend.snapshot().sceneUploadSkips, 1);
  assert.equal(backend.snapshot().sceneUploadedBytes, firstUploadBytes);
  assert.equal(calls.texSubImage2D, 3);

  renderer.present({ ...camera, source: { ...camera.source, x: 300, y: 300 } }, frame.profile, 0, false, false, { visible: false, changed: false }, false);
  assert.equal(backend.snapshot().sceneUploadSkips, 1);
  assert.equal(backend.snapshot().sceneUploadedBytes, firstUploadBytes * 2);
  assert.equal(calls.texSubImage2D, 4);
});
