import { validateRendererResourceMetrics } from '../src/renderer-resource-metrics.js';

function megabytes(bytes) {
  return Math.round(bytes / 1024 / 1024 * 10) / 10;
}

export function summarizeBenchmarkResources(info) {
  const resources = validateRendererResourceMetrics(info);
  if (resources.applicability === 'not-applicable') {
    return {
      resourceMetrics: {
        applicability: resources.applicability,
        reason: resources.reason,
        backingStoreResizes: resources.backingStoreResizes,
      },
    };
  }
  return {
    resourceMetrics: { applicability: resources.applicability },
    uploadedMegabytes: megabytes(resources.uploadedBytes),
    sceneUploadedMegabytes: megabytes(resources.sceneUploadedBytes),
    overlayUploadedMegabytes: megabytes(resources.overlayUploadedBytes),
    worldOverlayUploadedMegabytes: megabytes(resources.worldOverlayUploadedBytes),
    textureReallocations: resources.textureReallocations,
    gpuCropResizes: resources.gpuCropResizes,
    sceneUploadSkips: resources.sceneUploadSkips,
    overlayUploadSkips: resources.overlayUploadSkips,
    worldOverlayUploadSkips: resources.worldOverlayUploadSkips,
  };
}
