import { DEFAULT_DIFFICULTY_PROFILES, EDGE_EFFECT_TYPES, normalizeVisualEffects } from './content-defaults.js';

export { DEFAULT_DIFFICULTY_PROFILES, EDGE_EFFECT_TYPES, VISUAL_EFFECT_TYPES, normalizeVisualEffects } from './content-defaults.js';

export const LEVEL_DOCUMENT_KIND = 'franz-lola-level';
export const LEVEL_FORMAT_VERSION = 1;

const DEFAULT_PALETTE = Object.freeze({
  ground: ['#17262c', '#19282f', '#15242b', '#1b2a30'],
  curb: '#345b61',
  walls: ['#174150', '#194958', '#293f4b', '#3a3f48'],
  water: '#0a5368',
});

const DEFAULT_CATS = Object.freeze([
  { x: 11, y: 12, color: '#ff6b5f', accent: '#9e302e' },
  { x: 12, y: 12, color: '#f2a65a', accent: '#a6532c' },
  { x: 13, y: 12, color: '#b792e8', accent: '#66509d' },
]);

const clone = (value) => JSON.parse(JSON.stringify(value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback) => Math.round(finite(value, fallback));
const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function normalizePoint(point, fallback) {
  return {
    x: integer(point?.x, fallback.x),
    y: integer(point?.y, fallback.y),
  };
}

function normalizeLocalized(value, fallback) {
  return {
    standard: text(value?.standard, fallback),
    dialect: text(value?.dialect, value?.standard ?? fallback),
  };
}

function normalizeBehavior(value, kind, index = 0) {
  const input = value && typeof value === 'object' ? value : {};
  if (kind === 'player') {
    const controllers = ['user', 'autopilot', 'patrol', 'stationary'];
    return {
      controller: controllers.includes(input.controller) ? input.controller : 'user',
      speedMultiplier: clamp(finite(input.speedMultiplier, 1), 0.1, 4),
    };
  }
  if (kind === 'character') {
    const controllers = ['stationary', 'patrol'];
    return {
      controller: controllers.includes(input.controller) ? input.controller : 'stationary',
      speedMultiplier: clamp(finite(input.speedMultiplier, 1), 0.1, 4),
    };
  }
  const strategies = ['chase', 'ambush', 'scatter-chase', 'scatter', 'guard', 'random', 'stationary'];
  const fallbackStrategy = index === 1 ? 'ambush' : index === 2 ? 'scatter-chase' : 'chase';
  return {
    strategy: strategies.includes(input.strategy) ? input.strategy : fallbackStrategy,
    speedMultiplier: clamp(finite(input.speedMultiplier, 1), 0.1, 4),
    lookAhead: clamp(integer(input.lookAhead, index === 1 ? 3 : 0), 0, 12),
    wanderMultiplier: clamp(finite(input.wanderMultiplier, index + 1), 0, 12),
    wander: clamp(finite(input.wander, 0), 0, 30),
    respawnDelay: clamp(finite(input.respawnDelay, index * 0.9), 0, 20),
    target: normalizePoint(input.target, { x: 22, y: 22 }),
  };
}

function normalizePixels(rows, width, height, paletteLength) {
  return Array.from({ length: height }, (_, y) => {
    const row = typeof rows?.[y] === 'string' ? rows[y] : '';
    return Array.from({ length: width }, (_, x) => {
      const digit = Number.parseInt(row[x] ?? '0', 36);
      return Number.isFinite(digit) && digit >= 0 && digit < paletteLength ? digit.toString(36) : '0';
    }).join('');
  });
}

function normalizeAppearance(value) {
  if (!value || typeof value !== 'object') return null;
  const width = clamp(integer(value.width, 8), 4, 24);
  const height = clamp(integer(value.height, 8), 4, 24);
  const palette = (Array.isArray(value.palette) ? value.palette : ['#000000', '#f4eee0'])
    .slice(0, 36)
    .map((entry, index) => index === 0 && entry === 'transparent' ? entry : color(entry, index === 0 ? '#000000' : '#f4eee0'));
  const pixels = normalizePixels(value.pixels, width, height, palette.length);
  const animations = (Array.isArray(value.animations) ? value.animations : []).slice(0, 24).map((animation, index) => {
    const fps = clamp(finite(animation?.fps, 6), 0.25, 30);
    const source = Array.isArray(animation?.keyframes) && animation.keyframes.length
      ? animation.keyframes
      : Array.isArray(animation?.frames) && animation.frames.length ? animation.frames : [{ pixels }];
    const keyframes = source.slice(0, 64).map((frame, frameIndex) => ({
      id: slug(frame?.id, `keyframe-${frameIndex + 1}`),
      time: clamp(finite(frame?.time, frameIndex / fps), 0, 3600),
      easing: ['step', 'linear', 'ease-in-out'].includes(frame?.easing) ? frame.easing : 'step',
      pixels: normalizePixels(frame?.pixels ?? frame, width, height, palette.length),
    })).sort((left, right) => left.time - right.time);
    const minimumDuration = Math.max(1 / fps, (keyframes.at(-1)?.time ?? 0) + 1 / fps);
    return {
      id: slug(animation?.id, `animation-${index + 1}`),
      fps,
      duration: clamp(finite(animation?.duration, minimumDuration), minimumDuration, 3600),
      loop: animation?.loop !== false,
      keyframes,
      // Legacy readers can continue to consume frames; keyframes remain canonical.
      frames: keyframes.map((frame) => ({ pixels: frame.pixels })),
    };
  });
  const animationIds = new Set(animations.map((animation) => animation.id));
  const stateAnimations = Object.fromEntries(['idle', 'up', 'right', 'down', 'left'].map((state) => {
    const requested = text(value.stateAnimations?.[state], '');
    if (animationIds.has(requested)) return [state, requested];
    if (animationIds.has(state)) return [state, state];
    if (state !== 'idle' && animationIds.has('walk')) return [state, 'walk'];
    if (animationIds.has('idle')) return [state, 'idle'];
    return [state, ''];
  }));
  return { width, height, palette, pixels, animations, stateAnimations };
}

function normalizeMotionAnimation(value, fallback = {}) {
  const type = ['none', 'bob', 'pulse', 'blink', 'spin', 'keyframes'].includes(value?.type) ? value.type : (fallback.type ?? 'none');
  const source = Array.isArray(value?.keyframes) && value.keyframes.length ? value.keyframes : [];
  const keyframes = source.slice(0, 64).map((frame, index) => ({
    id: slug(frame?.id, `motion-${index + 1}`),
    time: clamp(finite(frame?.time, index), 0, 3600),
    x: clamp(finite(frame?.x, 0), -48, 48),
    y: clamp(finite(frame?.y, 0), -48, 48),
    scale: clamp(finite(frame?.scale, 1), 0.05, 8),
    rotation: clamp(finite(frame?.rotation, 0), -3600, 3600),
    opacity: clamp(finite(frame?.opacity, 1), 0, 1),
    easing: ['step', 'linear', 'ease-in-out'].includes(frame?.easing) ? frame.easing : 'linear',
  })).sort((left, right) => left.time - right.time);
  const minimumDuration = Math.max(0.1, keyframes.at(-1)?.time ?? 0);
  return {
    type,
    speed: clamp(finite(value?.speed, fallback.speed ?? 1), 0.1, 12),
    amplitude: clamp(finite(value?.amplitude, fallback.amplitude ?? 0.15), 0, 1),
    duration: clamp(finite(value?.duration, fallback.duration ?? Math.max(1, minimumDuration)), Math.max(0.1, minimumDuration), 3600),
    loop: value?.loop !== false,
    keyframes,
  };
}

function normalizeThemeElements(value, landmark) {
  const defaults = landmark === 'zauberberg' ? [
    { id: 'stage-lights', animation: { type: 'none', speed: 1, amplitude: 0.15 } },
  ] : [];
  const source = Array.isArray(value) ? value : [];
  const merged = [...defaults.map((fallback) => ({ ...fallback, ...(source.find((item) => item?.id === fallback.id) ?? {}) })), ...source.filter((item) => !defaults.some((fallback) => fallback.id === item?.id))];
  return merged.slice(0, 32).map((item, index) => ({ id: slug(item?.id, `theme-element-${index + 1}`), animation: normalizeMotionAnimation(item?.animation, defaults.find((fallback) => fallback.id === item?.id)?.animation) }));
}
function normalizeEdgeEffects(value, fallbackColor) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).map((effect, index) => ({
    id: slug(effect?.id, `edge-effect-${index + 1}`),
    type: EDGE_EFFECT_TYPES.includes(effect?.type) ? effect.type : 'water-flow',
    side: ['left', 'right', 'both'].includes(effect?.side) ? effect.side : 'both',
    speed: clamp(finite(effect?.speed, 1), 0.1, 8),
    intensity: clamp(finite(effect?.intensity, 0.55), 0.05, 1),
    count: clamp(integer(effect?.count, 5), 1, 16),
    color: color(effect?.color, fallbackColor),
    accent: color(effect?.accent, '#f5c451'),
  }));
}


