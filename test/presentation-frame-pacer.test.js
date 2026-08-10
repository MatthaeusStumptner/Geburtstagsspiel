import test from 'node:test';
import assert from 'node:assert/strict';
import { PresentationFramePacer, recommendedPresentationRate } from '@franz-lola/pixel-renderer';

function renderCount(displayRate, seconds = 2) {
  const pacer = new PresentationFramePacer({ framesPerSecond: 60 });
  let count = 0;
  for (let frame = 0; frame <= displayRate * seconds; frame += 1) {
    if (pacer.shouldPresent(frame * 1000 / displayRate)) count += 1;
  }
  return count;
}

test('game presentation stays at 60 FPS on common and high-refresh displays', () => {
  assert.equal(renderCount(60), 121);
  assert.equal(renderCount(120), 121);
  assert.equal(renderCount(175), 121);
});

test('game uses 30 FPS only for the constrained renderer profile', () => {
  assert.equal(recommendedPresentationRate('performance'), 30);
  assert.equal(recommendedPresentationRate('balanced'), 60);
  assert.equal(recommendedPresentationRate('quality'), 60);
});
