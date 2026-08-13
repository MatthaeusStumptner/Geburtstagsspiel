import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPolicyForState } from '../src/render/render-policy.js';

test('assigns every game state an explicit render policy', () => {
  const continuous = { mode: 'continuous', maxFps: null };
  assert.deepEqual(renderPolicyForState('playing'), continuous);
  assert.deepEqual(renderPolicyForState('hit'), continuous);
  assert.deepEqual(renderPolicyForState('cutscene'), continuous);
  for (const state of ['ready', 'paused', 'won', 'over']) assert.deepEqual(renderPolicyForState(state), { mode: 'once' });
  assert.deepEqual(renderPolicyForState('menu', 'playing'), { mode: 'once' });
  assert.deepEqual(renderPolicyForState('map'), { mode: 'hidden' });
  assert.deepEqual(renderPolicyForState('playing', null, true), { mode: 'hidden' });
  assert.equal(Object.isFrozen(renderPolicyForState('playing')), true);
});

test('keeps settings opened from the map hidden', () => {
  assert.deepEqual(renderPolicyForState('menu', 'map'), { mode: 'hidden' });
});
