import { WEBGL_FRAGMENT_SHADER, WEBGL_VERTEX_SHADER } from './shaders.js';

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unbekannter Shaderfehler';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl) {
  let vertex;
  let fragment;
  let program;
  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, WEBGL_VERTEX_SHADER);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, WEBGL_FRAGMENT_SHADER);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex); vertex = null;
    gl.deleteShader(fragment); fragment = null;
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'WebGL-Programm konnte nicht verknüpft werden.';
      throw new Error(message);
    }
    return program;
  } catch (error) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    throw error;
  }
}

function createTexture() {
  return { texture: null, width: 0, height: 0, uploaded: false };
}

function allocateTexture(gl, record, width, height) {
  if (record.texture) gl.deleteTexture(record.texture);
  record.texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, record.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  record.width = width;
  record.height = height;
  record.uploaded = false;
}

function uploadCanvas(gl, record, source, changed = true) {
  let reallocated = false;
  if (!record.texture || record.width !== source.width || record.height !== source.height) {
    allocateTexture(gl, record, source.width, source.height);
    reallocated = true;
  } else {
    gl.bindTexture(gl.TEXTURE_2D, record.texture);
  }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (!changed && record.uploaded) return { bytes: 0, reallocated };
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  record.uploaded = true;
  return { bytes: source.width * source.height * 4, reallocated };
}

export class WebGL2PresentationBackend {
  constructor(canvas, context) {
    this.canvas = canvas;
    this.gl = context;
    this.kind = 'webgl2';
    this.frameCount = 0;
    this.uploadedBytes = 0;
    this.sceneUploadedBytes = 0;
    this.overlayUploadedBytes = 0;
    this.worldOverlayUploadedBytes = 0;
    this.textureReallocations = 0;
    this.sceneUploadSkips = 0;
    this.overlayUploadSkips = 0;
    this.worldOverlayUploadSkips = 0;
    this.contextLost = false;
    this.emptyOverlay = (canvas.ownerDocument ?? globalThis.document).createElement('canvas');
    this.emptyOverlay.width = 1; this.emptyOverlay.height = 1;
    this.handleLost = (event) => { event.preventDefault(); this.contextLost = true; };
    this.handleRestored = () => { this.contextLost = false; this.initialize(); };
    this.initialize();
    canvas.addEventListener?.('webglcontextlost', this.handleLost);
    canvas.addEventListener?.('webglcontextrestored', this.handleRestored);
  }

  initialize() {
    const gl = this.gl;
    this.program = createProgram(gl);
    this.sceneTexture = createTexture(gl);
    this.overlayTexture = createTexture(gl);
    this.worldOverlayTexture = createTexture(gl);
    this.locations = {
      scene: gl.getUniformLocation(this.program, 'u_scene'),
      overlay: gl.getUniformLocation(this.program, 'u_overlay'),
      worldOverlay: gl.getUniformLocation(this.program, 'u_world_overlay'),
      source: gl.getUniformLocation(this.program, 'u_source'),
      worldSource: gl.getUniformLocation(this.program, 'u_world_source'),
      canvasSize: gl.getUniformLocation(this.program, 'u_canvas_size'),
      sceneSize: gl.getUniformLocation(this.program, 'u_scene_size'),
      sampling: gl.getUniformLocation(this.program, 'u_sampling'),
      effect: gl.getUniformLocation(this.program, 'u_effect'),
      tint: gl.getUniformLocation(this.program, 'u_tint'),
      feedback: gl.getUniformLocation(this.program, 'u_feedback'),
    };
    gl.useProgram(this.program);
    gl.uniform1i(this.locations.scene, 0);
    gl.uniform1i(this.locations.overlay, 1);
    gl.uniform1i(this.locations.worldOverlay, 2);
  }