function normalizeDecoration(value, index, columns, rows) {
  const allowedTypes = ['tree', 'bench', 'lamp', 'flower', 'sign', 'rock', 'water', 'custom', 'text'];
  const allowedAssetOverrides = ['name', 'type', 'width', 'height', 'color', 'label', 'appearance', 'spriteAnimation', 'animation', 'effects', 'content', 'textStyle'];
  const type = allowedTypes.includes(value?.type) ? value.type : 'custom';
  return {
    id: text(value?.id, `decoration-${index + 1}`),
    assetId: slug(value?.assetId, type),
    assetOverrides: [...new Set(Array.isArray(value?.assetOverrides) ? value.assetOverrides : [])]
      .filter((entry) => allowedAssetOverrides.includes(entry)),
    name: text(value?.name, text(value?.label, `Objekt ${index + 1}`)),
    type,
    x: clamp(finite(value?.x, 1), 0, columns - 0.25),
    y: clamp(finite(value?.y, 1), 0, rows - 0.25),
    width: clamp(finite(value?.width, 1), 0.25, columns),
    height: clamp(finite(value?.height, 1), 0.25, rows),
    color: color(value?.color, '#55d9dd'),
    label: text(value?.label, type === 'custom' ? '◆' : ''),
    layer: ['ground', 'scenery', 'foreground'].includes(value?.layer) ? value.layer : 'scenery',
    locked: Boolean(value?.locked),
    appearance: normalizeAppearance(value?.appearance),
    spriteAnimation: text(value?.spriteAnimation, ''),
    animation: normalizeMotionAnimation(value?.animation),
    effects: normalizeVisualEffects(value?.effects),
    content: normalizeLocalized(value?.content, text(value?.label, 'Textblock')),
    textStyle: {
      fontSize: clamp(finite(value?.textStyle?.fontSize, 0.5), 0.15, 4),
      align: ['left', 'center', 'right'].includes(value?.textStyle?.align) ? value.textStyle.align : 'center',
      verticalAlign: ['top', 'middle', 'bottom'].includes(value?.textStyle?.verticalAlign) ? value.textStyle.verticalAlign : 'middle',
      background: color(value?.textStyle?.background, '#071016'),
      backgroundOpacity: clamp(finite(value?.textStyle?.backgroundOpacity, 0.88), 0, 1),
      borderColor: color(value?.textStyle?.borderColor, '#55d9dd'),
      borderOpacity: clamp(finite(value?.textStyle?.borderOpacity, 0), 0, 1),
      padding: clamp(finite(value?.textStyle?.padding, 0.2), 0, 2),
      uppercase: Boolean(value?.textStyle?.uppercase),
    },
  };
}

