export const VISUAL_EFFECT_TYPES = Object.freeze(['glitch', 'neon', 'hologram', 'echo', 'sparkle']);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0));
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : fallback;
const slug = (value, fallback) => String(value || fallback).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
const normalizedEffectsCache = new WeakMap();
const NEON_DIRECTIONS = Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1]]);

export function normalizeVisualEffects(value) {
  if (!Array.isArray(value)) return [];
  const cached = normalizedEffectsCache.get(value);
  if (cached) return cached;
  const effects = [];
  const length = Math.min(4, value.length);
  for (let index = 0; index < length; index += 1) {
    const effect = value[index];
    effects.push({
      id: slug(effect?.id, `effect-${index + 1}`),
      type: VISUAL_EFFECT_TYPES.includes(effect?.type) ? effect.type : 'glitch',
      intensity: clamp(effect?.intensity ?? 0.55, 0.05, 1),
      speed: clamp(effect?.speed ?? 1, 0.1, 8),
      color: color(effect?.color, effect?.type === 'neon' ? '#55d9dd' : '#ff4f87'),
    });
  }
  normalizedEffectsCache.set(value, effects);
  return effects;
}

function drawEcho(context, effect, bounds, elapsed, draw) {
  const distance = Math.max(1, Math.min(bounds.width, bounds.height) * 0.12 * effect.intensity);
  for (let index = 3; index >= 1; index -= 1) {
    const phase = elapsed * effect.speed * 3 + index * 0.9;
    context.save();
    context.globalAlpha *= 0.08 + effect.intensity * 0.09;
    context.globalCompositeOperation = 'screen';
    context.translate(Math.cos(phase) * distance * index, Math.sin(phase * 0.7) * distance * index * 0.45);
    draw();
    context.restore();
  }
}

function drawGlitch(context, effect, bounds, elapsed, draw) {
  const slices = 3 + Math.round(effect.intensity * 5);
  const sliceHeight = bounds.height / slices;
  for (let index = 0; index < slices; index += 1) {
    if ((index + Math.floor(elapsed * effect.speed * 12)) % 3 === 0) continue;
    const jitter = Math.sin(elapsed * effect.speed * 31 + index * 12.7) * bounds.width * 0.12 * effect.intensity;
    context.save();
    context.beginPath(); context.rect(bounds.left - 4, bounds.top + index * sliceHeight, bounds.width + 8, sliceHeight + 1); context.clip();
    context.globalAlpha *= 0.14 + effect.intensity * 0.2;
    context.globalCompositeOperation = 'screen';
    context.translate(Math.round(jitter), 0); draw(); context.restore();
  }
}

function drawHologramGhost(context, effect, bounds, elapsed, draw) {
  const distance = Math.max(1, Math.round(Math.min(bounds.width, bounds.height) * 0.05 * effect.intensity));
  const phase = Math.sin(elapsed * effect.speed * 9) >= 0 ? 1 : -1;
  context.save();
  context.globalAlpha *= 0.08 + effect.intensity * 0.12;
  context.globalCompositeOperation = 'screen';
  context.translate(distance * phase, -distance);
  draw();
  context.restore();
}

function drawSparkles(context, effect, bounds, elapsed) {
  const count = 3 + Math.round(effect.intensity * 8);
  context.save(); context.fillStyle = effect.color;
  for (let index = 0; index < count; index += 1) {
    const phase = elapsed * effect.speed * (0.8 + index * 0.03) + index * 2.417;
    const x = bounds.left + (Math.sin(phase * 1.7) * 0.5 + 0.5) * bounds.width;
    const y = bounds.top + (Math.cos(phase * 1.13) * 0.5 + 0.5) * bounds.height;
    const visible = Math.sin(phase * 5.3) > 0.1;
    if (visible) { const size = 1 + (index % 2); context.globalAlpha = 0.35 + effect.intensity * 0.55; context.fillRect(Math.round(x), Math.round(y), size, size); }
  }
  context.restore();
}

function drawNeonGlow(context, effect, bounds, elapsed, draw) {
  const pulse = 0.7 + (Math.sin(elapsed * effect.speed * 4) * 0.5 + 0.5) * 0.3;
  const distance = Math.max(1, Math.round(Math.min(bounds.width, bounds.height) * (0.025 + effect.intensity * 0.035)));
  for (const [directionX, directionY] of NEON_DIRECTIONS) {
    context.save();
    context.globalAlpha *= (0.035 + effect.intensity * 0.055) * pulse;
    context.globalCompositeOperation = 'screen';
    context.translate(directionX * distance, directionY * distance);
    draw();
    context.restore();
  }
}

export function drawWithVisualEffects(context, value, bounds, elapsed, draw) {
  const effects = normalizeVisualEffects(value);
  if (!effects.length) return draw();

  let hologram = null;
  let neon = null;
  for (const effect of effects) {
    if (!hologram && effect.type === 'hologram') hologram = effect;
    if (!neon && effect.type === 'neon') neon = effect;
  }

  context.save();
  if (hologram) {
    context.globalAlpha *= 0.58 + (Math.sin(elapsed * hologram.speed * 8) * 0.5 + 0.5) * 0.3;
    context.globalCompositeOperation = 'screen';
  }
  const result = draw();
  context.restore();
  if (result === false) return false;

  for (const effect of effects) if (effect.type === 'echo') drawEcho(context, effect, bounds, elapsed, draw);
  if (neon) drawNeonGlow(context, neon, bounds, elapsed, draw);
  if (hologram) drawHologramGhost(context, hologram, bounds, elapsed, draw);
  for (const effect of effects) {
    if (effect.type === 'glitch') drawGlitch(context, effect, bounds, elapsed, draw);
    else if (effect.type === 'sparkle') drawSparkles(context, effect, bounds, elapsed);
  }
  return result;
}
