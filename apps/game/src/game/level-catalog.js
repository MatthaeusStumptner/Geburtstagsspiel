import { validateLevelDocument } from '@franz-lola/content-model';

const clone = (value) => JSON.parse(JSON.stringify(value));
const modules = import.meta.glob('../data/levels/*.level.json', { eager: true, import: 'default' });
const mapMarkerClasses = new Set(['park', 'industrial', 'music']);

function normalizePublishedLevel(raw, path) {
  const result = validateLevelDocument(raw);
  if (!result.ok) throw new Error(`Ungültiges veröffentlichtes Level ${path}: ${result.errors.join(' ')}`);
  const mapOrder = Number(raw?.source?.mapOrder);
  return {
    ...result.value,
    source: {
      ...result.value.source,
      mapOrder: Number.isInteger(mapOrder) && mapOrder >= 0 ? mapOrder : Number.MAX_SAFE_INTEGER,
    },
  };
}

const ids = new Set();
export const LEVEL_DOCUMENTS = Object.freeze(Object.entries(modules)
  .map(([path, raw]) => normalizePublishedLevel(raw, path))
  .sort((left, right) => left.source.mapOrder - right.source.mapOrder || left.id.localeCompare(right.id))
  .map((level) => {
    if (ids.has(level.id)) throw new Error(`Doppelte veröffentlichte Level-ID: ${level.id}`);
    ids.add(level.id);
    return Object.freeze(level);
  }));

if (!LEVEL_DOCUMENTS.length) throw new Error('Es wurden keine veröffentlichten Level gefunden.');

export const PASSAU_LEVELS = Object.freeze(LEVEL_DOCUMENTS.map((level) => Object.freeze({
  id: level.id,
  icon: level.icon,
  lat: level.location.latitude,
  lon: level.location.longitude,
  layout: level.source.gameLayout,
  river: level.location.area,
  home: level.source.home,
  markerClass: mapMarkerClasses.has(level.source.markerClass) ? level.source.markerClass : '',
  theme: level.theme.id === 'neighborhood' ? '' : level.theme.id,
  palette: level.theme.palette,
  name: level.name,
  description: level.description,
  mission: level.mission,
})));

export function publishedLevel(id) {
  const level = LEVEL_DOCUMENTS.find((entry) => entry.id === id) ?? LEVEL_DOCUMENTS[0];
  return clone(level);
}

export function publishedEventStorageKeys() {
  return [...new Set(LEVEL_DOCUMENTS.flatMap((level) => level.events.map((event) => (
    event.scope === 'level' ? `${level.id}:${event.id}` : event.id
  ))))];
}