function normalizeCutsceneKeyframe(value, index, type, columns, rows) {
  const base = {
    id: slug(value?.id, `keyframe-${index + 1}`),
    time: clamp(finite(value?.time, index), 0, 3600),
    easing: ['linear', 'step', 'ease-in-out'].includes(value?.easing) ? value.easing : 'linear',
  };
  if (type === 'camera') return {
    ...base,
    x: clamp(finite(value?.x, columns / 2), 0, columns),
    y: clamp(finite(value?.y, rows / 2), 0, rows),
    zoom: clamp(finite(value?.zoom, 1.12), 0.25, 4),
  };
  if (type === 'dialogue') return {
    ...base,
    duration: clamp(finite(value?.duration, 2.5), 0.1, 120),
    speaker: text(value?.speaker, ''),
    text: normalizeLocalized(value?.text, ''),
  };
  return {
    ...base,
    x: clamp(finite(value?.x, columns / 2), -columns, columns * 2),
    y: clamp(finite(value?.y, rows / 2), -rows, rows * 2),
    state: ['idle', 'up', 'right', 'down', 'left'].includes(value?.state) ? value.state : 'idle',
    animation: text(value?.animation, ''),
    visible: value?.visible !== false,
  };
}

function normalizeCutsceneTrack(value, index, columns, rows) {
  const type = ['camera', 'actor', 'object', 'dialogue'].includes(value?.type) ? value.type : 'actor';
  const source = Array.isArray(value?.keyframes) && value.keyframes.length ? value.keyframes : [{ time: 0 }];
  return {
    id: slug(value?.id, `track-${index + 1}`),
    type,
    target: text(value?.target, type === 'camera' ? 'camera' : type === 'dialogue' ? 'dialogue' : 'player'),
    keyframes: source.slice(0, 128)
      .map((keyframe, keyframeIndex) => normalizeCutsceneKeyframe(keyframe, keyframeIndex, type, columns, rows))
      .sort((left, right) => left.time - right.time),
  };
}

