import { normalizeSpriteSize } from './sprite-appearance.js';

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
export const LINKED_ASSET_FIELDS = Object.freeze(['name', 'type', 'width', 'height', 'color', 'label', 'appearance', 'spriteAnimation', 'animation', 'effects', 'content', 'textStyle']);
const slug = (value, fallback = 'objekt') => String(value || fallback)
  .normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/ß/g, 'ss')
  .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

export function recolorAppearance(appearanceValue, previousColor, nextColor) {
  if (!appearanceValue || !previousColor || !nextColor) return clone(appearanceValue);
  const previous = String(previousColor).toLowerCase();
  const result = clone(appearanceValue);
  result.palette = (result.palette ?? []).map((entry) => String(entry).toLowerCase() === previous ? nextColor : entry);
  return result;
}

export function applyAssetToPlacement(placement, asset) {
  const result = clone(placement);
  const overrides = new Set(result.assetOverrides ?? []);
  LINKED_ASSET_FIELDS.forEach((field) => {
    if (overrides.has(field) || !(field in asset)) return;
    if (field === 'appearance' && overrides.has('color')) {
      result.appearance = recolorAppearance(asset.appearance, asset.color, result.color);
    } else result[field] = clone(asset[field]);
  });
  result.assetId = asset.id;
  result.assetOverrides = [...overrides].filter((field) => LINKED_ASSET_FIELDS.includes(field));
  return result;
}

export function overridePlacementValue(placement, path, value) {
  if (!placement || !Array.isArray(path) || !path.length || value === undefined) return placement;
  const result = clone(placement);
  const field = path[0];
  const previousColor = result.color;
  const parent = path.slice(0, -1).reduce((entry, key) => entry[key], result);
  parent[path.at(-1)] = value;
  if (field === 'color') result.appearance = recolorAppearance(result.appearance, previousColor, value);
  if (LINKED_ASSET_FIELDS.includes(field)) result.assetOverrides = [...new Set([...(result.assetOverrides ?? []), field])];
  return result;
}

function appearance(rows, palette, { animation = 'idle', fps = 4 } = {}) {
  const duration = 1 / fps;
  return {
    width: rows[0].length,
    height: rows.length,
    palette,
    pixels: rows,
    animations: [{ id: animation, fps, duration, loop: true, keyframes: [{ id: 'keyframe-1', time: 0, easing: 'step', pixels: rows }] }],
    stateAnimations: { idle: animation, up: animation, right: animation, down: animation, left: animation },
  };
}

const noteRows = [
  '000000110000', '000000111100', '000000100100', '000000100100',
  '000000100100', '000000100100', '000011100000', '000111100000',
  '000111000000', '000000000000', '000000000000', '000000000000',
];
const zauberbergNoteRows = [
  '00011000', '00011110', '00011010', '00011010',
  '00011000', '00011000', '00011000', '00011000',
  '00111000', '01111000', '01110000', '00000000',
];
const lightRows = [
  '1000000000000001', '0100000000000010', '0010000000000100', '0011000000001100',
  '0001000000001000', '0001100000011000', '0000100000010000', '0000110000110000',
  '0000010000100000', '0000011001100000', '0000001010000000', '0000001110000000',
];
const birdRows = [
  '000000000000', '000000110000', '000011111000', '000122211100',
  '001222221110', '001222111000', '000111100000', '000011000000',
  '000110000000', '001100000000', '000000000000', '000000000000',
];
const mailboxRows = ['00000000', '00111100', '01111110', '01222210', '01111110', '00011000', '00011000', '00011000'];
const speakerRows = ['00000000', '01111110', '01222210', '01211210', '01222210', '01211210', '01111110', '00000000'];
const bookRows = ['00000000', '01100110', '01211210', '01211210', '01211210', '01211210', '01111110', '00000000'];
const steamRows = ['00011000', '00110000', '00011000', '00001100', '00011000', '00110000', '00000000', '00000000'];
const sparkRows = ['00010000', '01010100', '00111000', '11111110', '00111000', '01010100', '00010000', '00000000'];
const flagRows = ['00011000', '00011110', '00012220', '00011110', '00011000', '00011000', '00011000', '00111100'];
const bellRows = ['00011000', '00111100', '01111110', '01122110', '01111110', '11111111', '00111100', '00011000'];
const stickRows = ['00000000', '00000010', '00000110', '00001100', '00011000', '00110000', '01100000', '01000000'];

