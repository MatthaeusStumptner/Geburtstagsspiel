import { createLevelDocument, validateLevelDocument } from './level-format.js';
import { CONTENT_SCHEMA_VERSION, migrateContentDocument } from './migrations.js';

export const CONTENT_DOCUMENT_KIND = 'franz-lola-content';
export const CONTENT_TYPES = Object.freeze([
  'character', 'tileset', 'block', 'animation', 'cutscene', 'object', 'event',
]);

const SUPPORTED_CONTENT_TYPES = Object.freeze(['level', ...CONTENT_TYPES]);
const CONTENT_PATHS = Object.freeze({
  level: ['levels', 'level'],
  character: ['library/characters', 'character'],
  tileset: ['library/tilesets', 'tileset'],
  block: ['library/blocks', 'block'],
  animation: ['library/animations', 'animation'],
  cutscene: ['library/cutscenes', 'cutscene'],
  object: ['library/objects', 'object'],
  event: ['library/events', 'event'],
});

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const text = (value, fallback = '') => typeof value === 'string' ? value.trim() || fallback : fallback;
const slug = (value, fallback = 'content') => text(value, fallback)
  .normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/ß/g, 'ss')
  .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

function localizedName(value, fallback) {
  if (value && typeof value === 'object') return text(value.standard, text(value.dialect, fallback));
  return text(value, fallback);
}

function normalizeCharacter(input, id, name) {
  const character = createLevelDocument({
    board: { columns: 25, rows: 25 },
    actors: { cats: [], characters: [{ ...clone(input), id, characterId: id, name, x: 1, y: 1 }] },
    collectibles: { powerUps: [] },
  }).actors.characters[0];
  const { x: _x, y: _y, characterId: _characterId, ...portable } = character;
  return { ...portable, id, name, description: text(input?.description, 'Wiederverwendbare Figur.') };
}

function normalizeObject(input, id, name) {
  const object = createLevelDocument({
    board: { columns: 25, rows: 25 },
    actors: { cats: [] },
    collectibles: { powerUps: [] },
    decorations: [{ ...clone(input), id, assetId: id, name, x: 1, y: 1 }],
  }).decorations[0];
  const { x: _x, y: _y, assetId: _assetId, assetOverrides: _assetOverrides, layer: _layer, locked: _locked, ...portable } = object;
  return {
    ...portable,
    id,
    name,
    category: text(input?.category, 'Eigene Objekte'),
    description: text(input?.description, 'Wiederverwendbares Objekt.'),
  };
}

function normalizeTileset(input, id, name) {
  const theme = createLevelDocument({
    board: { columns: 25, rows: 25 }, actors: { cats: [] }, collectibles: { powerUps: [] },
    theme: { ...clone(input), id },
  }).theme;
  return { ...theme, id, name, description: text(input?.description, 'Wiederverwendbares Level-Theme.') };
}

function normalizeBlock(input, id, name) {
  const wall = createLevelDocument({
    board: { columns: 25, rows: 25, walls: [{ ...clone(input), id, name, x: 1, y: 1 }] },
    actors: { cats: [] }, collectibles: { powerUps: [] },
  }).board.walls[0];
  const { x: _x, y: _y, ...portable } = wall;
  return { ...portable, id, name, description: text(input?.description, 'Wiederverwendbarer Baustein.') };
}

function normalizeCutscene(input, id, name) {
  const cutscene = createLevelDocument({
    board: { columns: 25, rows: 25 }, actors: { cats: [] }, collectibles: { powerUps: [] },
    cutscenes: [{ ...clone(input), id, name: input?.name ?? { standard: name, dialect: name } }],
  }).cutscenes[0];
  return { ...cutscene, id, description: text(input?.description, 'Wiederverwendbare Cutscene.') };
}

function normalizeAnimation(input, id, name) {
  const target = input?.target === 'motion' || input?.type && !input?.keyframes?.some((frame) => frame?.pixels)
    ? 'motion'
    : 'sprite';
  if (target === 'motion') {
    const object = normalizeObject({ id: 'animation-probe', name, animation: input?.motion ?? input }, 'animation-probe', name);
    return { id, name, description: text(input?.description, 'Wiederverwendbare Bewegung.'), target, motion: object.animation };
  }
  const width = Math.max(4, Math.min(24, Math.round(Number(input?.width) || 8)));
  const height = Math.max(4, Math.min(24, Math.round(Number(input?.height) || 8)));
  const pixels = Array.from({ length: height }, (_, row) => text(input?.pixels?.[row], '0'.repeat(width)).padEnd(width, '0').slice(0, width));
  const character = normalizeCharacter({
    id: 'animation-probe', name,
    appearance: {
      width, height,
      palette: Array.isArray(input?.palette) ? input.palette : ['transparent', '#55d9dd'],
      pixels,
      animations: [{ ...clone(input?.animation ?? input), id }],
    },
  }, 'animation-probe', name);
  return {
    id,
    name,
    description: text(input?.description, 'Wiederverwendbare Sprite-Animation.'),
    target,
    width: character.appearance.width,
    height: character.appearance.height,
    palette: character.appearance.palette,
    animation: character.appearance.animations[0],
  };
}

function normalizeEvent(input, id, name) {
  return createLevelDocument({
    board: { columns: 25, rows: 25 },
    actors: { cats: [] },
    collectibles: { powerUps: [] },
    events: [{ ...clone(input), id, name: input?.name ?? { standard: name, dialect: name } }],
  }).events[0];
}