function normalizeCutscene(value, index, columns, rows) {
  const tracks = (Array.isArray(value?.tracks) ? value.tracks : []).slice(0, 64)
    .map((track, trackIndex) => normalizeCutsceneTrack(track, trackIndex, columns, rows));
  const latest = tracks.flatMap((track) => track.keyframes.map((frame) => frame.time + (track.type === 'dialogue' ? frame.duration : 0)));
  const minimumDuration = Math.max(0.5, ...latest);
  return {
    id: slug(value?.id, index === 0 ? 'intro' : `cutscene-${index + 1}`),
    kind: ['intro', 'outro', 'transition'].includes(value?.kind) ? value.kind : (index === 0 ? 'intro' : 'transition'),
    name: normalizeLocalized(value?.name, index === 0 ? 'Level-Intro' : `Cutscene ${index + 1}`),
    duration: clamp(finite(value?.duration, minimumDuration), minimumDuration, 3600),
    skippable: value?.skippable !== false,
    tracks,
  };
}

function normalizeDifficultyProfile(value, fallback) {
  return {
    playerSpeed: clamp(finite(value?.playerSpeed, fallback.playerSpeed), 0.1, 20),
    catSpeed: clamp(finite(value?.catSpeed, fallback.catSpeed), 0.1, 20),
    frightenedSpeed: clamp(finite(value?.frightenedSpeed, fallback.frightenedSpeed), 0.1, 20),
    catCount: clamp(integer(value?.catCount, fallback.catCount), 0, 12),
    lives: clamp(integer(value?.lives, fallback.lives), 1, 99),
    powerDuration: clamp(finite(value?.powerDuration, fallback.powerDuration), 0.1, 120),
    wander: clamp(finite(value?.wander, fallback.wander), 0, 30),
    grace: clamp(finite(value?.grace, fallback.grace), 0, 30),
  };
}

