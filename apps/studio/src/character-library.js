import { createFranzLolaAppearance, PLAYER_STATES } from './character-template.js';
import { normalizeSpriteSize, resizeAppearance } from './sprite-appearance.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const slug = (value, fallback = 'figur') => String(value || fallback)
  .normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/ß/g, 'ss')
  .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

const DETAILED_PALETTE = Object.freeze([
  'transparent', 'rgba(1, 5, 8, 0.38)', '#17232a', '#0d151a', '#55d9dd', '#2d7780',
  '#d99a78', '#704536', '#241b18', '#f5c451', '#c45f86', '#f4eee0',
]);

function detailedFigureFrame(state = 'idle', phase = 0) {
  const grid = Array.from({ length: 24 }, () => Array(24).fill('0'));
  const paint = (x, y, width, height, token) => {
    for (let row = y; row < y + height; row += 1) for (let column = x; column < x + width; column += 1) {
      if (row >= 0 && row < 24 && column >= 0 && column < 24) grid[row][column] = token;
    }
  };
  const direction = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0], idle: [-1, 0] }[state] ?? [-1, 0];
  const [dx, dy] = direction;
  const step = phase ? 1 : -1;
  const side = dx || 1;

  paint(6, 21, 12, 2, '1');
  paint(8 + step, 16, 3, 6, '2');
  paint(13 - step, 16, 3, 6, '2');
  paint(7 + step, 21, 4, 2, '3');
  paint(13 - step, 21, 4, 2, '3');
  paint(7, 9, 10, 9, '4');
  paint(6, 11, 2, 7, '5');
  paint(16, 11, 2, 7, '5');
  paint(8, 10, 8, 2, '9');
  paint(11, 12, 2, 1, 'b');
  paint(11, 14, 2, 1, 'b');
  paint(side > 0 ? 16 : 5, 13, 3, 5, 'a');
  paint(9, 4, 6, 6, '6');
  paint(8, 5, 2, 4, '6');
  paint(14, 5, 2, 4, '6');
  paint(8, 3, 8, 3, '7');
  paint(9 + dx, 2 + Math.min(0, dy), 6, 2, '7');
  if (dy < 0) {
    paint(10, 5, 4, 1, '7');
  } else if (dx) {
    paint(12 + dx, 6, 2, 1, '8');
    paint(13 + dx, 8, 1, 1, '8');
  } else {
    paint(10, 6, 1, 1, '8');
    paint(13, 6, 1, 1, '8');
    paint(11, 8, 2, 1, '8');
  }
  return grid.map((row) => row.join(''));
}

function appearanceFromRows(rows, palette) {
  const animations = PLAYER_STATES.map((state) => ({
    id: state,
    fps: state === 'idle' ? 2 : 6,
    duration: 0.5,
    loop: true,
    keyframes: [{ id: `${state}-1`, time: 0, easing: 'step', pixels: [...rows] }],
    frames: [{ pixels: [...rows] }],
  }));
  return {
    width: rows[0].length,
    height: rows.length,
    palette,
    pixels: [...rows],
    animations,
    stateAnimations: Object.fromEntries(PLAYER_STATES.map((state) => [state, state])),
  };
}

function detailedFigureAppearance() {
  const animations = PLAYER_STATES.map((state) => ({
    id: state,
    fps: state === 'idle' ? 2 : 8,
    duration: state === 'idle' ? 1 : 0.25,
    loop: true,
    frames: [0, 1].map((phase) => ({ pixels: detailedFigureFrame(state, phase) })),
  }));
  return {
    width: 24,
    height: 24,
    palette: [...DETAILED_PALETTE],
    pixels: [...animations[0].frames[0].pixels],
    animations,
    stateAnimations: Object.fromEntries(PLAYER_STATES.map((state) => [state, state])),
  };
}

function templateAppearance(template, resolution = 24) {
  const size = normalizeSpriteSize(resolution);
  if (template === 'empty') return appearanceFromRows(Array.from({ length: size }, () => '0'.repeat(size)), ['transparent', '#55d9dd']);
  const source = template === 'franz-lola' ? createFranzLolaAppearance() : detailedFigureAppearance();
  return source.width === size && source.height === size ? source : resizeAppearance(source, size);
}

export function createBlankCharacterAsset(name = 'Neue Figur', template = 'pixel', resolution = 24) {
  return {
    id: slug(name, `figur-${Date.now()}`),
    name: String(name || 'Neue Figur').trim() || 'Neue Figur',
    description: 'Levelübergreifende, selbst gestaltete Pixel-Figur.',
    color: '#55d9dd',
    accent: '#f5c451',
    appearance: templateAppearance(template, resolution),
    effects: [],
    behavior: { controller: 'stationary', speedMultiplier: 1 },
  };
}

export class CharacterLibrary {
  constructor(storage = globalThis.localStorage, key = 'franz-lola-character-library-v1') {
    this.storage = storage;
    this.key = key;
  }

  list() {
    try {
      const entries = JSON.parse(this.storage?.getItem(this.key) ?? '[]');
      return Array.isArray(entries) ? entries.map(clone) : [];
    } catch { return []; }
  }

  save(asset) {
    const normalized = { ...clone(asset), id: slug(asset.id || asset.name) };
    const entries = this.list().filter((entry) => entry.id !== normalized.id);
    entries.push(normalized);
    this.storage?.setItem(this.key, JSON.stringify(entries));
    return clone(normalized);
  }

  remove(id) {
    this.storage?.setItem(this.key, JSON.stringify(this.list().filter((entry) => entry.id !== id)));
  }

  replace(entries) {
    this.storage?.setItem(this.key, JSON.stringify(clone(Array.isArray(entries) ? entries : [])));
  }
}

export function characterPlacement(asset, point, index = 0) {
  return {
    id: `${asset.id}-${Date.now()}-${index}`,
    characterId: asset.id,
    name: asset.name,
    x: point.x,
    y: point.y,
    renderer: 'pixel-art',
    state: 'idle',
    animation: '',
    color: asset.color,
    accent: asset.accent,
    scale: 1,
    appearance: clone(asset.appearance),
    effects: clone(asset.effects ?? []),
    behavior: clone(asset.behavior ?? { controller: 'stationary', speedMultiplier: 1 }),
  };
}
