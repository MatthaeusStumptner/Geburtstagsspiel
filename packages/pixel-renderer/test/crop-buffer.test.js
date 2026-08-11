import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStableCropSize } from '../src/gpu/crop-buffer.js';

test('quantizes camera crops and never shrinks during animated zoom', () => {
  let size = { width: 300, height: 150 };
  let reallocations = 0;
  for (const sourceWidth of [421, 445, 439, 410, 462, 455]) {
    const next = resolveStableCropSize({
      sceneWidth: 600,
      sceneHeight: 600,
      sourceWidth,
      sourceHeight: sourceWidth * 0.62,
      currentWidth: size.width,
      currentHeight: size.height,
    });
    if (next.width !== size.width || next.height !== size.height) reallocations += 1;
    assert.ok(next.width >= size.width);
    assert.ok(next.height >= size.height);
    size = next;
  }
  assert.deepEqual(size, { width: 480, height: 320 });
  assert.equal(reallocations, 2);
});

test('never grows beyond the authored world', () => {
  assert.deepEqual(resolveStableCropSize({
    sceneWidth: 600, sceneHeight: 480, sourceWidth: 800, sourceHeight: 700, currentWidth: 640, currentHeight: 512,
  }), { width: 600, height: 480 });
});
