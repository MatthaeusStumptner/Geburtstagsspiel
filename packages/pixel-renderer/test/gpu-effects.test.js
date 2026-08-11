import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEVEL_EFFECT_PROFILES, rendererPixelRatioLimit, resolvePostProcessProfile, resolveRendererQuality } from '../src/gpu/effect-profile.js';
import { WEBGL_FRAGMENT_SHADER, WEBGPU_SHADER } from '../src/gpu/shaders.js';
import { WebGL2PresentationBackend } from '../src/gpu/webgl2-backend.js';
import { WebGPUPresentationBackend } from '../src/gpu/webgpu-backend.js';
import { PassauPixelRenderer } from '../src/passau-pixel-renderer.js';

test('keeps modern notebooks, tablets and phones eligible for GPU effects', () => {
  assert.equal(resolveRendererQuality('auto', { deviceMemory: 2, hardwareConcurrency: 2 }), 'performance');
  assert.equal(rendererPixelRatioLimit('performance'), 1.25);
  assert.equal(resolveRendererQuality('auto', { deviceMemory: 4, hardwareConcurrency: 8 }), 'balanced');
  assert.equal(resolveRendererQuality('auto', { deviceMemory: 8, hardwareConcurrency: 8 }), 'quality');
  assert.equal(resolveRendererQuality('auto', { deviceMemory: 16, hardwareConcurrency: 12 }), 'quality');
});

test('derives playful GPU effects from authored level edges', () => {
  const water = resolvePostProcessProfile({ theme: { palette: { water: '#2379a3' }, edgeEffects: [{ type: 'water-flow', intensity: 0.8 }] } }, { powerTimer: 3 }, { quality: 'quality' });
  assert.equal(water.mode, 'water');
  assert.equal(water.modeIndex, 1);
  assert.equal(water.power, 0.5);
  assert.ok(water.intensity >= 0.7);
  const reduced = resolvePostProcessProfile({ theme: { edgeEffects: [{ type: 'stage-pulse', intensity: 1 }] } }, {}, { reducedMotion: true });
  assert.equal(reduced.mode, 'stage');
  assert.equal(reduced.motionScale, 0);
  assert.equal(reduced.distortion, 0);
});

test('uses a restrained authored signature for every published level', () => {
  assert.deepEqual(Object.keys(LEVEL_EFFECT_PROFILES), ['home', 'hals', 'oberhaus', 'dom', 'dreifluesseeck', 'uni', 'bschuett', 'tabakfabrik', 'zauberberg']);
  const home = resolvePostProcessProfile({ id: 'home', theme: { edgeEffects: [{ type: 'water-flow', intensity: 1 }] } }, {}, { quality: 'quality' });
  const river = resolvePostProcessProfile({ id: 'dreifluesseeck', theme: { edgeEffects: [{ type: 'water-flow', intensity: 1 }] } }, {}, { quality: 'quality' });
  assert.equal(home.mode, 'nature');
  assert.ok(home.distortion <= 0.02);
  assert.equal(river.mode, 'water');
  assert.ok(river.distortion > home.distortion);
  assert.ok(river.distortion <= 0.4);
});

test('ships compatible GLSL and WGSL fragment entry points without WGSL swizzle writes', () => {
  assert.match(WEBGL_FRAGMENT_SHADER, /void main\(\)/);
  assert.match(WEBGPU_SHADER, /@fragment fn fragmentMain/);
  assert.doesNotMatch(WEBGPU_SHADER, /color\.rgb\s*[+*]?=/);
  assert.match(WEBGPU_SHADER, /var rgb = color\.rgb/);
});

test('prepares browser canvases for valid WebGPU texture uploads', async () => {
  const source = await readFile(new URL('../src/gpu/webgpu-backend.js', import.meta.url), 'utf8');

  assert.match(source, /GPUTextureUsage\.RENDER_ATTACHMENT/);
  assert.match(source, /emptyOverlay\.getContext\('2d'\)/);
});

test('disables scanlines when browser resampling can create moire', () => {
  const level = { id: 'home', theme: { edgeEffects: [] } };
  for (const actualPixelRatio of [1.25, 1.5, 1.6, 2.625, 3]) {
    const profile = resolvePostProcessProfile(level, {}, {
      quality: 'quality',
      actualPixelRatio,
      effectivePixelRatio: Math.min(2, actualPixelRatio),
    });
    assert.equal(profile.scanlines, 0);
  }
  const integer = resolvePostProcessProfile(level, {}, { quality: 'quality', actualPixelRatio: 2, effectivePixelRatio: 2 });
  assert.equal(integer.scanlines, 0.055);
  assert.equal(integer.scanlinePeriod, 4);
});

test('quantizes stage RGB separation to whole scene texels', () => {
  const stage = resolvePostProcessProfile(
    { theme: { edgeEffects: [{ type: 'stage-pulse', intensity: 1 }] } },
    {},
    { quality: 'quality', actualPixelRatio: 2, effectivePixelRatio: 2 },
  );
  const ambient = resolvePostProcessProfile(
    { theme: { edgeEffects: [] } },
    {},
    { quality: 'quality', actualPixelRatio: 2, effectivePixelRatio: 2 },
  );
  assert.equal(stage.rgbSplitTexels, 2);
  assert.equal(ambient.rgbSplitTexels, 0);
});