export const DEFAULT_OBJECT_ASSETS = Object.freeze([
  {
    id: 'music-note', name: 'Musiknote', category: 'Musik', description: 'Eine frei verwendbare goldene Musiknote.',
    type: 'custom', width: 2, height: 2, color: '#f5c451', label: '♪', appearance: appearance(noteRows, ['transparent', '#f5c451']),
    animation: { type: 'bob', speed: 1.1, amplitude: 0.125 },
  },
  {
    id: 'zauberberg-note', name: 'Zauberberg-Note', category: 'Zauberberg', description: 'Die echte cyanfarbene Note von der Zauberberg-Bühne.',
    type: 'custom', width: 2, height: 3, color: '#63d9d4', label: '♪', appearance: appearance(zauberbergNoteRows, ['transparent', '#63d9d4']),
    animation: { type: 'bob', speed: 1.1, amplitude: 0.125 },
    effects: [{ id: 'buehnen-neon', type: 'neon', intensity: 0.65, speed: 1.2, color: '#63d9d4' }],
  },
  {
    id: 'stage-lights', name: 'Bühnenlichter', category: 'Bühne', description: 'Farbige Lichtkegel für Konzerte und Szenen.',
    type: 'custom', width: 4, height: 3, color: '#ff4f87', label: '⌁', appearance: appearance(lightRows, ['transparent', '#ff4f87']),
    animation: { type: 'pulse', speed: 0.7, amplitude: 0.12 },
    effects: [{ id: 'licht-funkeln', type: 'sparkle', intensity: 0.55, speed: 1.4, color: '#ff4f87' }],
  },
  {
    id: 'kingfisher', name: 'Eisvogel', category: 'Passau', description: 'Das Ilz-Easteregg als frei platzierbares Objekt.',
    type: 'custom', width: 2, height: 2, color: '#55d9dd', label: '◆', appearance: appearance(birdRows, ['transparent', '#194b63', '#e9a34b']),
    animation: { type: 'bob', speed: 0.65, amplitude: 0.1 },
    effects: [{ id: 'gefieder-funkeln', type: 'sparkle', intensity: 0.35, speed: 0.8, color: '#e9a34b' }],
  },
  { id: 'tree', name: 'Baum', category: 'Nachbarschaft', description: 'Ein klassischer Pixelbaum.', type: 'tree', width: 2, height: 2, color: '#4f9362', label: '', appearance: null, animation: { type: 'none', speed: 1, amplitude: 0.15 } },
  { id: 'bench', name: 'Parkbank', category: 'Nachbarschaft', description: 'Bank für Bschütt und Gassirunden.', type: 'bench', width: 2, height: 1, color: '#b4794f', label: '', appearance: null, animation: { type: 'none', speed: 1, amplitude: 0.15 } },
  { id: 'sign', name: 'Schild', category: 'Stadt', description: 'Beschriftbares Schild.', type: 'sign', width: 2, height: 1, color: '#d7b56d', label: 'PASSAU', appearance: null, animation: { type: 'none', speed: 1, amplitude: 0.15 } },
  { id: 'text-block', name: 'Freier Textblock', category: 'Text', description: 'Frei beweglicher, zweisprachiger Text direkt im Level.', type: 'text', width: 5, height: 2, color: '#f5e7bd', label: 'TEXT', content: { standard: 'Text im Level', dialect: 'Text im Level' }, textStyle: { fontSize: 0.45, align: 'center', verticalAlign: 'middle', background: '#071016', backgroundOpacity: 0, borderColor: '#55d9dd', borderOpacity: 0, padding: 0.2, uppercase: false }, appearance: null, animation: { type: 'none', speed: 1, amplitude: 0.15 }, effects: [] },
  { id: 'brahmahof-mailbox', name: 'Briefkasten Nr. 30', category: 'Bramerhof', description: 'Der Briefkasten vor Franz und Lolas Haus.', type: 'custom', width: 2, height: 2, color: '#d7b56d', label: '30', appearance: appearance(mailboxRows, ['transparent', '#8a6a45', '#f5c451']), animation: { type: 'none', speed: 1, amplitude: 0.1 } },
  { id: 'concert-speaker', name: 'Konzertbox', category: 'Zauberberg', description: 'Eine kräftige Pixelbox für Rock, Punk und Metal.', type: 'custom', width: 2, height: 2, color: '#ff4f87', label: '▣', appearance: appearance(speakerRows, ['transparent', '#34203f', '#ff4f87']), animation: { type: 'pulse', speed: 0.55, amplitude: 0.06 }, effects: [{ id: 'bass-echo', type: 'echo', intensity: 0.45, speed: 1.8, color: '#ff4f87' }] },
  { id: 'university-book', name: 'Passauer Buch', category: 'Universität', description: 'Ein aufgeschlagenes Buch für Campus-Ereignisse.', type: 'custom', width: 2, height: 2, color: '#55d9dd', label: '▤', appearance: appearance(bookRows, ['transparent', '#f5e7bd', '#55d9dd']), animation: { type: 'none', speed: 1, amplitude: 0.1 } },
  { id: 'factory-steam', name: 'Fabrikdampf', category: 'Tabakfabrik', description: 'Animierbarer Dampf aus der alten Tabakfabrik.', type: 'custom', width: 2, height: 2, color: '#f0d0a0', label: '≈', appearance: appearance(steamRows, ['transparent', '#f0d0a0']), animation: { type: 'bob', speed: 0.45, amplitude: 0.18 }, effects: [{ id: 'dampf-echo', type: 'echo', intensity: 0.35, speed: 0.7, color: '#f0d0a0' }] },
  { id: 'river-spark', name: 'Flussfunkeln', category: 'Passau', description: 'Ein Lichtreflex für Inn, Ilz und Donau.', type: 'custom', width: 2, height: 2, color: '#55d9dd', label: '✦', appearance: appearance(sparkRows, ['transparent', '#55d9dd']), animation: { type: 'pulse', speed: 0.75, amplitude: 0.18 }, effects: [{ id: 'wasser-funkeln', type: 'sparkle', intensity: 0.6, speed: 1.2, color: '#55d9dd' }] },
  { id: 'oberhaus-flag', name: 'Oberhaus-Fahne', category: 'Oberhaus', description: 'Eine kleine Fahne über der Stadt.', type: 'custom', width: 2, height: 2, color: '#f5c451', label: '⚑', appearance: appearance(flagRows, ['transparent', '#7a4a34', '#f5c451']), animation: { type: 'bob', speed: 0.4, amplitude: 0.08 } },
  { id: 'cathedral-bell', name: 'Domglocke', category: 'Dom', description: 'Die Passauer Glocke als universelles Objekt.', type: 'custom', width: 2, height: 2, color: '#f5c451', label: '♜', appearance: appearance(bellRows, ['transparent', '#8f6c2e', '#f5c451']), animation: { type: 'spin', speed: 0.25, amplitude: 0.08 } },
  { id: 'lola-stick', name: 'Lolas Superstöckchen', category: 'Bschüttpark', description: 'Das legendäre Stöckchen aus dem Bschüttpark.', type: 'custom', width: 2, height: 2, color: '#b4794f', label: '/', appearance: appearance(stickRows, ['transparent', '#b4794f']), animation: { type: 'spin', speed: 0.2, amplitude: 0.04 } },
]);

