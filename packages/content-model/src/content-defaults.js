export const DEFAULT_DIFFICULTY_PROFILES = Object.freeze({
  easy: Object.freeze({ playerSpeed: 5.8, catSpeed: 2.55, frightenedSpeed: 1.85, catCount: 2, lives: 5, powerDuration: 12, wander: 7.2, grace: 2.2 }),
  normal: Object.freeze({ playerSpeed: 5.55, catSpeed: 3.35, frightenedSpeed: 2.55, catCount: 3, lives: 3, powerDuration: 9, wander: 4.2, grace: 1.6 }),
  hard: Object.freeze({ playerSpeed: 5.35, catSpeed: 4.05, frightenedSpeed: 3.25, catCount: 3, lives: 2, powerDuration: 7, wander: 2.1, grace: 1.1 }),
});

export const EDGE_EFFECT_TYPES = Object.freeze([
  'water-flow', 'fish', 'boat', 'leaves', 'fireflies', 'mist',
  'city-lights', 'birds', 'steam', 'sparks', 'stage-pulse',
]);

export const VISUAL_EFFECT_TYPES = Object.freeze(['glitch', 'neon', 'hologram', 'echo', 'sparkle']);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0));
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : fallback;
const slug = (value, fallback) => String(value || fallback).toLowerCase()
  .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
const normalizedEffectsCache = new WeakMap();

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
