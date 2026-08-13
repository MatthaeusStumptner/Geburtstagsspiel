import { WEBGPU_SHADER } from './shaders.js';

const UNIFORM_FLOATS = 28;

export class WebGPUPresentationBackend {
  constructor(canvas, gpu, adapter, device, context, format, pipeline) {
    this.canvas = canvas;
    this.gpu = gpu;
    this.adapter = adapter;
    this.device = device;
    this.context = context;
    this.format = format;
    this.pipeline = pipeline;
    this.kind = 'webgpu';
    this.frameCount = 0;
    this.uploadedBytes = 0;
    this.sceneUploadedBytes = 0;
    this.overlayUploadedBytes = 0;
    this.worldOverlayUploadedBytes = 0;
    this.textureReallocations = 0;
    this.sceneUploadSkips = 0;
    this.overlayUploadSkips = 0;
    this.worldOverlayUploadSkips = 0;
    this.uniforms = new Float32Array(UNIFORM_FLOATS);
    this.contextLost = false;
    this.destroyed = false;
    this.emptyOverlay = (canvas.ownerDocument ?? globalThis.document).createElement('canvas');
    this.emptyOverlay.width = 1; this.emptyOverlay.height = 1;
    const emptyOverlayContext = this.emptyOverlay.getContext('2d');
    emptyOverlayContext.clearRect(0, 0, 1, 1);
    emptyOverlayContext.fillStyle = 'rgba(0, 0, 0, 0)'; emptyOverlayContext.fillRect(0, 0, 1, 1);
    this.sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.watchDevice();
  }

  watchDevice() {
    this.device.lost.then((info) => {
      this.contextLost = true;
      if (!this.destroyed && info.reason !== 'destroyed') this.recover();
    });
  }

