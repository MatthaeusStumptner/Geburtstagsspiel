export function createGamePresentation(snapshot, {
  alpha = snapshot?.interpolationAlpha ?? 1,
  viewport,
  cameraEnabled = true,
  language = 'standard',
  cameraTarget,
  zoom = 1.12,
  reducedMotion = false,
  presentationTime = snapshot?.elapsed,
  staticRevision,
  sceneChanged = true,
} = {}) {
  if (!snapshot || typeof snapshot !== 'object') throw new TypeError('game snapshot is required');
  if (!Number.isFinite(presentationTime)) throw new TypeError('game presentationTime must be finite');
  return Object.freeze({
    snapshot,
    options: Object.freeze({
      alpha,
      viewport,
      cameraEnabled: Boolean(cameraEnabled),
      language,
      cameraTarget,
      zoom,
      reducedMotion: Boolean(reducedMotion),
      presentationTime,
      staticRevision,
      sceneChanged: Boolean(sceneChanged),
    }),
  });
}
