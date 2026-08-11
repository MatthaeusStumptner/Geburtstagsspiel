import { validateLevelDocument } from '@franz-lola/content-model';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
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
    ],
  },
  actors: {
    player: { x: 1, y: 1, renderer: 'franz-lola', behavior: { controller: 'user' } },
    cats: [],
    characters: [],
  },
  collectibles: { powerUps: [] },
  gameplay: {
    pelletSeed: 0,
    treatTargets: { easy: 1, normal: 1, hard: 1 },
    difficulties: { normal: { catCount: 0, lives: 3, grace: 0 } },
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
    expectedChecksum: '10f1dcf1d69d9c691d7e3af7a3435534c6144a7b2932ba64c4ecc9ec6540aeb1',
  },
});
