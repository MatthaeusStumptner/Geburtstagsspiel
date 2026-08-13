const FRAME_KIND = 'franz-lola-presentation-frame';
const FRAME_KEYS = Object.freeze(['kind', 'frameId', 'presentationTime', 'camera', 'player', 'cats', 'characters', 'display', 'renderer']);

const isRecord = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function assertRecord(value, name) {
  if (!isRecord(value)) throw new TypeError(`${name} muss ein Objekt sein.`);
}

const isCanonicalString = (value) => typeof value === 'string' && value.length > 0 && value.trim() === value;

function assertCanonicalString(value, name) {
  if (!isCanonicalString(value)) throw new TypeError(`${name} muss ein nicht-leerer kanonischer String sein.`);
}

function assertFinitePoint(value, name) {
  assertRecord(value, name);
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new TypeError(`${name} muss endliche x- und y-Koordinaten enthalten.`);
  }
}

function assertCameraRect(value, name) {
  assertRecord(value, name);
  for (const coordinate of ['x', 'y']) {
    if (!Number.isFinite(value[coordinate])) throw new TypeError(`${name}.${coordinate} muss endlich sein.`);
  }
  for (const dimension of ['width', 'height']) {
    if (!Number.isFinite(value[dimension]) || value[dimension] <= 0) {
      throw new TypeError(`${name}.${dimension} muss positiv und endlich sein.`);
    }
  }
}

function assertEntity(value, name) {
  assertRecord(value, name);
  assertCanonicalString(value.id, `${name}.id`);
  assertFinitePoint(value.world, `${name}.world`);
  assertFinitePoint(value.screen, `${name}.screen`);
}

function assertCat(value, name) {
  assertEntity(value, name);
  if (typeof value.onScreen !== 'boolean') throw new TypeError(`${name}.onScreen muss boolesch sein.`);
  if (!Number.isFinite(value.distance) || value.distance < 0) throw new TypeError(`${name}.distance muss endlich und nicht-negativ sein.`);
  assertCanonicalString(value.color, `${name}.color`);
  if (!Number.isFinite(value.respawnTimer) || value.respawnTimer < 0) throw new TypeError(`${name}.respawnTimer muss endlich und nicht-negativ sein.`);
}

function assertDisplay(value) {
  assertRecord(value, 'display');
  for (const name of ['width', 'height', 'actualPixelRatio', 'pixelRatio']) {
    if (!Number.isFinite(value[name]) || value[name] <= 0) throw new TypeError(`display.${name} muss positiv und endlich sein.`);
  }
  for (const name of ['bufferWidth', 'bufferHeight']) {
    if (!Number.isSafeInteger(value[name]) || value[name] <= 0) throw new TypeError(`display.${name} muss eine positive sichere Ganzzahl sein.`);
  }
}

function assertRenderer(value) {
  assertRecord(value, 'renderer');
  assertCanonicalString(value.requestedBackend, 'renderer.requestedBackend');
  assertCanonicalString(value.backend, 'renderer.backend');
  if (value.fallbackReason !== null && !isCanonicalString(value.fallbackReason)) throw new TypeError('renderer.fallbackReason muss null oder ein kanonischer String sein.');
  if (typeof value.contextLost !== 'boolean') throw new TypeError('renderer.contextLost muss boolesch sein.');
}

function cloneSerializable(value, path, { freeze = false, ancestors = new WeakSet() } = {}) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} darf keine nicht-endliche Zahl enthalten.`);
    return value;
  }
  if (value === undefined || typeof value !== 'object') throw new TypeError(`${path} enthält einen nicht unterstützten Wert.`);
  if (ancestors.has(value)) throw new TypeError(`${path} darf keine zyklischen Werte enthalten.`);
  ancestors.add(value);
  let cloned;
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expectedKeys = new Set(['length', ...Array.from({ length: value.length }, (_, index) => String(index))]);
    const actualKeys = Reflect.ownKeys(descriptors);
    if (actualKeys.length !== expectedKeys.size || actualKeys.some((key) => !expectedKeys.has(key))) {
      throw new TypeError(`${path} enthält nicht serialisierbare Array-Eigenschaften.`);
    }
    cloned = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`${path} enthält nicht serialisierbare Array-Eigenschaften.`);
      }
      cloned.push(cloneSerializable(descriptor.value, `${path}[${index}]`, { freeze, ancestors }));
    }
  } else {
    assertRecord(value, path);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`${path} enthält nicht serialisierbare Eigenschaften.`);
      }
    }
    cloned = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [
      key,
      cloneSerializable(descriptor.value, `${path}.${key}`, { freeze, ancestors }),
    ]));
  }
  ancestors.delete(value);
  return freeze ? Object.freeze(cloned) : cloned;
}

function assertInput(input, { requireKind = false } = {}) {
  assertRecord(input, 'input');
  const keys = Object.keys(input);
  if (keys.some((key) => !FRAME_KEYS.includes(key)) || (requireKind && !keys.includes('kind'))) {
    throw new TypeError('PresentationFrame root enthält unbekannte oder fehlende Eigenschaften.');
  }
  if (Object.hasOwn(input, 'kind') && input.kind !== FRAME_KIND) throw new TypeError('PresentationFrame kind ist ungültig.');
  if (!Number.isInteger(input.frameId) || input.frameId < 1) throw new TypeError('frameId muss positiv und ganzzahlig sein.');
  if (!Number.isFinite(input.presentationTime)) throw new TypeError('presentationTime muss endlich sein.');
  assertRecord(input.camera, 'camera');
  assertCameraRect(input.camera.source, 'camera.source');
  assertCameraRect(input.camera.viewport, 'camera.viewport');
  assertEntity(input.player, 'player');
  if (!Array.isArray(input.cats) || !Array.isArray(input.characters)) throw new TypeError('cats und characters müssen Arrays sein.');
  input.cats.forEach((cat, index) => assertCat(cat, `cats[${index}]`));
  input.characters.forEach((character, index) => assertEntity(character, `characters[${index}]`));
  assertDisplay(input.display);
  assertRenderer(input.renderer);
}

function isDeepFrozen(value, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && isDeepFrozen(descriptor.value, seen);
  });
}

function validPresentationFrameClone(value) {
  try {
    const cloned = cloneSerializable(value, 'frame');
    assertInput(cloned, { requireKind: true });
    return isDeepFrozen(value) ? cloned : null;
  } catch {
    return null;
  }
}

export function createPresentationFrame(input) {
  const cloned = cloneSerializable(input, 'input', { freeze: true });
  assertInput(cloned);
  return Object.freeze({
    kind: FRAME_KIND,
    frameId: cloned.frameId,
    presentationTime: cloned.presentationTime,
    camera: cloned.camera,
    player: cloned.player,
    cats: cloned.cats,
    characters: cloned.characters,
    display: cloned.display,
    renderer: cloned.renderer,
  });
}

export function serializePresentationFrame(frame) {
  const cloned = validPresentationFrameClone(frame);
  if (!cloned) throw new TypeError('Diagnostic capture requires a valid PresentationFrame.');
  return cloned;
}

export function isPresentationFrame(value) {
  return validPresentationFrameClone(value) !== null;
}