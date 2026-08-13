import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGoldenProject, renderGoldenFrame } from '../src/index.js';

test('game and studio adapters project the golden scene identically', async () => {
  const fixture = await loadGoldenProject('hals-smoke');
  const gameFrame = await renderGoldenFrame({ adapter: 'game', fixture, presentationTime: 2 });
  const studioFrame = await renderGoldenFrame({ adapter: 'studio', fixture, presentationTime: 2 });
  assert.deepEqual(studioFrame.camera, gameFrame.camera);
  assert.deepEqual(studioFrame.player, gameFrame.player);
  assert.deepEqual(studioFrame.cats, gameFrame.cats);
  assert.deepEqual(studioFrame.display, gameFrame.display);
});
