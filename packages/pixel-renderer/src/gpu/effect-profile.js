const EFFECT_MODES = Object.freeze({
  ambient: 0,
  water: 1,
  mist: 2,
  nature: 3,
  city: 4,
  industrial: 5,
  stage: 6,
});

const MODE_PRIORITY = Object.freeze([
  ['stage', new Set(['stage-pulse'])],
  ['industrial', new Set(['steam', 'sparks'])],
  ['water', new Set(['water-flow', 'fish', 'boat'])],
  ['nature', new Set(['leaves', 'fireflies'])],
  ['city', new Set(['city-lights', 'birds'])],
  ['mist', new Set(['fog'])],
]);

// Each shipped level gets its own restrained visual signature. Distortion is
// intentionally separate from atmosphere so a level can keep tint, fog or
// sparkles without making the entire playfield wobble.
export const LEVEL_EFFECT_PROFILES = Object.freeze({
  home: Object.freeze({ mode: 'nature', intensityScale: 0.48, distortion: 0.02, tint: '#71c99a' }),
  hals: Object.freeze({ mode: 'water', intensityScale: 0.68, distortion: 0.28, tint: '#397fa4' }),
  oberhaus: Object.freeze({ mode: 'mist', intensityScale: 0.62, distortion: 0.06, tint: '#a6b7c6' }),
  dom: Object.freeze({ mode: 'city', intensityScale: 0.5, distortion: 0.02, tint: '#e3bd69' }),
  dreifluesseeck: Object.freeze({ mode: 'water', intensityScale: 0.78, distortion: 0.34, tint: '#44b9c8' }),
  uni: Object.freeze({ mode: 'city', intensityScale: 0.56, distortion: 0.04, tint: '#82c7d4' }),
  bschuett: Object.freeze({ mode: 'nature', intensityScale: 0.62, distortion: 0.04, tint: '#77cf88' }),
  tabakfabrik: Object.freeze({ mode: 'industrial', intensityScale: 0.72, distortion: 0.18, tint: '#d78449' }),
  zauberberg: Object.freeze({ mode: 'stage', intensityScale: 0.78, distortion: 0.16, tint: '#ff5b91' }),
});

const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, Number(value) || 0));

function colorChannels(value, fallback = '#55d9dd') {
  const match = /^#([0-9a-f]{6})$/i.exec(value ?? '') ?? /^#([0-9a-f]{6})$/i.exec(fallback);
  const numeric = Number.parseInt(match[1], 16);
  return [((numeric >> 16) & 255) / 255, ((numeric >> 8) & 255) / 255, (numeric & 255) / 255];
}

function effectMode(level) {
  const authoredProfile = LEVEL_EFFECT_PROFILES[level?.id];
  if (authoredProfile) return authoredProfile.mode;
  const types = new Set((level?.theme?.edgeEffects ?? []).map((effect) => effect.type));
  return MODE_PRIORITY.find(([, candidates]) => [...candidates].some((type) => types.has(type)))?.[0] ?? 'ambient';
}

function profileColor(level, mode) {
  const authoredProfile = LEVEL_EFFECT_PROFILES[level?.id];
  if (authoredProfile?.tint) return authoredProfile.tint;
  const palette = level?.theme?.palette ?? {};
  if (mode === 'water') return palette.water;
  if (mode === 'stage') return '#ff4f87';
  if (mode === 'industrial') return '#ef9146';
  if (mode === 'nature') return '#6fdb9e';
  if (mode === 'city') return '#f5c451';
  return Array.isArray(palette.walls) ? palette.walls[0] : palette.curb;
}

export function resolveRendererQuality(value = 'auto', environment = globalThis.navigator) {
  if (['performance', 'balanced', 'quality'].includes(value)) return value;
  const memory = Number(environment?.deviceMemory) || 8;
  const cores = Number(environment?.hardwareConcurrency) || 8;
  // Browser-reported memory is deliberately coarse and often capped at 4 GB on
  // perfectly capable phones. Only genuinely constrained devices lose internal
  // resolution; the runtime GPU probe remains the final authority for effects.
  if (memory <= 2 || cores <= 2) return 'performance';
  if (memory <= 4 || cores <= 4) return 'balanced';
  return 'quality';
}

export function rendererPixelRatioLimit(quality) {
  if (quality === 'performance') return 1.25;
  if (quality === 'balanced') return 1.6;
  return 2;
}

export function resolvePostProcessProfile(level, snapshot = {}, options = {}) {
  const mode = effectMode(level);
  const authoredProfile = LEVEL_EFFECT_PROFILES[level?.id];
  const edgeEffects = level?.theme?.edgeEffects ?? [];
  const authoredIntensity = edgeEffects.length
    ? edgeEffects.reduce((sum, effect) => sum + clamp(effect.intensity ?? 0.55), 0) / edgeEffects.length
    : 0.35;
  const quality = resolveRendererQuality(options.quality);
  const reducedMotion = Boolean(options.reducedMotion);
  const actualPixelRatio = Math.max(1, Number(options.actualPixelRatio) || 1);
  const effectivePixelRatio = Math.max(1, Number(options.effectivePixelRatio) || actualPixelRatio);
  const integerOutput = Math.abs(actualPixelRatio - Math.round(actualPixelRatio)) < 0.001;
  const nativeOutput = Math.abs(actualPixelRatio - effectivePixelRatio) < 0.001;
  const stableScanlines = integerOutput && nativeOutput && !reducedMotion;
  const motionScale = reducedMotion ? 0 : quality === 'performance' ? 0.55 : quality === 'balanced' ? 0.78 : 1;
  const [red, green, blue] = colorChannels(profileColor(level, mode));
  const intensityScale = authoredProfile?.intensityScale ?? 1;
  const intensity = clamp(authoredIntensity * intensityScale * (quality === 'performance' ? 0.62 : quality === 'balanced' ? 0.82 : 1), 0.08, 0.82);
  const distortionScale = quality === 'performance' ? 0.55 : quality === 'balanced' ? 0.78 : 1;
  return Object.freeze({
    mode,
    modeIndex: EFFECT_MODES[mode],
    intensity,
    distortion: reducedMotion ? 0 : clamp((authoredProfile?.distortion ?? 0.08) * distortionScale, 0, 0.4),
    motionScale,
    reducedMotion,
    quality,
    tint: Object.freeze([red, green, blue]),
    power: clamp((Number(snapshot.powerTimer) || 0) / 6),
    hit: clamp((Number(snapshot.hitTimer) || 0) / 0.9),
    vignette: quality === 'performance' ? 0.08 : 0.14,
    scanlines: stableScanlines ? (quality === 'quality' ? 0.055 : 0.035) : 0,
    scanlinePeriod: 4,
    rgbSplitTexels: mode === 'stage' && !reducedMotion ? Math.max(0, Math.round(intensity * 2)) : 0,
  });
}

export { EFFECT_MODES };