test('uploads stable sampling controls to WebGL', () => {
  const uniform2f = [];
  const gl = {
    TEXTURE0: 0, TEXTURE1: 1, TEXTURE2: 2, TEXTURE_2D: 3,
    UNPACK_FLIP_Y_WEBGL: 4, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 5,
    RGBA: 6, UNSIGNED_BYTE: 7, BLEND: 8, DEPTH_TEST: 9, COLOR_BUFFER_BIT: 10, TRIANGLES: 11,
    activeTexture() {}, bindTexture() {}, pixelStorei() {}, texSubImage2D() {}, disable() {}, clearColor() {}, clear() {}, viewport() {}, useProgram() {},
    uniform2f(location, ...values) { uniform2f.push([location, ...values]); },
    uniform4f() {}, drawArrays() {},
  };
  const backend = Object.assign(Object.create(WebGL2PresentationBackend.prototype), {
    canvas: { width: 800, height: 600 }, gl, contextLost: false,
    sceneTexture: { texture: {}, width: 320, height: 240 },
    overlayTexture: { texture: {}, width: 1, height: 1 },
    worldOverlayTexture: { texture: {}, width: 1, height: 1 },
    emptyOverlay: { width: 1, height: 1 },
    locations: { source: 'source', worldSource: 'worldSource', canvasSize: 'canvasSize', sceneSize: 'sceneSize', sampling: 'sampling', effect: 'effect', tint: 'tint', feedback: 'feedback' },
    frameCount: 0, uploadedBytes: 0, sceneUploadedBytes: 0, overlayUploadedBytes: 0, worldOverlayUploadedBytes: 0,
    textureReallocations: 0, overlayUploadSkips: 0, worldOverlayUploadSkips: 0,
  });
  backend.present({
    scene: { width: 320, height: 240 }, overlay: { width: 1, height: 1 }, hasOverlay: false,
    camera: { source: { x: 0, y: 0, width: 160, height: 120 }, viewport: { x: 0, y: 0, width: 400, height: 300 } },
    pixelRatio: 2,
    profile: { modeIndex: 6, intensity: 0.8, motionScale: 1, tint: [1, 0, 0], vignette: 0.14, power: 0, hit: 0, distortion: 0, scanlines: 0.055, scanlinePeriod: 4, rgbSplitTexels: 2 },
  });
  assert.deepEqual(uniform2f, [['canvasSize', 800, 600], ['sceneSize', 320, 240], ['sampling', 4, 2]]);
});

test('packs stable sampling controls into the WebGPU uniform payload', () => {
  const previousUsage = globalThis.GPUBufferUsage;
  globalThis.GPUBufferUsage = { UNIFORM: 1, COPY_DST: 2 };
  try {
    let bufferSize;
    let uploaded;
    const pass = { setPipeline() {}, setBindGroup() {}, setViewport() {}, draw() {}, end() {} };
    const device = {
      lost: new Promise(() => {}),
      createSampler: () => ({}),
      createBuffer(descriptor) { bufferSize = descriptor.size; return {}; },
      queue: { copyExternalImageToTexture() {}, writeBuffer(_buffer, _offset, values) { uploaded = Array.from(values); }, submit() {} },
      createCommandEncoder() { return { beginRenderPass: () => pass, finish: () => ({}) }; },
    };
    const canvas = { width: 800, height: 600, ownerDocument: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, fillRect() {} }) }) } };
    const backend = new WebGPUPresentationBackend(canvas, {}, {}, device, { getCurrentTexture: () => ({ createView: () => ({}) }) }, 'rgba8unorm', {});
    Object.assign(backend, {
      sceneTexture: { texture: {} }, overlayTexture: { texture: {}, uploaded: true }, worldOverlayTexture: { texture: {}, uploaded: true },
      ensureTextures() {}, pipeline: {}, bindGroup: {},
    });
    backend.present({
      scene: { width: 320, height: 240 }, overlay: { width: 1, height: 1 }, hasOverlay: false,
      camera: { source: { x: 0, y: 0, width: 160, height: 120 }, viewport: { x: 0, y: 0, width: 400, height: 300 } },
      pixelRatio: 2,
      profile: { modeIndex: 6, intensity: 0.8, motionScale: 1, tint: [1, 0, 0], vignette: 0.14, power: 0, hit: 0, distortion: 0, scanlines: 0.055, scanlinePeriod: 4, rgbSplitTexels: 2 },
    });
    assert.equal(bufferSize, 28 * Float32Array.BYTES_PER_ELEMENT);
    assert.equal(uploaded.length, 28);
    assert.deepEqual(uploaded.slice(24, 28), [4, 2, 0, 0]);
  } finally {
    if (previousUsage === undefined) delete globalThis.GPUBufferUsage;
    else globalThis.GPUBufferUsage = previousUsage;
  }
});

function renderableCanvas() {
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; },
  });
  const ownerDocument = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
  return {
    width: 0, height: 0, clientWidth: 320, clientHeight: 240, ownerDocument,
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
  };
}

test('uses output DPR for the presented profile and reports its diagnostic subset', () => {
  const previousPixelRatio = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = 1.5;
  try {
    let presented;
    const presentationBackend = {
      kind: 'webgl2', resize() {}, present(frame) { presented = frame; },
      snapshot: () => ({ backend: 'webgl2' }),
    };
    const renderer = new PassauPixelRenderer(renderableCanvas(), { quality: 'quality', presentationBackend });
    const result = renderer.render({ level: { id: 'home', board: { columns: 9, rows: 9, walls: [] }, actors: { cats: [] }, theme: { edgeEffects: [] } } });
    assert.equal(presented.profile.scanlines, 0);
    assert.deepEqual(result.renderer.postProcess, { scanlines: 0, scanlinePeriod: 4, rgbSplitTexels: 0 });
    assert.notStrictEqual(result.renderer.postProcess, presented.profile);
  } finally {
    if (previousPixelRatio === undefined) delete globalThis.devicePixelRatio;
    else globalThis.devicePixelRatio = previousPixelRatio;
  }
});