  async recover() {
    try {
      const replacement = await initializeWebGPU(this.canvas, { gpu: this.gpu, adapter: this.adapter });
      if (!replacement || this.destroyed) return;
      this.device = replacement.device;
      this.context = replacement.context;
      this.format = replacement.format;
      this.pipeline = replacement.pipeline;
      this.sampler = this.device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
      this.uniformBuffer = this.device.createBuffer({ size: UNIFORM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.sceneTexture = null;
      this.overlayTexture = null;
      this.worldOverlayTexture = null;
      this.bindGroup = null;
      this.contextLost = false;
      this.watchDevice();
    } catch {
      // A subsequent resize or page reload can retry adapter creation.
    }
  }

  resize(width, height) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
  }

  ensureTextures(scene, overlay, worldOverlay) {
    // Chromium's copyExternalImageToTexture validation requires imported canvas
    // destinations to be both copy targets and render attachments.
    const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT;
    let changed = false;
    if (!this.sceneTexture || this.sceneTexture.width !== scene.width || this.sceneTexture.height !== scene.height) {
      this.sceneTexture?.texture.destroy();
      this.sceneTexture = {
        width: scene.width,
        height: scene.height,
        texture: this.device.createTexture({ size: [scene.width, scene.height], format: 'rgba8unorm', usage }),
        uploaded: false,
      };
      this.textureReallocations += 1;
      changed = true;
    }
    if (!this.overlayTexture || this.overlayTexture.width !== overlay.width || this.overlayTexture.height !== overlay.height) {
      this.overlayTexture?.texture.destroy();
      this.overlayTexture = {
        width: overlay.width,
        height: overlay.height,
        texture: this.device.createTexture({ size: [overlay.width, overlay.height], format: 'rgba8unorm', usage }),
        uploaded: false,
      };
      this.textureReallocations += 1;
      changed = true;
    }
    if (!this.worldOverlayTexture || this.worldOverlayTexture.width !== worldOverlay.width || this.worldOverlayTexture.height !== worldOverlay.height) {
      this.worldOverlayTexture?.texture.destroy();
      this.worldOverlayTexture = {
        width: worldOverlay.width,
        height: worldOverlay.height,
        texture: this.device.createTexture({ size: [worldOverlay.width, worldOverlay.height], format: 'rgba8unorm', usage }),
        uploaded: false,
      };
      this.textureReallocations += 1;
      changed = true;
    }
    if (!changed && this.bindGroup) return;
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sceneTexture.texture.createView() },
        { binding: 1, resource: this.overlayTexture.texture.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.uniformBuffer } },
        { binding: 4, resource: this.worldOverlayTexture.texture.createView() },
      ],
    });
  }

  present({ scene, sceneChanged = true, overlay, hasOverlay = true, overlayChanged = true, worldOverlay, hasWorldOverlay = false, worldOverlayChanged = true, camera, worldCamera = camera, pixelRatio, profile, elapsed = 0, sceneScale = 2, worldOverlayScale = 2 }) {
    if (this.contextLost) return;
    const overlaySource = hasOverlay ? overlay : this.emptyOverlay;
    const worldOverlaySource = hasWorldOverlay ? worldOverlay : this.emptyOverlay;
    this.ensureTextures(scene, overlaySource, worldOverlaySource);
    let sceneBytes = 0;
    if (sceneChanged || !this.sceneTexture.uploaded) {
      this.device.queue.copyExternalImageToTexture({ source: scene }, { texture: this.sceneTexture.texture }, [scene.width, scene.height]);
      this.sceneTexture.uploaded = true;
      sceneBytes = scene.width * scene.height * 4;
    } else {
      this.sceneUploadSkips += 1;
    }
    let overlayBytes = 0;
    if (overlayChanged || !this.overlayTexture.uploaded) {
      this.device.queue.copyExternalImageToTexture({ source: overlaySource }, { texture: this.overlayTexture.texture }, [overlaySource.width, overlaySource.height]);
      this.overlayTexture.uploaded = true;
      overlayBytes = overlaySource.width * overlaySource.height * 4;
    } else {
      this.overlayUploadSkips += 1;
    }
    let worldOverlayBytes = 0;
    if (worldOverlayChanged || !this.worldOverlayTexture.uploaded) {
      this.device.queue.copyExternalImageToTexture({ source: worldOverlaySource }, { texture: this.worldOverlayTexture.texture }, [worldOverlaySource.width, worldOverlaySource.height]);
      this.worldOverlayTexture.uploaded = true;
      worldOverlayBytes = worldOverlaySource.width * worldOverlaySource.height * 4;
    } else {
      this.worldOverlayUploadSkips += 1;
    }
    this.sceneUploadedBytes += sceneBytes;
    this.overlayUploadedBytes += overlayBytes;
    this.worldOverlayUploadedBytes += worldOverlayBytes;
    this.uploadedBytes += sceneBytes + overlayBytes + worldOverlayBytes;
    const uniforms = this.uniforms;
    uniforms[0] = camera.source.x * sceneScale / scene.width;
    uniforms[1] = camera.source.y * sceneScale / scene.height;
    uniforms[2] = camera.source.width * sceneScale / scene.width;
    uniforms[3] = camera.source.height * sceneScale / scene.height;
    uniforms[4] = hasWorldOverlay ? worldCamera.source.x * worldOverlayScale / worldOverlaySource.width : 0;
    uniforms[5] = hasWorldOverlay ? worldCamera.source.y * worldOverlayScale / worldOverlaySource.height : 0;
    uniforms[6] = hasWorldOverlay ? worldCamera.source.width * worldOverlayScale / worldOverlaySource.width : 1;
    uniforms[7] = hasWorldOverlay ? worldCamera.source.height * worldOverlayScale / worldOverlaySource.height : 1;
    uniforms[8] = this.canvas.width;
    uniforms[9] = this.canvas.height;
    uniforms[10] = scene.width;
    uniforms[11] = scene.height;
    uniforms[12] = elapsed;
    uniforms[13] = profile.modeIndex;
    uniforms[14] = profile.intensity;
    uniforms[15] = profile.motionScale;
    uniforms[16] = profile.tint[0];
    uniforms[17] = profile.tint[1];
    uniforms[18] = profile.tint[2];
    uniforms[19] = profile.vignette;
    uniforms[20] = profile.power;
    uniforms[21] = profile.hit;
    uniforms[22] = profile.distortion;
    uniforms[23] = profile.scanlines;
    uniforms[24] = profile.scanlinePeriod ?? 4;
    uniforms[25] = profile.rgbSplitTexels ?? 0;
    uniforms[26] = 0;
    uniforms[27] = 0;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.015, g: 0.035, b: 0.048, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setViewport(
      Math.round(camera.viewport.x * pixelRatio),
      Math.round(camera.viewport.y * pixelRatio),
      Math.max(1, Math.round(camera.viewport.width * pixelRatio)),
      Math.max(1, Math.round(camera.viewport.height * pixelRatio)),
      0,
      1,
    );
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.frameCount += 1;
  }

  async finish() { if (!this.contextLost) await this.device.queue.onSubmittedWorkDone(); }

  snapshot() {
    return {
      backend: this.kind,
      frameCount: this.frameCount,
      gpuAccelerated: true,
      contextLost: this.contextLost,
      resourceMetrics: { applicability: 'applicable' },
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
    this.destroyed = true;
    this.sceneTexture?.texture.destroy();
    this.overlayTexture?.texture.destroy();
    this.worldOverlayTexture?.texture.destroy();
    this.uniformBuffer?.destroy();
    this.device?.destroy();
  }
}

export function webGPUAdapterOptions(options = {}, environment = globalThis.navigator) {
  const platform = environment?.userAgentData?.platform ?? environment?.platform ?? '';
  if (/windows/i.test(platform)) return {};
  return options.powerPreference ? { powerPreference: options.powerPreference } : {};
}

async function initializeWebGPU(canvas, options = {}) {
  const gpu = options.gpu ?? globalThis.navigator?.gpu;
  if (!gpu) return null;
  const adapter = options.adapter ?? await gpu.requestAdapter(webGPUAdapterOptions(options));
  if (!adapter) return null;
  let device;
  try {
    device = await adapter.requestDevice();
    const module = device.createShaderModule({ code: WEBGPU_SHADER });
    const compilation = await module.getCompilationInfo?.();
    const errors = compilation?.messages?.filter((message) => message.type === 'error') ?? [];
    if (errors.length) throw new Error(errors.map((error) => error.message).join('\n'));
    const format = gpu.getPreferredCanvasFormat();
    const pipeline = await device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const context = canvas.getContext('webgpu');
    if (!context) {
      device.destroy();
      return null;
    }
    context.configure({ device, format, alphaMode: 'opaque' });
    return { gpu, adapter, device, context, format, pipeline };
  } catch (error) {
    device?.destroy();
    throw error;
  }
}

export async function createWebGPUBackend(canvas, options = {}) {
  const initialized = await initializeWebGPU(canvas, options);
  if (!initialized) return null;
  try {
    return new WebGPUPresentationBackend(canvas, initialized.gpu, initialized.adapter, initialized.device, initialized.context, initialized.format, initialized.pipeline);
  } catch (error) {
    initialized.device.destroy();
    throw error;
  }
}
