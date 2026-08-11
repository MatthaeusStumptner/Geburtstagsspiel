import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapGeometry } from '../src/ui/map-geometry.js';

const levels = [
  { id: 'hals', lat: 48.592, lon: 13.459 },
  { id: 'home', lat: 48.583, lon: 13.477 },
  { id: 'bschuett', lat: 48.579, lon: 13.471 },
  { id: 'oberhaus', lat: 48.577, lon: 13.468 },
  { id: 'dom', lat: 48.574, lon: 13.466 },
  { id: 'dreifluesseeck', lat: 48.573, lon: 13.48 },
  { id: 'uni', lat: 48.568, lon: 13.456 },
  { id: 'zauberberg', lat: 48.57, lon: 13.452 },
  { id: 'tabakfabrik', lat: 48.568, lon: 13.474 },
];

test('map geometry keeps every authored location in one metric coordinate system', () => {
  const geometry = createMapGeometry(levels);
  assert.equal(geometry.viewBox, '0 0 700 700');
  assert.deepEqual(geometry.markers.map(({ id }) => id), levels.map(({ id }) => id));
  geometry.markers.forEach(({ x, y }) => {
    assert.ok(x >= 0 && x <= 700);
    assert.ok(y >= 0 && y <= 700);
  });
  assert.match(geometry.danube, /^M /);
  assert.match(geometry.routeNorth, /L/);
  assert.match(geometry.routeSouth, /L/);
});
