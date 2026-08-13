export class Canvas2DPresentationBackend {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    if (!this.context) throw new Error('Canvas2D-Kontext konnte nicht erstellt werden.');
    this.kind = 'canvas2d';
    this.frameCount = 0;
  }

  resize(width, height) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  present({ scene, overlay, hasOverlay = true, worldOverlay, hasWorldOverlay = false, camera, worldCamera = camera, pixelRatio, sceneScale = 2, worldOverlayScale = 2 }) {
    const context = this.context;
    const { source, viewport } = camera;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      scene,
      source.x * sceneScale,
      source.y * sceneScale,
      source.width * sceneScale,
      source.height * sceneScale,
      viewport.x * pixelRatio,
      viewport.y * pixelRatio,
      viewport.width * pixelRatio,
      viewport.height * pixelRatio,
    );
    if (hasWorldOverlay && worldOverlay) {
      context.drawImage(
        worldOverlay,
        worldCamera.source.x * worldOverlayScale,
        worldCamera.source.y * worldOverlayScale,
        worldCamera.source.width * worldOverlayScale,
        worldCamera.source.height * worldOverlayScale,
        worldCamera.viewport.x * pixelRatio,
        worldCamera.viewport.y * pixelRatio,
        worldCamera.viewport.width * pixelRatio,
        worldCamera.viewport.height * pixelRatio,
      );
    }
    if (hasOverlay && overlay) context.drawImage(overlay, 0, 0);
    this.frameCount += 1;
  }

  snapshot() {
    return {
      backend: this.kind,
      frameCount: this.frameCount,
      gpuAccelerated: false,
      contextLost: false,
      uploadedBytes: 0,
      sceneUploadedBytes: 0,
      overlayUploadedBytes: 0,
      worldOverlayUploadedBytes: 0,
      textureReallocations: 0,
    };
  }

  finish() {}
  destroy() {}
}
