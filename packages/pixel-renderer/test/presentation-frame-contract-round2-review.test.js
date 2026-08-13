import assert from 'node:assert/strict';
import test from 'node:test';
import { fixturePresentationFrame } from '@franz-lola/render-testkit';
import { createPresentationFrame, isPresentationFrame, serializePresentationFrame } from '../src/index.js';

function arrayWithNonCanonicalKey(values) {
  const result = [...values];
  Object.defineProperty(result, '00', { value: values[0], enumerable: true });
  return result;
}

function validCat(baseline) {
  return {
    ...baseline.player,
    id: 'review-cat',
    onScreen: true,
    distance: 1,
    color: '#ff00ff',
    respawnTimer: 0,
  };
}

function frameWithAccessorArray() {
  const baseline = fixturePresentationFrame();
  let reads = 0;
  const cats = [];
  Object.defineProperty(cats, '0', {
    enumerable: true,
    get() {
      reads += 1;
      return validCat(baseline);
    },
  });
  Object.freeze(cats);
  return {
    frame: Object.freeze({ ...baseline, cats }),
    reads: () => reads,
  };
}

test('PresentationFrame arrays accept only canonical own data indices', () => {
  const baseline = fixturePresentationFrame();
  const cats = [validCat(baseline)];
  assert.throws(
    () => createPresentationFrame({ ...baseline, cats: arrayWithNonCanonicalKey(cats) }),
    /serializable|Array|index|Eigenschaften/i,
  );

  const forged = Object.freeze({
    ...baseline,
    cats: Object.freeze(arrayWithNonCanonicalKey(cats)),
  });
  assert.equal(isPresentationFrame(forged), false);
  assert.throws(() => serializePresentationFrame(forged), /valid PresentationFrame/);
});
test('PresentationFrame validation rejects array accessors without executing them', () => {
  const baseline = fixturePresentationFrame();
  const input = frameWithAccessorArray();
  assert.throws(() => createPresentationFrame({ ...baseline, cats: input.frame.cats }), /serializable|data|accessor|Eigenschaften/i);
  assert.equal(input.reads(), 0, 'create must not execute an untrusted array accessor');

  const validation = frameWithAccessorArray();
  assert.equal(isPresentationFrame(validation.frame), false);
  assert.equal(validation.reads(), 0, 'isPresentationFrame must not execute an untrusted array accessor');

  const serialization = frameWithAccessorArray();
  assert.throws(() => serializePresentationFrame(serialization.frame), /valid PresentationFrame/);
  assert.equal(serialization.reads(), 0, 'serializePresentationFrame must not execute an untrusted array accessor');
});

test('fixed PresentationFrame root contract rejects extras instead of silently dropping them', () => {
  const baseline = fixturePresentationFrame();
  assert.throws(
    () => createPresentationFrame({ ...baseline, reviewMetadata: { verdict: 'pass' } }),
    /unknown|root|Eigenschaften/i,
  );

  const forged = Object.freeze({ ...baseline, reviewMetadata: Object.freeze({ verdict: 'pass' }) });
  assert.equal(isPresentationFrame(forged), false);
  assert.throws(() => serializePresentationFrame(forged), /valid PresentationFrame/);
});
