import { drawCat, drawWalker } from './painters/characters.js';
import { drawWithVisualEffects } from './visual-effects.js';

const PREVIEW_TILE_SIZE = 64;

/**
 * Draws the exact actor painter used by the game into an arbitrary preview box.
 * Custom appearances, directional states, animation timing and default fallback
 * actors therefore look identical in games and authoring tools.
 */
export function drawActorPreview(context, actor = {}, bounds = {}, options = {}) {
  if (!context) return false;
  const width = Math.max(1, Number(bounds.width) || PREVIEW_TILE_SIZE);
  const height = Math.max(1, Number(bounds.height) || PREVIEW_TILE_SIZE);
  const size = Math.min(width, height);
  const left = (Number(bounds.left) || 0) + (width - size) / 2;
  const top = (Number(bounds.top) || 0) + (height - size) / 2;
  const state = options.state || 'idle';
  const elapsed = Math.max(0, Number(options.elapsed) || 0);
  const animationId = options.animationId || actor.animation || '';
  const previewActor = {
    ...actor,
    x: 0,
    y: 0,
    direction: state,
    nextDirection: state,
    dir: state,
    nextDir: state,
    animation: animationId,
    elapsed,
    respawnTimer: 0,
  };

  context.save();
  context.beginPath();
  context.rect(Number(bounds.left) || 0, Number(bounds.top) || 0, width, height);
  context.clip();
  context.translate(left, top);
  context.scale(size / PREVIEW_TILE_SIZE, size / PREVIEW_TILE_SIZE);
  const draw = () => options.kind === 'cat'
    ? drawCat(context, previewActor, PREVIEW_TILE_SIZE, {
      frightened: Boolean(options.frightened),
      frightenedTime: Number(options.frightenedTime) || 0,
    })
    : drawWalker(context, previewActor, PREVIEW_TILE_SIZE, { elapsed, hitTimer: 0 });
  drawWithVisualEffects(context, previewActor.effects, { left: 0, top: 0, width: PREVIEW_TILE_SIZE, height: PREVIEW_TILE_SIZE }, elapsed, draw);
  context.restore();
  return true;
}
