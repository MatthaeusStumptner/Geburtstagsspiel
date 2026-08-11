const FRAME_KIND = 'franz-lola-presentation-frame';

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

function cloneFrozen(value, path, ancestors = new WeakSet()) {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} darf keine nicht-endliche Zahl enthalten.`);
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`${path} enthält einen nicht unterstützten Wert.`);
  if (ancestors.has(value)) throw new TypeError(`${path} darf keine zyklischen Werte enthalten.`);
  ancestors.add(value);
  let cloned;
  if (Array.isArray(value)) {
    cloned = Object.freeze(value.map((item, index) => cloneFrozen(item, `${path}[${index}]`, ancestors)));
  } else {
    assertRecord(value, path);
    cloned = Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneFrozen(item, `${path}.${key}`, ancestors)])));
  }
  ancestors.delete(value);
  return cloned;
}

function assertInput(input) {
  assertRecord(input, 'input');
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
  return Object.values(value).every((item) => isDeepFrozen(item, seen));
}

export function createPresentationFrame(input) {
  assertInput(input);
  return Object.freeze({
    kind: FRAME_KIND,
    frameId: input.frameId,
    presentationTime: input.presentationTime,
    camera: cloneFrozen(input.camera, 'camera'),
    player: cloneFrozen(input.player, 'player'),
    cats: cloneFrozen(input.cats, 'cats'),
    characters: cloneFrozen(input.characters, 'characters'),
    display: cloneFrozen(input.display, 'display'),
    renderer: cloneFrozen(input.renderer, 'renderer'),
  });
}

export function isPresentationFrame(value) {
  try {
    if (!isRecord(value) || value.kind !== FRAME_KIND) return false;
    assertInput(value);
    return isDeepFrozen(value);
  } catch {
    return false;
  }
}
