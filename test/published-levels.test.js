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

test('every Passau level ships a distinct intro, an authored event and movable localized text', async () => {
  const levels = await Promise.all((await readdir(directory)).filter((name) => name.endsWith('.level.json'))
    .map(async (filename) => JSON.parse(await readFile(resolve(directory, filename), 'utf8'))));
  const signatures = new Set();
  for (const level of levels) {
    const intro = level.cutscenes.find((cutscene) => cutscene.id === 'intro');
    assert.ok(intro, `${level.id} intro`);
    assert.ok(intro.tracks.some((track) => track.type === 'camera'), `${level.id} camera`);
    assert.ok(intro.tracks.some((track) => track.type === 'dialogue'), `${level.id} dialogue`);
    assert.ok(level.events.length > 0, `${level.id} authored event`);
    if (level.id !== 'zauberberg') assert.ok(level.events.some((event) => event.visual.assetId), `${level.id} authored event object`);
    const copy = level.decorations.find((item) => item.type === 'text');
    assert.ok(copy?.content.standard && copy?.content.dialect, `${level.id} localized movable text`);
    signatures.add(`${intro.duration}:${intro.tracks.length}:${intro.tracks.flatMap((track) => track.keyframes).length}`);
  }
  assert.equal(signatures.size, levels.length);
});

const formerBakedLabels = {
  home: ['HUNDEWIESE', 'FRANZ & LOLA'],
  hals: ['HUNDEWIESE'],
  oberhaus: ['HUNDEWIESE'],
  dom: ['HUNDEWIESE'],
  dreifluesseeck: ['HUNDEWIESE'],
  uni: ['HUNDEWIESE'],
  bschuett: ['BSCHÜTT · SKATE & SPIEL'],
  tabakfabrik: ['TABAKFABRIK'],
  zauberberg: ['ZAUBERBERG', 'ROCK · PUNK · METAL'],
};

test('former baked scenery labels are published only as editable transparent text blocks', async () => {
  const levels = await Promise.all((await readdir(directory)).filter((name) => name.endsWith('.level.json'))
    .map(async (filename) => JSON.parse(await readFile(resolve(directory, filename), 'utf8'))));
  for (const level of levels) {
    const texts = level.decorations.filter((item) => item.type === 'text');
    const copy = texts.map((item) => item.content.standard);
    for (const label of formerBakedLabels[level.id]) assert.ok(copy.includes(label), level.id + ': ' + label);
    assert.ok(texts.every((item) => item.locked === false));
    assert.ok(texts.every((item) => item.textStyle.backgroundOpacity === 0 && item.textStyle.borderOpacity === 0));
  }
});

test('Zauberberg publishes without baked, placed, event-backed or cutscene note objects', async () => {
  const level = JSON.parse(await readFile(resolve(directory, 'zauberberg.level.json'), 'utf8'));
  assert.deepEqual(level.theme.elements.map((item) => item.id), ['stage-lights']);
  assert.equal(level.decorations.filter((item) => item.assetId === 'zauberberg-note').length, 0);
  const encore = level.events.find((event) => event.id === 'zugabe');
  assert.equal(encore.visual.type, 'none');
  assert.equal(encore.visual.assetId, '');
  assert.equal(level.cutscenes[0].tracks.some((track) => track.target?.includes('note')), false);
});
