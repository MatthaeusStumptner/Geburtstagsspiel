import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAppearanceFrame } from '../src/index.js';
import { zauberbergSpotlightPolygons } from '../src/painters/environment.js';

test('selects looping sprite animation frames deterministically', () => {
  const appearance = { pixels: ['0'], animations: [{ id: 'walk', fps: 2, loop: true, frames: [{ pixels: ['1'] }, { pixels: ['2'] }] }] };
  assert.deepEqual(selectAppearanceFrame(appearance, { animationId: 'walk', elapsed: 0 }), ['1']);
  assert.deepEqual(selectAppearanceFrame(appearance, { animationId: 'walk', elapsed: 0.6 }), ['2']);
  assert.deepEqual(selectAppearanceFrame(appearance, { animationId: 'walk', elapsed: 1.1 }), ['1']);
});

test('Zauberberg restores both original stage spotlights', () => {
  const lights = zauberbergSpotlightPolygons(100, 50, 200, 120);
  assert.deepEqual(lights, [
    { color: '#ff4f87', points: [[135, 70], [174, 248], [212, 248]] },
    { color: '#55d9dd', points: [[265, 70], [188, 248], [230, 248]] },
  ]);
});