function normalizeDocument(type, input, id, name) {
  if (type === 'level') return createLevelDocument({ ...clone(input), id });
  if (type === 'character') return normalizeCharacter(input, id, name);
  if (type === 'object') return normalizeObject(input, id, name);
  if (type === 'tileset') return normalizeTileset(input, id, name);
  if (type === 'block') return normalizeBlock(input, id, name);
  if (type === 'cutscene') return normalizeCutscene(input, id, name);
  if (type === 'animation') return normalizeAnimation(input, id, name);
  if (type === 'event') return normalizeEvent(input, id, name);
  throw new TypeError(`Unbekannter Inhaltstyp: ${type}`);
}

function normalizeDependencies(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((entry) => {
    if (!SUPPORTED_CONTENT_TYPES.includes(entry?.type)) return [];
    const id = slug(entry.id, '');
    if (!id) return [];
    const relation = slug(entry.relation, 'uses');
    const key = `${entry.type}:${id}:${relation}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      type: entry.type,
      id,
      ...(Number.isInteger(entry.revision) && entry.revision > 0 ? { revision: entry.revision } : {}),
      relation,
    }];
  });
}

function normalizeReferences(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((entry) => {
    if (!SUPPORTED_CONTENT_TYPES.includes(entry?.type)) return [];
    const id = slug(entry.id, '');
    if (!id) return [];
    const key = `${entry.type}:${id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ type: entry.type, id }];
  });
}

export function createContentDocument(type, input = {}, metadata = {}) {
  if (!SUPPORTED_CONTENT_TYPES.includes(type)) throw new TypeError(`Unbekannter Inhaltstyp: ${type}`);
  const id = slug(metadata.id ?? input?.id, type);
  const name = text(metadata.name, localizedName(input?.name, id));
  return {
    kind: CONTENT_DOCUMENT_KIND,
    schemaVersion: CONTENT_SCHEMA_VERSION,
    type,
    id,
    name,
    description: typeof metadata.description === 'string' ? metadata.description.trim() : text(input?.description, ''),
    document: normalizeDocument(type, input, id, name),
    dependencies: normalizeDependencies(metadata.dependencies),
    references: normalizeReferences(metadata.references),
  };
}

function validateReferences(value) {
  if (!Array.isArray(value)) return ['references muss ein Array sein.'];
  const errors = [];
  value.forEach((reference, index) => {
    const path = `references[${index}]`;
    if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
      errors.push(`${path} muss ein Objekt sein.`);
      return;
    }
    if (Object.keys(reference).some((key) => !['type', 'id'].includes(key))) {
      errors.push(`${path} darf nur type und id enthalten.`);
    }
    if (!SUPPORTED_CONTENT_TYPES.includes(reference.type)) {
      errors.push(`${path}.type ist kein unterstützter Inhaltstyp.`);
    }
    if (typeof reference.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(reference.id)) {
      errors.push(`${path}.id muss ein URL-tauglicher Slug sein.`);
    }
  });
  return errors;
}

function validateCurrentContentDocument(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) errors.push('Das Content-Dokument muss ein Objekt sein.');
  if (input?.kind !== CONTENT_DOCUMENT_KIND) errors.push(`kind muss "${CONTENT_DOCUMENT_KIND}" sein.`);
  if (input?.schemaVersion !== CONTENT_SCHEMA_VERSION) errors.push(`schemaVersion muss ${CONTENT_SCHEMA_VERSION} sein.`);
  if (!SUPPORTED_CONTENT_TYPES.includes(input?.type)) errors.push('type ist kein unterstützter Inhaltstyp.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input?.id ?? '')) errors.push('id muss ein URL-tauglicher Slug sein.');
  if (!text(input?.name)) errors.push('name darf nicht leer sein.');
  if (!input?.document || typeof input.document !== 'object' || Array.isArray(input.document)) errors.push('document muss ein Objekt sein.');
  errors.push(...validateReferences(input?.references));
  if (errors.length) return { ok: false, errors, value: null };
  try {
    const value = createContentDocument(input.type, input.document, input);
    value.references = clone(input.references);
    if (value.id !== input.id) errors.push('id ist nicht kanonisch.');
    if (input.type === 'level') {
      const level = validateLevelDocument(value.document);
      if (!level.ok) errors.push(...level.errors);
    }
    return { ok: errors.length === 0, errors, value: errors.length ? null : value };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)], value: null };
  }
}

export function validateContentDocument(input) {
  try {
    return validateCurrentContentDocument(migrateContentDocument(input));
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)], value: null };
  }
}

export function parseContentDocument(source) {
  let input;
  try { input = typeof source === 'string' ? JSON.parse(source) : source; }
  catch { throw new TypeError('Das Content-Dokument enthält kein gültiges JSON.'); }
  const migrated = migrateContentDocument(input);
  const result = validateCurrentContentDocument(migrated);
  if (!result.ok) throw new TypeError(result.errors.join('\n'));
  return result.value;
}

export function contentPublicationPath(type, id) {
  if (!SUPPORTED_CONTENT_TYPES.includes(type)) throw new TypeError(`Unbekannter Inhaltstyp: ${type}`);
  const canonicalId = slug(id, '');
  if (!canonicalId || canonicalId !== id) throw new TypeError('Content-ID muss ein kanonischer Slug sein.');
  const [directory, extension] = CONTENT_PATHS[type];
  return `src/data/${directory}/${canonicalId}.${extension}.json`;
}
