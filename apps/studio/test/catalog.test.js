import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevelDocument, validateLevelDocument } from '@franz-lola/pixel-renderer';
import { catalogDocument, catalogLevel, passauCatalog, searchCatalog } from '../src/catalog.js';
import { EditorState } from '../src/editor-state.js';
import { previewGuttis } from '../src/editor-tools.js';

const expected = [
  ['home', 2, 16, 'brahmahof-home'], ['hals', 0, 18, 'dog-park'], ['oberhaus', 3, 16, 'dog-park'],
  ['dom', 1, 19, 'dog-park'], ['dreifluesseeck', 4, 18, 'dog-park'], ['uni', 5, 18, 'dog-park'],
  ['bschuett', 6, 18, 'bschuett'], ['tabakfabrik', 7, 17, 'tabakfabrik'], ['zauberberg', 8, 16, 'zauberberg'],
];
const expectedEvents = {
  home: ['ilzvogel', 'hundewiese', 'post-fuer-franz'], hals: ['ilzvogel', 'ilzrauschen'], oberhaus: ['kirchenglockn', 'goldener-ausblick'], dom: ['kirchenglockn', 'orgelakkord'], dreifluesseeck: ['ilzvogel', 'dreiklang-der-fluesse'], uni: ['pruefungs-gutti'], bschuett: ['ilzvogel', 'hundewiese', 'lolas-stockerl'], tabakfabrik: ['dampfzeichen'], zauberberg: ['zugabe'],
};
const bakedLabels = {
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
const expectedStories = {
  home: ['post-fuer-franz', 'Aufbruch am Bramerhof', 4, 8], hals: ['ilzrauschen', 'Entlang der Ilz', 4, 10],
  oberhaus: ['goldener-ausblick', 'Hinauf zur Veste', 4, 12], dom: ['orgelakkord', 'Glocken über Passau', 4, 12],
  dreifluesseeck: ['dreiklang-der-fluesse', 'Drei Flüsse, eine Runde', 4, 15], uni: ['pruefungs-gutti', 'Kurze Vorlesung für Lola', 4, 10],
  bschuett: ['lolas-stockerl', 'Runde durch den Bschüttpark', 4, 10], tabakfabrik: ['dampfzeichen', 'Die Fabrik erwacht', 5, 13],
  zauberberg: ['zugabe', 'Soundcheck am Zauberberg', 5, 19],
};

test('catalog is pinned to the reviewed Geburtstagsspiel source snapshot', () => {
  const catalog = catalogDocument();
  assert.equal(catalog.kind, 'franz-lola-level-catalog');
  assert.match(catalog.sourceHash, /^[a-f0-9]{64}$/);
  assert.equal(catalog.generatedFrom, 'Pacman_clone_level_editor/src/data/passau-levels.json + src/story-content.js');
});

test('contains all nine original levels in map order with exact layout assignments', () => {
  assert.equal(passauCatalog.length, 9);
  assert.deepEqual(passauCatalog.map((level) => [level.id, level.source.gameLayout, level.board.walls.length, level.theme.landmark]), expected);
  assert.equal(new Set(passauCatalog.map((level) => level.id)).size, 9);
});

test('every original level validates and produces exact difficulty Gutti counts', () => {
  for (const level of passauCatalog) {
    const validation = validateLevelDocument(level);
    assert.equal(validation.ok, true, `${level.id}: ${validation.errors.join('; ')}`);
    assert.equal(previewGuttis(level, 'easy').size, 70, `${level.id} easy`);
    assert.equal(previewGuttis(level, 'normal').size, 110, `${level.id} normal`);
    assert.equal(previewGuttis(level, 'hard').size, 160, `${level.id} hard`);
    assert.equal(level.actors.player.behavior.controller, 'user');
    assert.equal(level.actors.cats.length, 3);
    assert.deepEqual(level.actors.cats.map((cat) => cat.behavior.strategy), ['chase', 'ambush', 'scatter-chase']);
    assert.equal(level.gameplay.difficulties.easy.lives, 5);
    assert.deepEqual(level.events.map((event) => event.id), expectedEvents[level.id], `${level.id} events`);
    level.events.forEach((event) => { assert.ok(event.message.standard); assert.ok(event.message.dialect); assert.ok(event.reward > 0); });
    assert.equal(level.cutscenes.length, 1, `${level.id} cutscene`);
    assert.equal(level.cutscenes[0].id, 'intro');
    assert.ok(level.cutscenes[0].tracks.some((track) => track.type === 'camera'));
    assert.ok(level.cutscenes[0].tracks.some((track) => track.type === 'dialogue'));
    assert.ok(level.decorations.some((item) => item.type === 'text'), `${level.id} movable text`);
    assert.ok(level.theme.edgeEffects.length >= 2, `${level.id} animated edge atmosphere`);
    assert.ok(level.theme.edgeEffects.every((effect) => effect.id && effect.type && effect.side), `${level.id} valid edge effects`);
    assert.equal(level.decorations.find((item) => item.type === 'text').textStyle.borderOpacity, 0, `${level.id} borderless text`);
    assert.ok(level.actors.cats[0]?.effects?.length >= 1, `${level.id} sample cat effect`);
    assert.deepEqual(level.collectibles.powerUps, [{ x: 1, y: 1 }, { x: 23, y: 1 }, { x: 1, y: 23 }, { x: 23, y: 23 }]);
  }
});

test('every level has a distinct authored cutscene and at least one new event', () => {
  const signatures = passauCatalog.map((level) => `${level.id}:${level.cutscenes[0].duration}:${level.cutscenes[0].tracks.length}:${level.cutscenes[0].tracks.flatMap((track) => track.keyframes).length}`);
  assert.equal(new Set(signatures.map((signature) => signature.split(':').slice(1).join(':'))).size, passauCatalog.length);
  passauCatalog.forEach((level) => {
    const [eventId, cutsceneName, tracks, keyframes] = expectedStories[level.id];
    const event = level.events.find((entry) => entry.id === eventId);
    const cutscene = level.cutscenes[0];
    assert.ok(event, `${level.id} authored event`);
    if (event.visual.type !== 'none') assert.ok(event.visual.assetId, `${level.id} level-specific reusable object event`);
    assert.ok(event.message.standard && event.message.dialect, `${level.id} localized event copy`);
    assert.equal(cutscene.name.standard, cutsceneName, `${level.id} adapted cutscene`);
    assert.equal(cutscene.tracks.length, tracks, `${level.id} track complexity`);
    assert.equal(cutscene.tracks.flatMap((track) => track.keyframes).length, keyframes, `${level.id} keyframe complexity`);
  });
});

test('loading and exporting an untouched original preserves every wall rectangle', () => {
  for (const source of passauCatalog) {
    const exported = new EditorState(source).toDocument();
    assert.deepEqual(exported.board.walls, source.board.walls, source.id);
    assert.deepEqual(exported.name, source.name, source.id);
    assert.deepEqual(exported.location, source.location, source.id);
    assert.deepEqual(exported.theme.palette, source.theme.palette, source.id);
    assert.deepEqual(exported.theme.elements?.map((item) => item.id) ?? [], source.theme.elements?.map((item) => item.id) ?? [], source.id);
    assert.deepEqual(exported.source, source.source, source.id);
    const imported = parseLevelDocument(JSON.stringify(exported));
    assert.equal(imported.ok, true, source.id);
    assert.deepEqual(imported.value.board.walls, source.board.walls, source.id);
  }
});

test('catalog lookup returns safe clones and search understands place, mission and dialect', () => {
  const home = catalogLevel('home');
  home.board.walls.length = 0;
  assert.equal(catalogLevel('home').board.walls.length, 16);
  assert.deepEqual(searchCatalog('tabak').map((level) => level.id), ['tabakfabrik']);
  assert.deepEqual(searchCatalog('Bschütt').map((level) => level.id), ['bschuett']);
  assert.ok(searchCatalog('gutti').length > 0);
});

test('replaces every former baked label with a movable transparent text block', () => {
  for (const level of passauCatalog) {
    const texts = level.decorations.filter((item) => item.type === 'text');
    const copy = texts.map((item) => item.content.standard);
    for (const label of bakedLabels[level.id]) assert.ok(copy.includes(label), level.id + ': ' + label);
    for (const text of texts) {
      assert.equal(text.locked, false, level.id + ': ' + text.id + ' movable');
      assert.equal(text.textStyle.backgroundOpacity, 0, level.id + ': ' + text.id + ' transparent');
      assert.equal(text.textStyle.borderOpacity, 0, level.id + ': ' + text.id + ' borderless');
    }
  }
});

test('ships Zauberberg without baked, placed or event-backed note objects', () => {
  const level = catalogLevel('zauberberg');
  assert.deepEqual(level.theme.elements.map((item) => item.id), ['stage-lights']);
  const notes = level.decorations.filter((item) => item.assetId === 'zauberberg-note');
  assert.equal(notes.length, 0);
  const encore = level.events.find((event) => event.id === 'zugabe');
  assert.equal(encore.visual.type, 'none');
  assert.equal('assetId' in encore.visual, false);
  assert.equal(level.cutscenes[0].tracks.some((track) => track.target?.includes('note')), false);
});
