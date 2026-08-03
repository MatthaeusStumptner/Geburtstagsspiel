import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateLevelDocument } from '@franz-lola/pixel-renderer';

const directory = resolve('src/data/levels');

test('all published levels are valid, ordered and lossless for editable palettes', async () => {
  const filenames = (await readdir(directory)).filter((name) => name.endsWith('.level.json')).sort();
  assert.equal(filenames.length, 9);
  const ids = new Set();
  const orders = new Set();
  for (const filename of filenames) {
    const raw = JSON.parse(await readFile(resolve(directory, filename), 'utf8'));
    const result = validateLevelDocument(raw);
    assert.equal(result.ok, true, `${filename}: ${result.errors.join(' ')}`);
    assert.equal(filename, `${raw.id}.level.json`);
    assert.equal(ids.has(raw.id), false, `Doppelte ID ${raw.id}`);
    assert.equal(orders.has(raw.source.mapOrder), false, `Doppelte Kartenposition ${raw.source.mapOrder}`);
    ids.add(raw.id);
    orders.add(raw.source.mapOrder);
    const normalizedActors = [result.value.actors.player, ...result.value.actors.cats];
    [raw.actors.player, ...raw.actors.cats].forEach((actor, index) => {
      if (actor.appearance) assert.equal(normalizedActors[index].appearance.palette.length, actor.appearance.palette.length);
    });
  }
  assert.deepEqual([...orders].sort((a, b) => a - b), Array.from({ length: filenames.length }, (_, index) => index));
});

test('original Passau events live in the published level files', async () => {
  const levels = await Promise.all((await readdir(directory)).filter((name) => name.endsWith('.level.json'))
    .map(async (filename) => JSON.parse(await readFile(resolve(directory, filename), 'utf8'))));
  const events = levels.flatMap((level) => level.events.map((event) => ({ level: level.id, ...event })));
  assert.ok(events.some((event) => event.id === 'ilzvogel' && event.trigger.type === 'zone'));
  assert.ok(events.some((event) => event.id === 'hundewiese' && event.message.dialect.includes('Lieblingsplatzerl')));
  assert.ok(events.some((event) => event.id === 'kirchenglockn' && event.trigger.type === 'direction-sequence'));
});
