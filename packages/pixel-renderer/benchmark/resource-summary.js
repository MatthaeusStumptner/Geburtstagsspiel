import { validateRendererResourceMetrics } from '../src/renderer-resource-metrics.js';

function requireFiniteNonNegative(info, key) {
  const value = info[key];
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${key} must be a finite non-negative number`);
  }
  return value;
}

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
        backingStoreResizes: resources.value,
      },
    };
  }
  return {
    resourceMetrics: { applicability: resources.applicability },
    uploadedMegabytes: megabytes(requireFiniteNonNegative(info, 'uploadedBytes')),
    sceneUploadedMegabytes: megabytes(requireFiniteNonNegative(info, 'sceneUploadedBytes')),
    overlayUploadedMegabytes: megabytes(requireFiniteNonNegative(info, 'overlayUploadedBytes')),
    worldOverlayUploadedMegabytes: megabytes(requireFiniteNonNegative(info, 'worldOverlayUploadedBytes')),
    textureReallocations: requireFiniteNonNegative(info, 'textureReallocations'),
    gpuCropResizes: requireFiniteNonNegative(info, 'gpuCropResizes'),
    sceneUploadSkips: requireFiniteNonNegative(info, 'sceneUploadSkips'),
    overlayUploadSkips: requireFiniteNonNegative(info, 'overlayUploadSkips'),
    worldOverlayUploadSkips: requireFiniteNonNegative(info, 'worldOverlayUploadSkips'),
  };
}