export function createBlankObjectAsset(name = 'Neues Objekt', resolution = 24, category = 'Eigene Objekte') {
  const id = slug(name, `objekt-${Date.now()}`);
  const size = normalizeSpriteSize(resolution);
  const rows = Array.from({ length: size }, () => '0'.repeat(size));
  return {
    id, name, category, description: 'Selbst gestaltetes Sprite-Objekt.', type: 'custom', width: 2, height: 2,
    color: '#55d9dd', label: '◆', appearance: appearance(rows, ['transparent', '#55d9dd']), animation: { type: 'none', speed: 1, amplitude: 0.15 }, effects: [],
  };
}

export class ObjectLibrary {
  constructor(storage = globalThis.localStorage, key = 'franz-lola-object-library-v1') {
    this.storage = storage;
    this.key = key;
  }

  readCustom() {
    try {
      const value = JSON.parse(this.storage?.getItem(this.key) ?? '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  list() {
    const custom = this.readCustom();
    const customById = new Map(custom.map((asset) => [asset.id, asset]));
    return [
      ...DEFAULT_OBJECT_ASSETS.map((asset) => clone(customById.get(asset.id) ?? asset)),
      ...custom.filter((asset) => !DEFAULT_OBJECT_ASSETS.some((builtIn) => builtIn.id === asset.id)).map(clone),
    ];
  }

  save(asset) {
    const normalized = { ...clone(asset), id: slug(asset.id || asset.name) };
    const custom = this.readCustom().filter((entry) => entry.id !== normalized.id);
    custom.push(normalized);
    this.storage?.setItem(this.key, JSON.stringify(custom));
    return clone(normalized);
  }

  remove(id) {
    const custom = this.readCustom().filter((entry) => entry.id !== id);
    this.storage?.setItem(this.key, JSON.stringify(custom));
  }

  replaceCustom(entries) {
    this.storage?.setItem(this.key, JSON.stringify(clone(Array.isArray(entries) ? entries : [])));
  }
}

export function placementFromAsset(asset, point, index = 0) {
  return {
    id: `${asset.id}-${Date.now()}-${index}`,
    assetId: asset.id,
    assetOverrides: [],
    name: asset.name,
    type: asset.type,
    x: point.x,
    y: point.y,
    width: asset.width,
    height: asset.height,
    color: asset.color,
    label: asset.label,
    appearance: clone(asset.appearance),
    spriteAnimation: asset.appearance?.animations?.[0]?.id ?? '',
    effects: clone(asset.effects ?? []),
    animation: clone(asset.animation),
    ...(asset.content ? { content: clone(asset.content), textStyle: clone(asset.textStyle) } : {}),
    layer: 'scenery',
    locked: false,
  };
}