  resize(width, height) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  present({ scene, sceneChanged = true, overlay, hasOverlay = true, overlayChanged = true, worldOverlay, hasWorldOverlay = false, worldOverlayChanged = true, camera, worldCamera = camera, pixelRatio, profile, elapsed = 0, sceneScale = 2, worldOverlayScale = 2 }) {
    const gl = this.gl;
    if (this.contextLost || gl.isContextLost?.()) return;
    gl.activeTexture(gl.TEXTURE0);
    const sceneUpload = uploadCanvas(gl, this.sceneTexture, scene, sceneChanged);
    gl.activeTexture(gl.TEXTURE1);
    const overlaySource = hasOverlay ? overlay : this.emptyOverlay;
    const overlayUpload = uploadCanvas(gl, this.overlayTexture, overlaySource, overlayChanged);
    gl.activeTexture(gl.TEXTURE2);
    const worldOverlaySource = hasWorldOverlay ? worldOverlay : this.emptyOverlay;
    const worldOverlayUpload = uploadCanvas(gl, this.worldOverlayTexture, worldOverlaySource, worldOverlayChanged);
    this.sceneUploadedBytes += sceneUpload.bytes;
    this.overlayUploadedBytes += overlayUpload.bytes;
    this.worldOverlayUploadedBytes += worldOverlayUpload.bytes;
    this.uploadedBytes += sceneUpload.bytes + overlayUpload.bytes + worldOverlayUpload.bytes;
    this.textureReallocations += Number(sceneUpload.reallocated) + Number(overlayUpload.reallocated) + Number(worldOverlayUpload.reallocated);
    if (!sceneChanged && sceneUpload.bytes === 0) this.sceneUploadSkips += 1;
    if (!overlayChanged && overlayUpload.bytes === 0) this.overlayUploadSkips += 1;
    if (!worldOverlayChanged && worldOverlayUpload.bytes === 0) this.worldOverlayUploadSkips += 1;

    const viewportX = Math.round(camera.viewport.x * pixelRatio);
    const viewportWidth = Math.max(1, Math.round(camera.viewport.width * pixelRatio));
    const viewportHeight = Math.max(1, Math.round(camera.viewport.height * pixelRatio));
    const viewportY = this.canvas.height - Math.round((camera.viewport.y + camera.viewport.height) * pixelRatio);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0.015, 0.035, 0.048, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(viewportX, viewportY, viewportWidth, viewportHeight);
    gl.useProgram(this.program);
    gl.uniform4f(this.locations.source,
      camera.source.x * sceneScale / scene.width,
      camera.source.y * sceneScale / scene.height,
      camera.source.width * sceneScale / scene.width,
      camera.source.height * sceneScale / scene.height);
    if (hasWorldOverlay) {
      gl.uniform4f(this.locations.worldSource,
        worldCamera.source.x * worldOverlayScale / worldOverlaySource.width,
        worldCamera.source.y * worldOverlayScale / worldOverlaySource.height,
        worldCamera.source.width * worldOverlayScale / worldOverlaySource.width,
        worldCamera.source.height * worldOverlayScale / worldOverlaySource.height);
    } else {
      gl.uniform4f(this.locations.worldSource, 0, 0, 1, 1);
    }
    gl.uniform2f(this.locations.canvasSize, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.locations.sceneSize, scene.width, scene.height);
    gl.uniform2f(this.locations.sampling, profile.scanlinePeriod ?? 4, profile.rgbSplitTexels ?? 0);
    gl.uniform4f(this.locations.effect, elapsed, profile.modeIndex, profile.intensity, profile.motionScale);
    gl.uniform4f(this.locations.tint, profile.tint[0], profile.tint[1], profile.tint[2], profile.vignette);
    gl.uniform4f(this.locations.feedback, profile.power, profile.hit, profile.distortion, profile.scanlines);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.frameCount += 1;
  }

  finish() { if (!this.contextLost) this.gl.finish(); }

  snapshot() {
    return {
      backend: this.kind,
      frameCount: this.frameCount,
      gpuAccelerated: true,
      contextLost: this.contextLost,
      uploadedBytes: this.uploadedBytes,
      sceneUploadedBytes: this.sceneUploadedBytes,
      overlayUploadedBytes: this.overlayUploadedBytes,
      worldOverlayUploadedBytes: this.worldOverlayUploadedBytes,
      textureReallocations: this.textureReallocations,
      sceneUploadSkips: this.sceneUploadSkips,
      overlayUploadSkips: this.overlayUploadSkips,
      worldOverlayUploadSkips: this.worldOverlayUploadSkips,
    };
  }

  destroy() {
    this.canvas.removeEventListener?.('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener?.('webglcontextrestored', this.handleRestored);
    if (this.contextLost) return;
    this.gl.deleteTexture(this.sceneTexture?.texture);
    this.gl.deleteTexture(this.overlayTexture?.texture);
    this.gl.deleteTexture(this.worldOverlayTexture?.texture);
    this.gl.deleteProgram(this.program);
  }
}

export function createWebGL2Backend(canvas, options = {}) {
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    desynchronized: options.desynchronized !== false,
    powerPreference: options.powerPreference ?? 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!context || typeof context.createShader !== 'function') return null;
  return new WebGL2PresentationBackend(canvas, context);
}
