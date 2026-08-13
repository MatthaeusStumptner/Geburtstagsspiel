import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelDocument } from '@franz-lola/content-model';
import { embeddedContentBackfillPlan } from '../src/embedded-content-store.js';

test('backfill plans missing records from every cloud level without overwriting existing content', () => {
  const level = createLevelDocument({
    id: 'home', board: { columns: 9, rows: 9, walls: [{ x: 2, y: 2, width: 1, height: 1 }] },
    actors: { cats: [] }, collectibles: { powerUps: [] },
    cutscenes: [{ id: 'intro', duration: 1, tracks: [] }],
    events: [{ id: 'brief', message: { standard: 'Servus', dialect: 'Servus' }, trigger: { type: 'time', seconds: 1 } }],
  });
  const all = embeddedContentBackfillPlan([{ level }]);
  const existing = all.find((item) => item.type === 'tileset');
  const missing = embeddedContentBackfillPlan([{ level }], [{ type: existing.type, id: existing.id }]);
  assert.equal(missing.some((item) => item.type === 'tileset'), false);
  assert.ok(missing.some((item) => item.type === 'character'));
  assert.ok(missing.some((item) => item.type === 'block'));
  assert.ok(missing.some((item) => item.type === 'cutscene'));
  assert.ok(missing.some((item) => item.type === 'event'));
});
