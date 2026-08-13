import { isPresentationFrame } from './presentation-frame.js';

const FRAME_KEYS = Object.freeze(['kind', 'frameId', 'presentationTime', 'camera', 'player', 'cats', 'characters', 'display', 'renderer']);
const ALIAS_KEYS = Object.freeze(['playerScreen', 'entities', 'characterEntities']);
const RESULT_KEYS = Object.freeze([...FRAME_KEYS, ...ALIAS_KEYS]);

function exactDataDescriptors(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || !Object.isFrozen(value)) {
    throw new TypeError('Renderer render result must be a frozen plain object.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== RESULT_KEYS.length || keys.some((key) => !RESULT_KEYS.includes(key))) {
    throw new TypeError('Renderer render result contains unknown or missing properties.');
  }
  for (const key of RESULT_KEYS) {
    if (!descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value')) {
      throw new TypeError(`Renderer render result ${key} must be an enumerable data property.`);
    }
  }
  return descriptors;
}

export function createPresentationRenderResult(frame) {
  if (!isPresentationFrame(frame)) throw new TypeError('Renderer render result requires a valid PresentationFrame.');
  return Object.freeze({
    ...frame,
    playerScreen: frame.player.screen,
    entities: frame.cats,
    characterEntities: frame.characters,
  });
}

export function presentationFrameFromRenderResult(result) {
  const descriptors = exactDataDescriptors(result);
  const frame = Object.freeze(Object.fromEntries(FRAME_KEYS.map((key) => [key, descriptors[key].value])));
  if (!isPresentationFrame(frame)) throw new TypeError('Renderer render result does not contain a valid PresentationFrame.');
  const playerScreen = Object.getOwnPropertyDescriptor(descriptors.player.value, 'screen');
  if (!playerScreen || !Object.hasOwn(playerScreen, 'value')
    || descriptors.playerScreen.value !== playerScreen.value
    || descriptors.entities.value !== descriptors.cats.value
    || descriptors.characterEntities.value !== descriptors.characters.value) {
    throw new TypeError('Renderer render result aliases must reference the current canonical frame.');
  }
  return frame;
}
