import test from 'node:test';
import assert from 'node:assert/strict';
import { moveGridActor } from '../src/index.js';

const right = { name: 'right', x: 1, y: 0 };
const down = { name: 'down', x: 0, y: 1 };

test('never skips an intersection when one update spans several tiles', () => {
  const actor = { x: 1, y: 1, dir: right };
  const visited = [];
  moveGridActor(actor, 2.5, {
    decideAtCenter(current) {
      visited.push(`${current.x},${current.y}`);
      if (current.x === 2) current.dir = down;
    },
    wrap() {},
  });
  assert.deepEqual(visited.slice(0, 3), ['1,1', '2,1', '2,2']);
  assert.equal(actor.x, 2);
  assert.equal(actor.y, 2.5);
});
