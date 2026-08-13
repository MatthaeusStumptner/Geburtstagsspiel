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

function exactDataProperties(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    throw new TypeError(`${label} contains unknown or missing resource keys`);
  }
  for (const key of expectedKeys) {
    if (!descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value')) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  return descriptors;
}

export function validateRendererResourceMetrics(info) {
  if (!info || typeof info !== 'object') throw new TypeError('renderer resource diagnostics are missing');
  const backend = info.backend;
  if (backend === 'canvas2d') {
    const metrics = exactDataProperties(info.resourceMetrics, ['applicability', 'reason'], 'resourceMetrics');
    const applicability = metrics.applicability.value;
    const reason = metrics.reason.value;
    if (applicability !== 'not-applicable' || reason !== 'canvas2d-cpu-compositor') {
      throw new TypeError('Canvas2D requires not-applicable canvas2d-cpu-compositor resource metrics');
    }
    for (const field of GPU_ONLY_RENDERER_FIELDS) {
      if (Object.hasOwn(info, field)) throw new TypeError(`Canvas2D must not expose ${field} as a fake GPU metric`);
    }
    const backingStoreResizes = finiteNonNegative(info, 'backingStoreResizes');
    return {
      applicability,
      reason,
      kind: 'canvas-backing-store',
      value: backingStoreResizes,
      backingStoreResizes,
    };
  }
  if (backend !== 'webgl2' && backend !== 'webgpu') {
    throw new TypeError('renderer backend must be canvas2d, webgl2, or webgpu');
  }
  const metrics = exactDataProperties(info.resourceMetrics, ['applicability'], 'resourceMetrics');
  if (metrics.applicability.value !== 'applicable') {
    throw new TypeError(`${backend} requires applicable GPU resource metrics`);
  }
  if (Object.hasOwn(info, 'backingStoreResizes')) {
    throw new TypeError(`${backend} must not expose the Canvas2D backingStoreResizes resource metric`);
  }
  const normalized = Object.fromEntries(GPU_ONLY_RENDERER_FIELDS.map((field) => [field, finiteNonNegative(info, field)]));
  return {
    applicability: 'applicable',
    kind: 'gpu-textures',
    value: normalized.textureReallocations,
    ...normalized,
  };
}
