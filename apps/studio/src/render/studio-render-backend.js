const BACKENDS = new Set(['auto', 'canvas2d', 'webgl2', 'webgpu']);

export function resolveStudioRendererBackend(search, { development = false } = {}) {
  if (!development) return 'auto';
  const requested = new URLSearchParams(search).get('renderer');
  return BACKENDS.has(requested) ? requested : 'auto';
}
