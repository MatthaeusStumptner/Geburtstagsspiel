const FRAME_KIND = 'franz-lola-presentation-frame';

const isRecord = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function assertRecord(value, name) {
  if (!isRecord(value)) throw new TypeError(`${name} muss ein Objekt sein.`);
}

function assertPoint(value, name) {
  assertRecord(value, name);
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new TypeError(`${name} muss endliche x- und y-Koordinaten enthalten.`);
  }
}

function assertEntity(value, name) {
  assertRecord(value, name);
  assertPoint(value.world, `${name}.world`);
  assertPoint(value.screen, `${name}.screen`);
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
  assertRecord(input.camera.source, 'camera.source');
  assertRecord(input.camera.viewport, 'camera.viewport');
  for (const area of ['source', 'viewport']) {
    for (const coordinate of ['x', 'y', 'width', 'height']) {
      if (!Number.isFinite(input.camera[area][coordinate])) {
        throw new TypeError(`camera.${area}.${coordinate} muss endlich sein.`);
      }
    }
  }
  assertEntity(input.player, 'player');
  if (!Array.isArray(input.cats) || !Array.isArray(input.characters)) throw new TypeError('cats und characters müssen Arrays sein.');
  input.cats.forEach((cat, index) => assertEntity(cat, `cats[${index}]`));
  input.characters.forEach((character, index) => assertEntity(character, `characters[${index}]`));
  assertRecord(input.display, 'display');
  assertRecord(input.renderer, 'renderer');
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
