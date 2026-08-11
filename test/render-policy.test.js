import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPolicyForState } from '../src/render/render-policy.js';

test('assigns every game state an explicit render policy', () => {
  assert.equal(renderPolicyForState('playing'), 'continuous');
  assert.equal(renderPolicyForState('hit'), 'continuous');
  assert.equal(renderPolicyForState('cutscene'), 'continuous');
  for (const state of ['ready', 'paused', 'won', 'over']) assert.equal(renderPolicyForState(state), 'once');
  assert.equal(renderPolicyForState('menu', 'playing'), 'once');
  assert.equal(renderPolicyForState('map'), 'hidden');
  assert.equal(renderPolicyForState('playing', null, true), 'hidden');
});

test('keeps settings opened from the map hidden', () => {
  assert.equal(renderPolicyForState('menu', 'map'), 'hidden');
});
