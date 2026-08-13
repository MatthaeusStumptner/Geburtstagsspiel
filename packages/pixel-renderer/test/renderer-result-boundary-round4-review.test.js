import assert from 'node:assert/strict';
import test from 'node:test';
import * as rendererModule from '../src/index.js';

function fakeCanvas() {
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; },
  });
  const surface = () => ({ width: 0, height: 0, getContext: () => context });
  return { width: 320, height: 240, getContext: () => context, ownerDocument: { createElement: surface } };
}

function backend() {
  return {
    kind: 'canvas2d', resize() {}, present() {}, destroy() {},
    snapshot: () => ({
      requestedBackend: 'canvas2d', backend: 'canvas2d', fallbackReason: null,
      frameCount: 1, gpuAccelerated: false, contextLost: false,
      resourceMetrics: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor' },
      backingStoreResizes: 1,
    }),
  };
}

function snapshot(catX) {
  return {
    level: { id: 'boundary-level', board: { columns: 9, rows: 9, walls: [] }, actors: { cats: [] }, theme: { edgeEffects: [] } },
    player: { id: 'player', x: 2, y: 3 },
    cats: [{ id: 'cat-1', x: catX, y: 3, color: '#ff00ff', respawnTimer: 0 }],
    characters: [{ id: 'friend-1', x: 4, y: 4, color: '#00ffff' }],
    elapsed: 1,
  };
}

test('strict PresentationFrame APIs reject the public 12-key renderer compatibility result', () => {
  const renderer = new rendererModule.PassauPixelRenderer(fakeCanvas(), { presentationBackend: backend() });
  renderer.resize({ width: 320, height: 240, devicePixelRatio: 1, reason: 'test' });
  const first = renderer.render(snapshot(5), { presentationTime: 1 });
  const second = renderer.render(snapshot(6), { presentationTime: 2 });

  for (const result of [first, second]) {
    assert.strictEqual(result.playerScreen, result.player.screen);
    assert.strictEqual(result.entities, result.cats);
    assert.strictEqual(result.characterEntities, result.characters);
    assert.equal(rendererModule.isPresentationFrame(result), false);
    assert.throws(() => rendererModule.serializePresentationFrame(result), /valid PresentationFrame/);
  }
  assert.notStrictEqual(second.entities, first.entities);
  assert.notDeepEqual(second.entities, first.entities);
});

test('explicit render-result API validates aliases and returns a strict current PresentationFrame', () => {
  assert.equal(typeof rendererModule.presentationFrameFromRenderResult, 'function');
  const renderer = new rendererModule.PassauPixelRenderer(fakeCanvas(), { presentationBackend: backend() });
  renderer.resize({ width: 320, height: 240, devicePixelRatio: 1, reason: 'test' });
  const result = renderer.render(snapshot(6), { presentationTime: 2 });
  const frame = rendererModule.presentationFrameFromRenderResult(result);

  assert.equal(rendererModule.isPresentationFrame(frame), true);
  assert.deepEqual(Object.keys(frame), ['kind', 'frameId', 'presentationTime', 'camera', 'player', 'cats', 'characters', 'display', 'renderer']);
  assert.strictEqual(frame.player.screen, result.playerScreen);
  assert.strictEqual(frame.cats, result.entities);
  assert.strictEqual(frame.characters, result.characterEntities);
  assert.deepEqual(Object.keys(rendererModule.serializePresentationFrame(frame)), Object.keys(frame));

  assert.throws(() => rendererModule.presentationFrameFromRenderResult(frame), /render result/i);
  assert.throws(() => rendererModule.presentationFrameFromRenderResult(Object.freeze({ ...result, entities: [] })), /render result/i);
  assert.throws(() => rendererModule.presentationFrameFromRenderResult(Object.freeze({ ...result, extra: true })), /render result/i);
});
