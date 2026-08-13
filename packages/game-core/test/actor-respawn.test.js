import test from 'node:test';
import assert from 'node:assert/strict';
import { respawnCat } from '../src/actor-respawn.js';

test('cat respawn resets both simulation and interpolation positions', () => {
  const cat = {
    x: 18.75,
    y: 11.25,
    previousX: 18.7,
    previousY: 11.2,
    respawnTimer: 0,
    lastDecision: '18,11',
  };

  const result = respawnCat(cat, { x: 4, y: 6 });

  assert.equal(result, cat);
  assert.deepEqual(cat, {
    x: 4,
    y: 6,
    previousX: 4,
    previousY: 6,
    respawnTimer: 1.6,
    lastDecision: '',
  });
});

test('cat respawn accepts the authored delay', () => {
  const cat = { x: 2, y: 2, previousX: 2, previousY: 2, respawnTimer: 0, lastDecision: 'x' };
  respawnCat(cat, { x: 9, y: 3 }, 2.25);
  assert.equal(cat.respawnTimer, 2.25);
});
