import test from 'node:test';
import assert from 'node:assert/strict';
import { insertSpriteKeyframe, keyframeAtTime, prepareAppearanceForEditing, prepareMotionForEditing } from '../src/animation-tools.js';

const pixels = (token) => Array.from({ length: 4 }, () => token.repeat(4));

test('upgrades legacy FPS frames to editable timed keyframes', () => {
  const appearance = prepareAppearanceForEditing({ width: 4, height: 4, palette: ['transparent', '#ffffff'], pixels: pixels('0'), animations: [{ id: 'walk', fps: 4, frames: [{ pixels: pixels('0') }, { pixels: pixels('1') }] }] });
  const animation = appearance.animations[0];
  assert.deepEqual(animation.keyframes.map((frame) => frame.time), [0, 0.25]);
  assert.equal(keyframeAtTime(animation, 0.24).pixels[0], '0000');
  assert.equal(keyframeAtTime(animation, 0.25).pixels[0], '1111');
});

test('inserts sprite keyframes at the playhead and sorts the timeline', () => {
  const animation = { duration: 2, loop: true, keyframes: [{ id: 'keyframe-1', time: 1, pixels: pixels('0') }] };
  const inserted = insertSpriteKeyframe(animation, pixels('1'), 0.4);
  assert.equal(inserted.time, 0.4);
  assert.deepEqual(animation.keyframes.map((frame) => frame.time), [0.4, 1]);
});

test('creates a reusable transform-keyframe motion when opening legacy movement', () => {
  const motion = prepareMotionForEditing({ type: 'bob', speed: 1, amplitude: 0.2 });
  assert.equal(motion.type, 'keyframes');
  assert.equal(motion.keyframes.length, 3);
  assert.equal(motion.keyframes[1].y, -0.25);
});
