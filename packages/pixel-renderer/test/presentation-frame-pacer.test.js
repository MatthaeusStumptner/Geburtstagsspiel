import test from 'node:test';
import assert from 'node:assert/strict';
import { PresentationFramePacer, recommendedPresentationRate } from '../src/index.js';

function presentationCount(displayRate, seconds = 1) {
  const pacer = new PresentationFramePacer({ framesPerSecond: 60 });
  let count = 0;
  const frames = Math.round(displayRate * seconds);
  for (let frame = 0; frame <= frames; frame += 1) {
    if (pacer.shouldPresent(frame * 1000 / displayRate)) count += 1;
  }
  return count;
}

test('caps presentation consistently on 60, 120 and 175 Hz displays', () => {
  assert.equal(presentationCount(60), 61);
  assert.equal(presentationCount(120), 61);
  assert.equal(presentationCount(175), 61);
});

test('keeps a long-running presentation cadence without refresh-rate drift', () => {
  assert.equal(presentationCount(175, 10), 601);
});

test('resets after suspended tabs and recommends a stable fallback rate', () => {
  const pacer = new PresentationFramePacer({ framesPerSecond: 60 });
  assert.equal(pacer.shouldPresent(0), true);
  assert.equal(pacer.shouldPresent(2), false);
  pacer.reset();
  assert.equal(pacer.shouldPresent(2000), true);
  assert.equal(recommendedPresentationRate('performance'), 30);
  assert.equal(recommendedPresentationRate('balanced'), 60);
  assert.equal(recommendedPresentationRate('quality'), 60);
});
