import { validateLevelDocument } from '@franz-lola/content-model';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const presentationFrameBaseline = {
  kind: 'franz-lola-presentation-frame',
  frameId: 1,
  presentationTime: 0,
  camera: {
    source: { x: 0, y: 0, width: 400, height: 300 },
    viewport: { x: 0, y: 0, width: 400, height: 300 },
  },
  player: {
    id: 'player',
    world: { x: 200, y: 150 },
    screen: { x: 200, y: 150 },
  },
  cats: [],
  characters: [],
  display: {
    width: 400,
    height: 300,
    actualPixelRatio: 1,
    pixelRatio: 1,
    bufferWidth: 400,
    bufferHeight: 300,
  },
  renderer: {
    requestedBackend: 'canvas2d',
    backend: 'canvas2d',
    fallbackReason: null,
    contextLost: false,
  },
};

const presentationOverrideKeys = new Set(['viewport', 'player', 'cats', 'characters']);

function mergeFixtureValue(base, override) {
  if (override === undefined) return base;
  if (Array.isArray(override)) return override.map((item) => mergeFixtureValue(undefined, item));
  if (!override || typeof override !== 'object') return override;
  const source = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
  return Object.fromEntries(new Set([...Object.keys(source), ...Object.keys(override)])
    .values()
    .map((key) => [key, mergeFixtureValue(source[key], override[key])]));
}

export function fixturePresentationFrame(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new TypeError('Presentation frame fixture overrides must be an object.');
  }
  const unknownKeys = Object.keys(overrides).filter((key) => !presentationOverrideKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new TypeError('Unknown presentation frame fixture override: ' + unknownKeys.join(', '));
  }
  return deepFreeze({
    ...presentationFrameBaseline,
    camera: {
      ...presentationFrameBaseline.camera,
      viewport: mergeFixtureValue(presentationFrameBaseline.camera.viewport, overrides.viewport),
    },
    player: mergeFixtureValue(presentationFrameBaseline.player, overrides.player),
    cats: mergeFixtureValue(presentationFrameBaseline.cats, overrides.cats),
    characters: mergeFixtureValue(presentationFrameBaseline.characters, overrides.characters),
  });
}

const validation = validateLevelDocument({
  kind: 'franz-lola-level',
  schemaVersion: 1,
  id: 'hals-smoke',
  name: { standard: 'Hals Smoke', dialect: 'Hals Smoke' },
  description: { standard: 'Deterministisches Golden-Projekt', dialect: 'Deterministisches Golden-Projekt' },
  mission: { standard: 'Sammle den Gutti.', dialect: 'Sammel den Gutti.' },
  location: { area: 'HALS' },
  board: {
    columns: 9,
    rows: 9,
    tileSize: 24,
    tunnelRows: [],
    walls: [
      { x: 0, y: 0, width: 9, height: 1 },
      { x: 0, y: 8, width: 9, height: 1 },
      { x: 0, y: 1, width: 1, height: 7 },
      { x: 8, y: 1, width: 1, height: 7 },
      { x: 1, y: 3, width: 7, height: 1 },
    ],
  },
  actors: {
    player: { x: 1, y: 1, renderer: 'franz-lola', behavior: { controller: 'user' } },
    cats: [{ x: 4, y: 5, behavior: { strategy: 'random', respawnDelay: 0, wander: 20 } }],
    characters: [],
  },
  collectibles: { powerUps: [] },
  gameplay: {
    pelletSeed: 0,
    treatTargets: { easy: 1, normal: 1, hard: 1 },
    difficulties: { normal: { catCount: 1, lives: 3, grace: 0, catSpeed: 3, wander: 20 } },
  },
  decorations: [],
  events: [],
  cutscenes: [],
});

if (!validation.ok) throw new TypeError(`Invalid hals-smoke golden fixture: ${validation.errors.join(' ')}`);

export const goldenProjects = deepFreeze({
  'hals-smoke': {
    session: {
      level: validation.value,
      difficulty: 'normal',
      seed: 2308,
    },
    inputs: Array.from({ length: 121 }, () => ({ input: 'right', dt: 1 / 120 })),
    expectedChecksum: 'b3c8457ba89a848a4245bb76156a471f632e31cd879f2c473118d87544e00572',
  },
});
