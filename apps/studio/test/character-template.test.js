import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelDocument, selectAppearanceFrame, stateAnimationId } from '@franz-lola/pixel-renderer';
import { PLAYER_STATES, createFranzLolaAppearance } from '../src/character-template.js';

function centerOf(pixels, tokens) {
  const points = [];
  pixels.forEach((row, y) => [...row].forEach((token, x) => {
    if (tokens.includes(token)) points.push({ x, y });
  }));
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

test('Franz and Lola template ships editable original-style frames for every state', () => {
  const appearance = createFranzLolaAppearance();
  assert.deepEqual(Object.keys(appearance.stateAnimations), PLAYER_STATES);
  assert.equal(appearance.animations.length, 5);
  PLAYER_STATES.forEach((state) => {
    assert.equal(stateAnimationId(appearance, state), state);
    assert.equal(appearance.animations.find((animation) => animation.id === state).frames.length, 2);
    assert.equal(selectAppearanceFrame(appearance, { state, elapsed: 0 }).length, 24);
  });
});

test('directional poses retain the original Franz and Lola composition', () => {
  const appearance = createFranzLolaAppearance();
  const centers = Object.fromEntries(['up', 'right', 'down', 'left'].map((state) => {
    const pixels = selectAppearanceFrame(appearance, { state, elapsed: 0 });
    return [state, { franz: centerOf(pixels, ['3']), lola: centerOf(pixels, ['9', 'a', 'b']) }];
  }));

  assert.ok(centers.left.lola.x > centers.left.franz.x && centers.left.lola.y < centers.left.franz.y);
  assert.ok(centers.up.lola.x > centers.up.franz.x && centers.up.lola.y > centers.up.franz.y);
  assert.ok(centers.right.lola.x < centers.right.franz.x && centers.right.lola.y > centers.right.franz.y);
  assert.ok(centers.down.lola.x < centers.down.franz.x && centers.down.lola.y < centers.down.franz.y);
});

test('template survives the public intermediate level format', () => {
  const level = createLevelDocument({ board: { columns: 9, rows: 9 }, actors: { cats: [], player: { x: 4, y: 4, appearance: createFranzLolaAppearance() } } });
  assert.equal(level.actors.player.appearance.stateAnimations.left, 'left');
  assert.equal(level.actors.player.appearance.animations.find((animation) => animation.id === 'up').fps, 8);
  assert.equal(level.actors.player.appearance.width, 24);
});
