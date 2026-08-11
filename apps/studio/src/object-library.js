import { normalizeSpriteSize } from './sprite-appearance.js';
import rawCatalog from './data/content-catalog.generated.json' with { type: 'json' };

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

const OBJECT_LIBRARY_ORDER = Object.freeze([
  'music-note', 'zauberberg-note', 'stage-lights', 'kingfisher', 'tree', 'bench', 'sign', 'text-block',
  'brahmahof-mailbox', 'concert-speaker', 'university-book', 'factory-steam', 'river-spark', 'oberhaus-flag',
  'cathedral-bell', 'lola-stick',
]);
const canonicalObjects = new Map(rawCatalog.objects.map((entry) => [entry.id, entry.document]));
export const DEFAULT_OBJECT_ASSETS = Object.freeze(OBJECT_LIBRARY_ORDER.map((id) => Object.freeze(clone(canonicalObjects.get(id)))));

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