function slug(value, fallback) {
  return text(value, fallback).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function normalizeEventRectangle(value, columns, rows) {
  const x = clamp(integer(value?.x, 0), 0, columns - 1);
  const y = clamp(integer(value?.y, 0), 0, rows - 1);
  return {
    x,
    y,
    width: clamp(integer(value?.width, 1), 1, columns - x),
    height: clamp(integer(value?.height, 1), 1, rows - y),
  };
}

function normalizeLevelEvent(value, index, columns, rows) {
  const id = slug(value?.id, `event-${index + 1}`);
  const triggerTypes = ['zone', 'direction-sequence', 'time'];
  const visualTypes = ['kingfisher', 'paw', 'bell', 'custom', 'none'];
  const triggerType = triggerTypes.includes(value?.trigger?.type) ? value.trigger.type : 'zone';
  const defaultVisual = id.includes('ilz') ? 'kingfisher' : id.includes('hund') ? 'paw' : id.includes('glock') ? 'bell' : 'custom';
  return {
    id,
    kind: 'easter-egg',
    name: normalizeLocalized(value?.name, `Ereignis ${index + 1}`),
    message: normalizeLocalized(value?.message, 'Geheimnis entdeckt!'),
    reward: clamp(integer(value?.reward, 100), -9999, 9999),
    scope: ['global', 'level', 'run'].includes(value?.scope) ? value.scope : 'global',
    trigger: {
      type: triggerType,
      zones: (Array.isArray(value?.trigger?.zones) && value.trigger.zones.length ? value.trigger.zones : [{ x: 1, y: 1, width: 1, height: 1 }])
        .slice(0, 32).map((zone) => normalizeEventRectangle(zone, columns, rows)),
      sequence: (Array.isArray(value?.trigger?.sequence) ? value.trigger.sequence : [])
        .filter((direction) => ['up', 'down', 'left', 'right'].includes(direction)).slice(0, 32),
      seconds: clamp(finite(value?.trigger?.seconds, 10), 0, 3600),
    },
    visual: {
      type: visualTypes.includes(value?.visual?.type) ? value.visual.type : defaultVisual,
      x: clamp(finite(value?.visual?.x, defaultVisual === 'kingfisher' ? 0.375 : columns / 2), 0, columns),
      y: clamp(finite(value?.visual?.y, defaultVisual === 'kingfisher' ? 6 : defaultVisual === 'bell' ? 0.5 : rows * 0.488), 0, rows),
      color: color(value?.visual?.color, '#55d9dd'),
      accent: color(value?.visual?.accent, '#f5c451'),
      label: text(value?.visual?.label, '◆'),
      visibility: ['after-trigger', 'always'].includes(value?.visual?.visibility) ? value.visual.visibility : 'after-trigger',
      assetId: slug(value?.visual?.assetId, ''),
      appearance: normalizeAppearance(value?.visual?.appearance),
      spriteAnimation: text(value?.visual?.spriteAnimation, ''),
      animation: normalizeMotionAnimation(value?.visual?.animation),
      effects: normalizeVisualEffects(value?.visual?.effects),
    },
  };
}

export function createLevelDocument(input = {}) {
  const columns = Math.max(5, integer(input.board?.columns, 25));
  const rows = Math.max(5, integer(input.board?.rows, 25));
  const tileSize = Math.max(8, integer(input.board?.tileSize, 24));
  const defaultPlayer = { x: Math.floor(columns / 2), y: Math.max(1, rows - 5) };
  const walls = Array.isArray(input.board?.walls) ? input.board.walls : [];
  const cats = Array.isArray(input.actors?.cats) ? input.actors.cats : DEFAULT_CATS;
  const characters = Array.isArray(input.actors?.characters) ? input.actors.characters : [];
  const powerUps = Array.isArray(input.collectibles?.powerUps)
    ? input.collectibles.powerUps
    : [{ x: 1, y: 1 }, { x: columns - 2, y: 1 }, { x: 1, y: rows - 2 }, { x: columns - 2, y: rows - 2 }];
  const usedCatIds = new Set();
  const uniqueCatId = (value, index) => {
    const base = slug(value, `cat-${index + 1}`);
    let id = base; let suffix = 2;
    while (usedCatIds.has(id)) { id = `${base}-${suffix}`; suffix += 1; }
    usedCatIds.add(id);
    return id;
  };
  const usedCharacterIds = new Set();
  const uniqueCharacterId = (value, index) => {
    const base = slug(value, `character-${index + 1}`);
    let id = base; let suffix = 2;
    while (usedCharacterIds.has(id)) { id = `${base}-${suffix}`; suffix += 1; }
    usedCharacterIds.add(id);
    return id;
  };
  const landmark = text(input.theme?.landmark, 'dog-park');
  const themeElements = normalizeThemeElements(input.theme?.elements, landmark);

  return {
    kind: LEVEL_DOCUMENT_KIND,
    schemaVersion: LEVEL_FORMAT_VERSION,
    id: text(input.id, 'new-level').trim() || 'new-level',
    icon: text(input.icon, '◆'),
    name: normalizeLocalized(input.name, 'Neues Level'),
    description: normalizeLocalized(input.description, 'Ein neuer Ort für Franz und Lola.'),
    mission: normalizeLocalized(input.mission, 'Eine neue Gassi-Runde'),
    location: {
      latitude: finite(input.location?.latitude, 48.574),
      longitude: finite(input.location?.longitude, 13.466),
      area: text(input.location?.area, 'PASSAU'),
    },
    board: {
      columns,
      rows,
      tileSize,
      tunnelRows: [...new Set((Array.isArray(input.board?.tunnelRows) ? input.board.tunnelRows : [Math.floor(rows / 2)])
        .map((row) => integer(row, -1))
        .filter((row) => row >= 0 && row < rows))],
      walls: walls.map((wall, index) => {
        const normalized = {
          x: integer(wall?.x, 1),
          y: integer(wall?.y, 1),
          width: Math.max(1, integer(wall?.width, 1)),
          height: Math.max(1, integer(wall?.height, 1)),
        };
        if (text(wall?.id).trim()) normalized.id = slug(wall.id, 'wall-' + (index + 1));
        if (text(wall?.name).trim()) normalized.name = text(wall.name).trim();
        if (color(wall?.color, '')) normalized.color = wall.color;
        if (color(wall?.accent, '')) normalized.accent = wall.accent;
        if (wall?.useThemeColor === false) normalized.useThemeColor = false;
        if (['theme', 'solid', 'brick', 'metal', 'windows'].includes(wall?.pattern) && wall.pattern !== 'theme') normalized.pattern = wall.pattern;
        if (Number.isFinite(Number(wall?.opacity)) && Number(wall.opacity) !== 1) normalized.opacity = clamp(finite(wall.opacity, 1), 0.15, 1);
        const effects = normalizeVisualEffects(wall?.effects);
        if (effects.length) normalized.effects = effects;
        return normalized;
      }),
    },
    theme: {
      id: text(input.theme?.id, 'neighborhood'),
      landmark,
      palette: {
        ground: Array.from({ length: 4 }, (_, index) => color(input.theme?.palette?.ground?.[index], DEFAULT_PALETTE.ground[index])),
        curb: color(input.theme?.palette?.curb, DEFAULT_PALETTE.curb),
        walls: Array.from({ length: 4 }, (_, index) => color(input.theme?.palette?.walls?.[index], DEFAULT_PALETTE.walls[index])),
        water: color(input.theme?.palette?.water, DEFAULT_PALETTE.water),
      },
      ...(themeElements.length ? { elements: themeElements } : {}),
      edgeEffects: normalizeEdgeEffects(input.theme?.edgeEffects, color(input.theme?.palette?.water, DEFAULT_PALETTE.water)),
    },
    actors: {
      player: {
        id: slug(input.actors?.player?.id, 'player'),
        ...normalizePoint(input.actors?.player, defaultPlayer),
        renderer: text(input.actors?.player?.renderer, 'franz-lola'),
        animation: text(input.actors?.player?.animation, ''),
        appearance: normalizeAppearance(input.actors?.player?.appearance),
        effects: normalizeVisualEffects(input.actors?.player?.effects),
        behavior: normalizeBehavior(input.actors?.player?.behavior, 'player'),
      },
      cats: cats.map((cat, index) => ({
        id: uniqueCatId(cat?.id, index),
        ...normalizePoint(cat, DEFAULT_CATS[index % DEFAULT_CATS.length]),
        renderer: text(cat?.renderer, 'cat'),
        animation: text(cat?.animation, ''),
        color: color(cat?.color, DEFAULT_CATS[index % DEFAULT_CATS.length].color),
        accent: color(cat?.accent, DEFAULT_CATS[index % DEFAULT_CATS.length].accent),
        appearance: normalizeAppearance(cat?.appearance),
        effects: normalizeVisualEffects(cat?.effects),
        behavior: normalizeBehavior(cat?.behavior, 'cat', index),
      })),
      characters: characters.slice(0, 64).map((character, index) => ({
        id: uniqueCharacterId(character?.id, index),
        characterId: slug(character?.characterId, `character-${index + 1}`),
        name: text(character?.name, `Figur ${index + 1}`).trim() || `Figur ${index + 1}`,
        ...normalizePoint(character, defaultPlayer),
        renderer: text(character?.renderer, 'pixel-art'),
        state: ['idle', 'up', 'right', 'down', 'left'].includes(character?.state) ? character.state : 'idle',
        animation: text(character?.animation, ''),
        scale: clamp(finite(character?.scale, 1), 0.5, 4),
        color: color(character?.color, '#55d9dd'),
        accent: color(character?.accent, '#f5c451'),
        appearance: normalizeAppearance(character?.appearance),
        effects: normalizeVisualEffects(character?.effects),
        behavior: normalizeBehavior(character?.behavior, 'character', index),
      })),
    },
    collectibles: {
      powerUps: powerUps.map((point) => normalizePoint(point, { x: 1, y: 1 })),
    },
    gameplay: {
      pelletSeed: integer(input.gameplay?.pelletSeed, 0),
      treatTargets: {
        easy: clamp(integer(input.gameplay?.treatTargets?.easy, 70), 1, 999),
        normal: clamp(integer(input.gameplay?.treatTargets?.normal, 110), 1, 999),
        hard: clamp(integer(input.gameplay?.treatTargets?.hard, 160), 1, 999),
      },
      difficulties: Object.fromEntries(Object.entries(DEFAULT_DIFFICULTY_PROFILES).map(([name, fallback]) => [name, normalizeDifficultyProfile(input.gameplay?.difficulties?.[name], fallback)])),
    },
    source: {
      catalog: text(input.source?.catalog, ''),
      gameLayout: integer(input.source?.gameLayout, -1),
      markerClass: text(input.source?.markerClass, ''),
      home: Boolean(input.source?.home),
    },
    decorations: (Array.isArray(input.decorations) ? input.decorations : [])
      .map((entry, index) => normalizeDecoration(entry, index, columns, rows)),
    events: (Array.isArray(input.events) ? input.events : [])
      .slice(0, 64).map((entry, index) => normalizeLevelEvent(entry, index, columns, rows)),
    cutscenes: (Array.isArray(input.cutscenes) ? input.cutscenes : [])
      .slice(0, 16).map((entry, index) => normalizeCutscene(entry, index, columns, rows)),
  };
}

export function tileKey(x, y) {
  return `${x},${y}`;
}

export function compileWallGrid(levelInput) {
  const level = createLevelDocument(levelInput);
  const { columns, rows, tunnelRows, walls } = level.board;
  const grid = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: columns }, (_, x) => x === 0 || y === 0 || x === columns - 1 || y === rows - 1),
  );
  tunnelRows.forEach((row) => {
    grid[row][0] = false;
    grid[row][columns - 1] = false;
  });
  walls.forEach((wall) => {
    const right = Math.min(columns, wall.x + wall.width);
    const bottom = Math.min(rows, wall.y + wall.height);
    for (let y = Math.max(0, wall.y); y < bottom; y += 1) {
      for (let x = Math.max(0, wall.x); x < right; x += 1) grid[y][x] = true;
    }
  });
  return grid;
}

