import assert from 'node:assert/strict';
import test from 'node:test';
import { fixturePresentationFrame } from '@franz-lola/render-testkit';
import { createPresentationFrame, isPresentationFrame, serializePresentationFrame } from '../src/index.js';

function freezeDeep(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeDeep(child, seen);
  return Object.freeze(value);
}

function forgedFrame(metadata) {
  const baseline = fixturePresentationFrame();
  return freezeDeep({
    ...baseline,
    player: { ...baseline.player, visual: { animation: { phase: metadata } } },
    renderer: { ...baseline.renderer, metadata: { probe: metadata } },
  });
}

test('forged deep-frozen frames reject every non-serializable nested metadata value', () => {
  const cyclic = {}; cyclic.self = cyclic; Object.freeze(cyclic);
  for (const [name, invalid] of [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['function', () => 1],
    ['bigint', 1n],
    ['undefined', undefined],
    ['symbol', Symbol('metadata')],
    ['Date', Object.freeze(new Date(0))],
    ['Map', Object.freeze(new Map([['x', 1]]))],
    ['cycle', cyclic],
  ]) {
    const frame = forgedFrame(invalid);
    assert.equal(isPresentationFrame(frame), false, `${name} must invalidate a forged PresentationFrame`);
    assert.throws(() => serializePresentationFrame(frame), /valid PresentationFrame/, `${name} must fail serialization closed`);
  }
});

test('serialization returns a mutable detached copy of valid nested renderer and entity metadata', () => {
  const frame = createPresentationFrame({
    ...fixturePresentationFrame(),
    player: { ...fixturePresentationFrame().player, visual: { animation: { phase: 0.25 } } },
    renderer: { ...fixturePresentationFrame().renderer, metadata: { timing: [1, 2, 3] } },
  });
  const copy = serializePresentationFrame(frame);
  copy.player.visual.animation.phase = 0.75;
  copy.renderer.metadata.timing.push(4);
  assert.equal(frame.player.visual.animation.phase, 0.25);
  assert.deepEqual(frame.renderer.metadata.timing, [1, 2, 3]);
});
