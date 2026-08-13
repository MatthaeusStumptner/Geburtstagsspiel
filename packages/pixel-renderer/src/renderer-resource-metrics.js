export const GPU_ONLY_RENDERER_FIELDS = Object.freeze([
  'uploadedBytes',
  'sceneUploadedBytes',
  'overlayUploadedBytes',
  'worldOverlayUploadedBytes',
  'textureReallocations',
  'gpuCropResizes',
  'sceneUploadSkips',
  'overlayUploadSkips',
  'worldOverlayUploadSkips',
]);

function finiteNonNegative(info, field) {
  const value = info?.[field];
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a finite non-negative number`);
  }
  return value;
}

export function validateRendererResourceMetrics(info) {
  if (!info || typeof info !== 'object') throw new TypeError('renderer resource diagnostics are missing');
  const applicability = info.resourceMetrics?.applicability;
  if (applicability === 'not-applicable') {
    const reason = info.resourceMetrics.reason;
    if (reason !== 'canvas2d-cpu-compositor') {
      throw new TypeError('Canvas2D resource metrics require the canvas2d-cpu-compositor reason');
    }
    for (const field of GPU_ONLY_RENDERER_FIELDS) {
      if (Object.hasOwn(info, field)) throw new TypeError(`Canvas2D must not expose ${field} as a fake GPU metric`);
    }
    return {
      applicability,
      reason,
      kind: 'canvas-backing-store',
      value: finiteNonNegative(info, 'backingStoreResizes'),
    };
  }
  if (applicability !== 'applicable') {
    throw new TypeError('renderer resourceMetrics.applicability must be explicit');
  }
  for (const field of GPU_ONLY_RENDERER_FIELDS) finiteNonNegative(info, field);
  return {
    applicability,
    kind: 'gpu-textures',
    value: info.textureReallocations,
  };
}
