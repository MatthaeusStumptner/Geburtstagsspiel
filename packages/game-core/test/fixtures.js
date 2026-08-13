function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const deterministicSessionLevel = deepFreeze({
  kind: 'franz-lola-level',
  schemaVersion: 1,
  id: 'deterministic-session',
  name: { standard: 'Deterministische Runde', dialect: 'Deterministische Rundn' },
  description: { standard: 'Minimales Testlevel', dialect: 'Kloans Testlevel' },
  mission: { standard: 'Sammle vier Guttis.', dialect: 'Sammel vier Guttis.' },
  location: { area: 'TEST', river: [], lat: 48.57, lon: 13.47 },
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
  theme: {
    landmark: 'dog-park',
    elements: [],
    palette: {
      ground: ['#17262c'],
      walls: ['#174150'],
      curb: '#345b61',
      water: '#0a5368',
    },
  },
  actors: {
    player: { x: 4, y: 6, renderer: 'franz-lola', behavior: { controller: 'user' } },
    cats: [{
      id: 'cat-1',
      x: 4,
      y: 4,
      color: '#ff6b5f',
      accent: '#9e302e',
      behavior: { strategy: 'random', respawnDelay: 0 },
    }],
    characters: [{
      id: 'guide-1',
      characterId: 'guide',
      name: 'Guide',
      x: 2,
      y: 2,
      state: 'idle',
    }],
  },
  collectibles: { powerUps: [{ x: 1, y: 1 }] },
  gameplay: {
    pelletSeed: 17,
    treatTargets: { easy: 3, normal: 4, hard: 5 },
    difficulties: {
      normal: { catCount: 1, lives: 3, grace: 0, wander: 20 },
    },
  },
  decorations: [],
  events: [],
  cutscenes: [],
});
