import test from 'node:test';
import assert from 'node:assert/strict';
import { snapCameraToTexels } from '@franz-lola/pixel-renderer';


test('game renderer dependency exposes stable camera sampling', () => {
  assert.equal(typeof snapCameraToTexels, 'function');
});