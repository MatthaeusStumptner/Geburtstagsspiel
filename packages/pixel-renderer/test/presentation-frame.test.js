import assert from 'node:assert/strict';
import test from 'node:test';
import { createPresentationFrame, isPresentationFrame, serializePresentationFrame } from '../src/presentation-frame.js';

test('diagnostic capture returns a detached serializable copy and rejects malformed frames', () => {
  const frame = createPresentationFrame(sampleInput());
  const captured = serializePresentationFrame(frame);

  assert.deepEqual(captured, frame);
  assert.notStrictEqual(captured, frame);
  assert.notStrictEqual(captured.camera, frame.camera);
  captured.camera.source.x = 99;
  assert.equal(frame.camera.source.x, 10);
  assert.equal(JSON.parse(JSON.stringify(captured)).frameId, 7);
  assert.throws(() => serializePresentationFrame({ ...frame, frameId: Number.NaN }), /valid PresentationFrame/i);
});

function sampleInput() {
  return {
    frameId: 7,
    presentationTime: 12.5,
    camera: { source: { x: 10, y: 20, width: 100, height: 80 }, viewport: { x: 0, y: 40, width: 400, height: 320 } },
    player: { id: 'player', world: { x: 20, y: 30 }, screen: { x: 40, y: 80 } },
    cats: [{ id: 'cat-1', world: { x: 140, y: 30 }, screen: { x: 520, y: 80 }, onScreen: false, distance: 12, color: '#ff00ff', respawnTimer: 0 }],
    characters: [],
    display: { width: 400, height: 360, actualPixelRatio: 2.625, pixelRatio: 2, bufferWidth: 800, bufferHeight: 720 },
    renderer: { requestedBackend: 'auto', backend: 'webgl2', fallbackReason: null, contextLost: false },
  };
}

test('creates an immutable presentation frame with world and screen coordinates', () => {
  const frame = createPresentationFrame(sampleInput());
  assert.equal(isPresentationFrame(frame), true);
  assert.equal(frame.kind, 'franz-lola-presentation-frame');
  assert.equal(frame.cats[0].screen.x, 520);
  assert.throws(() => { frame.cats[0].screen.x = 1; }, TypeError);
});

test('copies and freezes every reachable presentation value', () => {
  const input = sampleInput();
  input.player.visual = { state: { phase: 'walk' } };
  const frame = createPresentationFrame(input);
  input.player.world.x = 999;
  input.player.visual.state.phase = 'idle';
  assert.equal(frame.player.world.x, 20);
  assert.equal(frame.player.visual.state.phase, 'walk');
  assert.throws(() => { frame.player.visual.state.phase = 'run'; }, TypeError);
  assert.throws(() => { frame.cats.push({}); }, TypeError);
});

test('rejects malformed inputs and forged frame lookalikes', () => {
  const input = sampleInput();
  assert.throws(() => createPresentationFrame({ ...input, frameId: 0 }), /frameId muss positiv und ganzzahlig sein/);
  assert.throws(() => createPresentationFrame({ ...input, presentationTime: Infinity }), /presentationTime muss endlich sein/);
  assert.throws(() => createPresentationFrame({ ...input, cats: {} }), TypeError);
  assert.throws(() => createPresentationFrame({ ...input, camera: { ...input.camera, source: {} } }), /camera.source.x muss endlich sein/);
  assert.equal(isPresentationFrame({ kind: 'franz-lola-presentation-frame', frameId: 1, presentationTime: 1 }), false);
});

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('rejects incomplete public display renderer and entity metadata', () => {
  const input = sampleInput();
  const invalidInputs = [
    { ...input, camera: { ...input.camera, source: { ...input.camera.source, width: 0 } } },
    { ...input, display: { ...input.display, width: Infinity } },
    { ...input, display: { ...input.display, bufferWidth: 800.5 } },
    { ...input, renderer: { ...input.renderer, requestedBackend: '' } },
    { ...input, renderer: { ...input.renderer, fallbackReason: 1 } },
    { ...input, renderer: { ...input.renderer, contextLost: 'false' } },
    { ...input, player: { ...input.player, id: ' ' } },
    { ...input, characters: [{ id: '', world: { x: 1, y: 2 }, screen: { x: 3, y: 4 } }] },
    { ...input, cats: [{ ...input.cats[0], onScreen: 'false' }] },
    { ...input, cats: [{ ...input.cats[0], distance: -1 }] },
    { ...input, cats: [{ ...input.cats[0], color: ' #ff00ff' }] },
    { ...input, cats: [{ ...input.cats[0], respawnTimer: NaN }] },
  ];

  invalidInputs.forEach((invalid) => assert.throws(() => createPresentationFrame(invalid), TypeError));
  const forged = deepFreeze({
    ...input,
    kind: 'franz-lola-presentation-frame',
    display: { ...input.display, height: 0 },
  });
  assert.equal(isPresentationFrame(forged), false);
});