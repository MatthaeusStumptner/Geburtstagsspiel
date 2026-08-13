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
  const applicability = info?.resourceMetrics?.applicability;
  if (applicability === 'not-applicable') {
    const reason = info.resourceMetrics.reason;
    if (typeof reason !== 'string' || reason.length === 0) {
      throw new TypeError('not-applicable resource metrics require a reason');
    }
    for (const key of [
      'uploadedBytes', 'sceneUploadedBytes', 'overlayUploadedBytes', 'worldOverlayUploadedBytes',
      'textureReallocations', 'gpuCropResizes', 'overlayUploadSkips', 'worldOverlayUploadSkips',
    ]) {
      if (Object.hasOwn(info, key)) throw new TypeError(`Canvas2D must not expose ${key} as a fake GPU metric`);
    }
    return {
      resourceMetrics: {
        applicability,
        reason,
        backingStoreResizes: requireFiniteNonNegative(info, 'backingStoreResizes'),
      },
    };
  }
  if (applicability !== 'applicable') {
    throw new TypeError('renderer resourceMetrics.applicability must be explicit');
  }
  return {
    resourceMetrics: { applicability },
    uploadedMegabytes: megabytes(requireFiniteNonNegative(info, 'uploadedBytes')),
    sceneUploadedMegabytes: megabytes(requireFiniteNonNegative(info, 'sceneUploadedBytes')),
    overlayUploadedMegabytes: megabytes(requireFiniteNonNegative(info, 'overlayUploadedBytes')),
    worldOverlayUploadedMegabytes: megabytes(requireFiniteNonNegative(info, 'worldOverlayUploadedBytes')),
    textureReallocations: requireFiniteNonNegative(info, 'textureReallocations'),
    gpuCropResizes: requireFiniteNonNegative(info, 'gpuCropResizes'),
    overlayUploadSkips: requireFiniteNonNegative(info, 'overlayUploadSkips'),
    worldOverlayUploadSkips: requireFiniteNonNegative(info, 'worldOverlayUploadSkips'),
  };
}
