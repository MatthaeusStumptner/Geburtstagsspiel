import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTIONS,
  DirectionalSwipeInput,
  createLevelDocument,
  queuePlayerDirection,
  sampleMotionAnimation,
  selectAppearanceFrame,
  stateAnimationId,
} from '../src/index.js';

const rows = (token) => Array.from({ length: 4 }, () => token.repeat(4));

test('normalizes and resolves idle plus four directional animation states', () => {
  const level = createLevelDocument({
    board: { columns: 9, rows: 9 },
    actors: { cats: [], player: { x: 4, y: 4, appearance: {
      width: 4, height: 4, palette: ['transparent', '#ffffff'], pixels: rows('0'),
      animations: ['idle', 'up', 'right', 'down', 'left'].map((id) => ({ id, fps: 6, frames: [{ pixels: rows('1') }] })),
      stateAnimations: { idle: 'idle', up: 'up', right: 'right', down: 'down', left: 'left' },
    } } },
  });
  const appearance = level.actors.player.appearance;
  assert.deepEqual(appearance.stateAnimations, { idle: 'idle', up: 'up', right: 'right', down: 'down', left: 'left' });
  assert.equal(stateAnimationId(appearance, 'left'), 'left');
  assert.deepEqual(selectAppearanceFrame(appearance, { state: 'up', elapsed: 0 }), rows('1'));
});

test('falls back from directional states to a legacy walk animation', () => {
  const appearance = { width: 4, height: 4, palette: ['transparent', '#ffffff'], pixels: rows('0'), animations: [{ id: 'walk', fps: 6, loop: true, frames: [{ pixels: rows('1') }] }] };
  assert.equal(stateAnimationId(appearance, 'right'), 'walk');
  assert.deepEqual(selectAppearanceFrame(appearance, { state: 'right' }), rows('1'));
});

test('swipe input reacts during movement, rejects diagonal noise and supports corners', () => {
  const input = new DirectionalSwipeInput({ activationDistance: 4, dominanceRatio: 1.08 });
  input.begin({ x: 10, y: 10, pointerId: 7 });
  assert.equal(input.update({ x: 13, y: 12, pointerId: 7 }), null);
  assert.equal(input.update({ x: 16, y: 11, pointerId: 7 }), 'right');
  assert.equal(input.update({ x: 22, y: 11, pointerId: 7 }), null);
  assert.equal(input.update({ x: 22, y: 17, pointerId: 7 }), 'down');
  assert.equal(input.end({ x: 22, y: 17, pointerId: 7 }), null);
});

test('queued navigation reverses immediately but buffers perpendicular turns without teleporting', () => {
  const actor = { x: 4.37, y: 4, dir: DIRECTIONS.right, nextDir: DIRECTIONS.right };
  assert.equal(queuePlayerDirection(actor, DIRECTIONS.left), true);
  assert.equal(actor.dir, DIRECTIONS.left);
  assert.equal(actor.x, 4.37);
  assert.equal(queuePlayerDirection(actor, DIRECTIONS.up), false);
  assert.equal(actor.dir, DIRECTIONS.left);
  assert.equal(actor.nextDir, DIRECTIONS.up);
  assert.equal(actor.x, 4.37);
});

test('Zauberberg keeps stage lights as system scenery while legacy note metadata remains readable', () => {
  const clean = createLevelDocument({ theme: { landmark: 'zauberberg', elements: [] }, actors: { cats: [] } });
  assert.deepEqual(clean.theme.elements.map((element) => element.id), ['stage-lights']);
  const legacy = createLevelDocument({ theme: { landmark: 'zauberberg', elements: [{ id: 'stage-note', animation: { type: 'spin', speed: 2.5, amplitude: 0.4 } }] }, actors: { cats: [] } });
  const note = legacy.theme.elements.find((element) => element.id === 'stage-note');
  assert.deepEqual({ type: note.animation.type, speed: note.animation.speed, amplitude: note.animation.amplitude }, { type: 'spin', speed: 2.5, amplitude: 0.4 });
});

test('samples authored motion keyframes with playback duration, looping and easing', () => {
  const level = createLevelDocument({ actors: { cats: [] }, decorations: [{
    id: 'animated', type: 'custom', x: 1, y: 1, width: 1, height: 1, color: '#ffffff',
    animation: { type: 'keyframes', duration: 2, loop: true, keyframes: [
      { id: 'a', time: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      { id: 'b', time: 2, x: 2, y: -1, scale: 2, rotation: 90, opacity: 0.5 },
    ] },
  }] });
  const animation = level.decorations[0].animation;
  assert.deepEqual(sampleMotionAnimation(animation, 1), { x: 1, y: -0.5, scale: 1.5, rotation: 45, opacity: 0.75 });
  assert.deepEqual(sampleMotionAnimation(animation, 2), sampleMotionAnimation(animation, 0));
});

test('selects sprite keyframes by authored time instead of display refresh rate', () => {
  const appearance = createLevelDocument({ actors: { cats: [], player: { appearance: {
    width: 4, height: 4, palette: ['transparent', '#ffffff'], pixels: rows('0'),
    animations: [{ id: 'idle', duration: 2, loop: true, keyframes: [
      { id: 'dark', time: 0, pixels: rows('0') }, { id: 'light', time: 1.25, pixels: rows('1') },
    ] }], stateAnimations: { idle: 'idle' },
  } } } }).actors.player.appearance;
  assert.deepEqual(selectAppearanceFrame(appearance, { elapsed: 1.24 }), rows('0'));
  assert.deepEqual(selectAppearanceFrame(appearance, { elapsed: 1.25 }), rows('1'));
  assert.deepEqual(selectAppearanceFrame(appearance, { elapsed: 2.01 }), rows('0'));
});
