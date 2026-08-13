import { createContentDocument } from './content-document.js';
import { validateLevelDocument } from './level-format.js';

const localized = (value, fallback) => typeof value === 'string'
  ? value.trim() || fallback
  : String(value?.standard || value?.dialect || fallback).trim();

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36).padStart(7, '0').slice(0, 7);
}

function contentId(...parts) {
  const full = parts.join('-').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/ß/g, 'ss')
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'content';
  return full.length <= 63 ? full : `${full.slice(0, 55).replace(/-+$/g, '')}-${hash(full)}`;
}

function animationDocuments(owner, ownerId, ownerName, levelName) {
  const result = [];
  for (const animation of owner?.appearance?.animations ?? []) {
    result.push(createContentDocument('animation', {
      id: contentId(ownerId, animation.id || 'sprite'),
      name: `${ownerName} · ${animation.id || 'Sprite'}`,
      width: owner.appearance.width,
      height: owner.appearance.height,
      palette: owner.appearance.palette,
      pixels: owner.appearance.pixels,
      animation,
    }, { description: `Sprite-Animation aus ${levelName}` }));
  }
  if (owner?.animation?.type && owner.animation.type !== 'none') {
    result.push(createContentDocument('animation', {
      id: contentId(ownerId, 'bewegung'),
      name: `${ownerName} · Bewegung`,
      target: 'motion',
      motion: owner.animation,
    }, { description: `Bewegung aus ${levelName}` }));
  }
  return result;
}

/** Extracts reusable, position-independent records from a self-contained level snapshot. */
export function extractEmbeddedContentDocuments(input) {
  const validation = validateLevelDocument(input);
  if (!validation.ok) throw new TypeError(validation.errors.join('\n'));
  const level = validation.value;
  const levelName = localized(level.name, level.id);
  const documents = [];
  const add = (type, value, suffix, name, description) => {
    const id = contentId(level.id, suffix);
    const content = createContentDocument(type, value, { id, name, description });
    documents.push(content);
    return { id, name };
  };

  const actors = [
    { value: level.actors.player, suffix: 'player', name: `${levelName} · Franz & Lola` },
    ...level.actors.cats.map((value, index) => ({ value, suffix: value.id || `cat-${index + 1}`, name: `${levelName} · Katze ${index + 1}` })),
    ...(level.actors.characters ?? []).map((value, index) => ({ value, suffix: value.id || `character-${index + 1}`, name: localized(value.name, `${levelName} · Figur ${index + 1}`) })),
  ];
  for (const actor of actors) {
    const identity = add('character', actor.value, actor.suffix, actor.name, `Figur aus ${levelName}`);
    documents.push(...animationDocuments(actor.value, identity.id, identity.name, levelName));
  }

  for (const [index, object] of level.decorations.entries()) {
    const name = localized(object.name, `${levelName} · Objekt ${index + 1}`);
    const identity = add('object', object, object.id || object.assetId || `object-${index + 1}`, name, `Objekt aus ${levelName}`);
    documents.push(...animationDocuments(object, identity.id, identity.name, levelName));
  }

  add('tileset', level.theme, `tileset-${level.theme.id || 'theme'}`, `${levelName} · Theme`, `Tileset aus ${levelName}`);
  level.board.walls.forEach((wall, index) => add('block', wall, wall.id || `wall-${index + 1}`, localized(wall.name, `${levelName} · Block ${index + 1}`), `Block aus ${levelName}`));
  level.cutscenes.forEach((cutscene, index) => add('cutscene', cutscene, `cutscene-${cutscene.id || index + 1}`, localized(cutscene.name, `${levelName} · Cutscene ${index + 1}`), `Cutscene aus ${levelName}`));
  level.events.forEach((event, index) => add('event', event, `event-${event.id || index + 1}`, localized(event.name, `${levelName} · Ereignis ${index + 1}`), `Ereignis aus ${levelName}`));

  return [...new Map(documents.map((document) => [`${document.type}:${document.id}`, document])).values()];
}
