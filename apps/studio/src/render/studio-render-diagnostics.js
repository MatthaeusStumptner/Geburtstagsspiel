import { isPresentationFrame, serializePresentationFrame } from '@franz-lola/pixel-renderer';

const surfaces = new Map();

const canonicalId = (value) => typeof value === 'string' && value.length > 0 && value.trim() === value;

export function captureStudioPresentation(id, frame, { renderCount, profile } = {}) {
  if (!canonicalId(id)) throw new TypeError('Studio diagnostic surface id must be canonical.');
  if (!isPresentationFrame(frame)) throw new TypeError('Studio diagnostic capture requires a valid PresentationFrame.');
  if (!Number.isSafeInteger(renderCount) || renderCount < 0) throw new TypeError('Studio diagnostic renderCount must be a non-negative safe integer.');
  if (!canonicalId(profile)) throw new TypeError('Studio diagnostic profile must be canonical.');
  surfaces.set(id, Object.freeze({ frame, renderCount, profile }));
}

export function studioRenderDiagnostics() {
  return {
    surfaces: Object.fromEntries([...surfaces].map(([id, capture]) => [id, {
      frame: serializePresentationFrame(capture.frame),
      renderCount: capture.renderCount,
      profile: capture.profile,
    }])),
  };
}
