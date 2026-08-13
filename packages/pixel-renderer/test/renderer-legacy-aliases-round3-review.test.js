import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PassauPixelRenderer,
  isPresentationFrame,
  presentationFrameFromRenderResult,
  serializePresentationFrame,
} from '../src/index.js';

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
  return {
    width: 320, height: 240, getContext: () => context,
    ownerDocument: { createElement: surface },
  };
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
    level: { id: 'alias-level', board: { columns: 9, rows: 9, walls: [] }, actors: { cats: [] }, theme: { edgeEffects: [] } },
    player: { id: 'player', x: 2, y: 3 },
    cats: [{ id: 'cat-1', x: catX, y: 3, color: '#ff00ff', respawnTimer: 0 }],
    characters: [{ id: 'friend-1', x: 4, y: 4, color: '#00ffff' }],
    elapsed: 1,
  };
}

test('real renderer return keeps migration aliases current behind an explicit strict-frame boundary', () => {
  const renderer = new PassauPixelRenderer(fakeCanvas(), { presentationBackend: backend() });
  renderer.resize({ width: 320, height: 240, devicePixelRatio: 1, reason: 'test' });
  const first = renderer.render(snapshot(5), { presentationTime: 1 });
  const second = renderer.render(snapshot(6), { presentationTime: 2 });

  for (const result of [first, second]) {
    assert.strictEqual(result.playerScreen, result.player.screen);
    assert.strictEqual(result.entities, result.cats);
    assert.strictEqual(result.characterEntities, result.characters);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(isPresentationFrame(result), false);
    assert.throws(() => serializePresentationFrame(result), /valid PresentationFrame/);
    const frame = presentationFrameFromRenderResult(result);
    const serialized = serializePresentationFrame(frame);
    assert.deepEqual(Object.keys(serialized), [
      'kind', 'frameId', 'presentationTime', 'camera', 'player', 'cats', 'characters', 'display', 'renderer',
    ]);
    assert.equal(Object.hasOwn(serialized, 'playerScreen'), false);
    assert.equal(Object.hasOwn(serialized, 'entities'), false);
    assert.equal(Object.hasOwn(serialized, 'characterEntities'), false);
  }
  assert.notStrictEqual(second.entities, first.entities, 'aliases must not retain a stale prior-frame array');
  assert.notDeepEqual(second.entities, first.entities, 'aliases must reflect the current projected data');

  const stale = Object.freeze({ ...second, entities: first.cats });
  assert.equal(isPresentationFrame(stale), false);
  assert.throws(() => presentationFrameFromRenderResult(stale), /render result/i);
  assert.equal(isPresentationFrame(Object.freeze({ ...second, unexpected: true })), false);
});
