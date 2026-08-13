import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeAppearance, resizePixelRows } from '../src/sprite-appearance.js';

test('upscales a sprite to a real 24 by 24 pixel document with nearest-neighbour detail', () => {
  const rows = ['10', '01'];
  const resized = resizePixelRows(rows, 2, 2, 24, 24);
  assert.equal(resized.length, 24);
  assert.ok(resized.every((row) => row.length === 24));
  assert.equal(resized[0], `${'1'.repeat(12)}${'0'.repeat(12)}`);
  assert.equal(resized[23], `${'0'.repeat(12)}${'1'.repeat(12)}`);
});

test('resizes the basis image plus every animation frame and keyframe together', () => {
  const appearance = {
    width: 8, height: 8, palette: ['transparent', '#ffffff'], pixels: Array.from({ length: 8 }, () => '1'.repeat(8)),
    animations: [{ id: 'idle', frames: [{ pixels: Array.from({ length: 8 }, () => '0'.repeat(8)) }], keyframes: [{ id: 'a', time: 0, pixels: Array.from({ length: 8 }, () => '1'.repeat(8)) }] }],
  };
  const resized = resizeAppearance(appearance, 24);
  assert.equal(resized.width, 24);
  assert.equal(resized.pixels.length, 24);
  assert.equal(resized.animations[0].frames[0].pixels[0].length, 24);
  assert.equal(resized.animations[0].keyframes[0].pixels.length, 24);
  assert.equal(appearance.width, 8);
});