export function reachableTileKeys(levelInput, startInput) {
  const level = createLevelDocument(levelInput);
  const grid = compileWallGrid(level);
  const { columns, rows, tunnelRows } = level.board;
  const start = normalizePoint(startInput ?? level.actors.player, level.actors.player);
  if (start.x < 0 || start.x >= columns || start.y < 0 || start.y >= rows || grid[start.y][start.x]) return new Set();
  const visited = new Set([tileKey(start.x, start.y)]);
  const queue = [start];
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    directions.forEach(([dx, dy]) => {
      let x = current.x + dx;
      const y = current.y + dy;
      if (y < 0 || y >= rows) return;
      if (x < 0 || x >= columns) {
        if (!tunnelRows.includes(y)) return;
        x = x < 0 ? columns - 1 : 0;
      }
      const key = tileKey(x, y);
      if (visited.has(key) || grid[y][x]) return;
      visited.add(key);
      queue.push({ x, y });
    });
  }
  return visited;
}

export function validateLevelDocument(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) errors.push('Das Level muss ein JSON-Objekt sein.');
  const level = createLevelDocument(input ?? {});
  if (input?.kind !== LEVEL_DOCUMENT_KIND) errors.push(`kind muss "${LEVEL_DOCUMENT_KIND}" sein.`);
  if (Number(input?.schemaVersion) !== LEVEL_FORMAT_VERSION) errors.push(`schemaVersion muss ${LEVEL_FORMAT_VERSION} sein.`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(level.id)) errors.push('id darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.');
  const grid = compileWallGrid(level);
  const { player, cats, characters } = level.actors;
  const inside = (point) => point.x >= 0 && point.x < level.board.columns && point.y >= 0 && point.y < level.board.rows;
  if (!inside(player) || grid[player.y]?.[player.x]) errors.push('Der Startpunkt von Franz und Lola liegt außerhalb oder in einer Wand.');
  cats.forEach((cat, index) => {
    if (!inside(cat) || grid[cat.y]?.[cat.x]) errors.push(`Katze ${index + 1} liegt außerhalb oder in einer Wand.`);
  });
  characters.forEach((character, index) => {
    if (!inside(character) || grid[character.y]?.[character.x]) errors.push(`Figur ${character.name || index + 1} liegt außerhalb oder in einer Wand.`);
  });
  const reachable = reachableTileKeys(level);
  if (reachable.size === 0) errors.push('Vom Startpunkt ist keine begehbare Fläche erreichbar.');
  level.collectibles.powerUps.forEach((point, index) => {
    if (!reachable.has(tileKey(point.x, point.y))) errors.push(`Power-up ${index + 1} ist nicht erreichbar.`);
  });
  const powerKeys = level.collectibles.powerUps.map((point) => tileKey(point.x, point.y));
  if (new Set(powerKeys).size !== powerKeys.length) warnings.push('Mehrere Power-ups liegen auf demselben Feld.');
  const openInterior = [...reachable].filter((key) => {
    const [x, y] = key.split(',').map(Number);
    return x > 0 && x < level.board.columns - 1 && y > 0 && y < level.board.rows - 1;
  }).length;
  const maximumTarget = Math.max(...Object.values(level.gameplay.treatTargets));
  if (openInterior < maximumTarget) warnings.push(`Für ${maximumTarget} Guttis sind nur ${openInterior} erreichbare Innenfelder vorhanden.`);
  level.board.walls.forEach((wall, index) => {
    if (wall.x < 0 || wall.y < 0 || wall.x + wall.width > level.board.columns || wall.y + wall.height > level.board.rows) {
      warnings.push(`Wand ${index + 1} ragt über das Spielfeld hinaus und wird abgeschnitten.`);
    }
  });
  level.decorations.forEach((item, index) => {
    if (item.x + item.width > level.board.columns || item.y + item.height > level.board.rows) {
      warnings.push(`Dekoration ${index + 1} ragt über das Spielfeld hinaus.`);
    }
  });
  const eventIds = level.events.map((event) => event.id);
  if (new Set(eventIds).size !== eventIds.length) errors.push('Ereignis-IDs müssen innerhalb eines Levels eindeutig sein.');
  level.events.forEach((event, index) => {
    if (!event.message.standard.trim() || !event.message.dialect.trim()) warnings.push(`Ereignis ${index + 1} hat keinen vollständigen Standard-/Dialekttext.`);
    if (event.trigger.type === 'direction-sequence' && event.trigger.sequence.length === 0) errors.push(`Ereignis ${index + 1} benötigt mindestens eine Richtung.`);
    if (event.trigger.type === 'zone') {
      const reachableZone = event.trigger.zones.some((zone) => {
        for (let y = zone.y; y < zone.y + zone.height; y += 1) for (let x = zone.x; x < zone.x + zone.width; x += 1) if (reachable.has(tileKey(x, y))) return true;
        return false;
      });
      if (!reachableZone) warnings.push(`Triggerzone von Ereignis ${index + 1} ist vom Startpunkt nicht erreichbar.`);
    }
  });
  const cutsceneIds = level.cutscenes.map((cutscene) => cutscene.id);
  if (new Set(cutsceneIds).size !== cutsceneIds.length) errors.push('Cutscene-IDs müssen innerhalb eines Levels eindeutig sein.');
  const decorationIds = new Set(level.decorations.map((item) => item.id));
  level.cutscenes.forEach((cutscene, cutsceneIndex) => {
    const trackIds = cutscene.tracks.map((track) => track.id);
    if (new Set(trackIds).size !== trackIds.length) errors.push(`Track-IDs in Cutscene ${cutsceneIndex + 1} müssen eindeutig sein.`);
    cutscene.tracks.forEach((track) => {
      if (track.type === 'object' && !decorationIds.has(track.target)) warnings.push(`Cutscene „${cutscene.id}“ verweist auf das unbekannte Objekt „${track.target}“.`);
      if (track.keyframes.some((frame) => frame.time > cutscene.duration)) errors.push(`Ein Keyframe in Cutscene „${cutscene.id}“ liegt hinter der Dauer.`);
    });
  });
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: { reachableTiles: reachable.size, openInteriorTiles: openInterior, wallRectangles: level.board.walls.length },
    value: level,
  };
}

export function parseLevelDocument(source) {
  try {
    const parsed = typeof source === 'string' ? JSON.parse(source) : clone(source);
    return validateLevelDocument(parsed);
  } catch (error) {
    return { ok: false, errors: [`Ungültiges JSON: ${error.message}`], value: null };
  }
}
