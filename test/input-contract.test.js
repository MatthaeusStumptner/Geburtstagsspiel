import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTIONS,
  DirectionalSwipeInput,
  queuePlayerDirection,
} from '@franz-lola/pixel-renderer';

test('game input reacts while a swipe is held and supports a corner in one gesture', () => {
  const input = new DirectionalSwipeInput({ activationDistance: 4, dominanceRatio: 1.08 });
  input.begin({ x: 100, y: 100, pointerId: 7 });

  assert.equal(input.update({ x: 112, y: 100, pointerId: 7 }), 'right');
  assert.equal(input.update({ x: 112, y: 88, pointerId: 7 }), 'up');
  assert.equal(input.end({ x: 112, y: 88, pointerId: 7 }), null);
});

test('game direction contract reverses immediately without moving the player', () => {
  const player = {
    x: 11.375,
    y: 20,
    dir: DIRECTIONS.left,
    nextDir: DIRECTIONS.left,
  };

  assert.equal(queuePlayerDirection(player, DIRECTIONS.right), true);
  assert.equal(player.dir, DIRECTIONS.right);
  assert.equal(player.nextDir, DIRECTIONS.right);
  assert.deepEqual({ x: player.x, y: player.y }, { x: 11.375, y: 20 });

  assert.equal(queuePlayerDirection(player, DIRECTIONS.up), false);
  assert.equal(player.dir, DIRECTIONS.right);
  assert.equal(player.nextDir, DIRECTIONS.up);
  assert.deepEqual({ x: player.x, y: player.y }, { x: 11.375, y: 20 });
});
