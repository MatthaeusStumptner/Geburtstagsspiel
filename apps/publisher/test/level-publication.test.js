import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_TYPES, createContentDocument, createLevelDocument } from '@franz-lola/pixel-renderer';
import { assertSafeObject, preparePublishedBatch, preparePublishedContent, preparePublishedLevel, publishLevelsFromBody, readPublishBody } from '../src/level-publication.js';

function level() {
  return createLevelDocument({
    kind: 'franz-lola-level', schemaVersion: 1, id: 'hals',
    board: { columns: 9, rows: 9, tileSize: 24, tunnelRows: [4], walls: [] },
    actors: { player: { x: 4, y: 6 }, cats: [] },
    collectibles: { powerUps: [{ x: 1, y: 1 }] },
  });
}

test('publication preserves protected map metadata, sprites, objects and level-bound cutscenes', () => {
  const input = level();
  input.actors.player.appearance = {
    width: 4, height: 4,
    palette: ['transparent', ...Array.from({ length: 11 }, (_, index) => `#${(index + 1).toString(16).padStart(6, '0')}`)],
    pixels: ['0ab0', '1ab1', '1ab1', '0ab0'],
    animations: [{ id: 'idle', duration: 1.5, loop: true, keyframes: [{ id: 'a', time: 0, pixels: ['0ab0', '1ab1', '1ab1', '0ab0'] }, { id: 'b', time: 0.75, pixels: ['0000', '1ab1', '1ab1', '0000'] }] }],
  };
  input.actors.characters = [{
    id: 'passauer-postler', characterId: 'postler', name: 'Passauer Postler',
    x: 2, y: 5, state: 'left', animation: '',
    appearance: { width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels: ['0110', '1111', '0110', '1001'] },
    behavior: { controller: 'stationary', speedMultiplier: 1 },
  }];
  input.decorations = [{
    id: 'note', assetId: 'music-note', name: 'Musiknote', type: 'custom', x: 2, y: 2, width: 2, height: 2,
    color: '#55d9dd', label: '♪', appearance: input.actors.player.appearance, spriteAnimation: 'idle',
    animation: { type: 'bob', speed: 1, amplitude: 0.1 },
  }, {
    id: 'copy', assetId: 'text-block', name: 'Text', type: 'text', x: 1, y: 5, width: 5, height: 2, color: '#f5e7bd', label: 'TEXT',
    content: { standard: 'Frei in Passau', dialect: 'Frei in Passau' }, textStyle: { fontSize: 0.5, align: 'center', background: '#071016', backgroundOpacity: 0, borderColor: '#55d9dd' },
    animation: { type: 'keyframes', duration: 2, loop: true, keyframes: [{ id: 'start', time: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, { id: 'end', time: 2, x: 0, y: -0.2, scale: 1, rotation: 0, opacity: 1 }] },
  }];
  input.cutscenes = [{
    id: 'intro', kind: 'intro', name: { standard: 'Ankunft', dialect: 'Oikemma' }, duration: 3, skippable: true,
    tracks: [
      { id: 'camera', type: 'camera', target: 'camera', keyframes: [{ id: 'start', time: 0, x: 1, y: 6, zoom: 1.35 }, { id: 'end', time: 3, x: 4, y: 6, zoom: 1.12 }] },
      { id: 'note', type: 'object', target: 'note', keyframes: [{ id: 'start', time: 0, x: 2, y: 2, visible: true }, { id: 'end', time: 3, x: 4, y: 2, visible: true }] },
    ],
  }];
  const result = preparePublishedLevel(input, {
    existing: { source: { catalog: 'Geburtstagsspiel', gameLayout: 0, markerClass: 'water', home: false, mapOrder: 1 } },
    nextMapOrder: 9,
  });
  assert.equal(result.value.source.mapOrder, 1);
  assert.equal(result.value.source.catalog, 'Geburtstagsspiel');
  assert.equal(result.value.actors.player.appearance.palette.length, 12);
  assert.equal(result.value.actors.characters[0].characterId, 'postler');
  assert.equal(result.value.actors.characters[0].appearance.pixels[1], '1111');
  assert.equal(result.value.decorations[0].appearance.palette.length, 12);
  assert.equal(result.value.actors.player.appearance.animations[0].keyframes.length, 2);
  assert.equal(result.value.decorations[1].content.standard, 'Frei in Passau');
  assert.equal(result.value.decorations[1].textStyle.backgroundOpacity, 0);
  assert.equal(result.value.decorations[1].animation.type, 'keyframes');
  assert.equal(result.value.cutscenes[0].tracks[1].target, 'note');
  assert.equal(result.value.cutscenes[0].tracks[1].keyframes[1].x, 4);
  assert.equal(result.path, 'src/data/levels/hals.level.json');
});

test('publication rejects prototype keys, oversized bodies and oversized boards', async () => {
  assert.throws(() => assertSafeObject(JSON.parse('{"__proto__":{"admin":true}}')), /Nicht erlaubter/);
  const request = new Request('https://publisher.test/api/publish', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '5000001' }, body: '{}',
  });
  await assert.rejects(readPublishBody(request), /größer als 5 MB/);
  const huge = level(); huge.board.columns = 65;
  assert.throws(() => preparePublishedLevel(huge, { nextMapOrder: 0 }), /64 × 64/);
});

test('batch publication accepts legacy and multi-level bodies and assigns stable map positions', () => {
  const first = level(); const second = level(); second.id = 'neuer-ort'; second.name.standard = 'Neuer Ort';
  assert.deepEqual(publishLevelsFromBody({ level: first }), [first]);
  assert.deepEqual(publishLevelsFromBody({ levels: [first, second] }), [first, second]);
  const existingByPath = new Map([['src/data/levels/hals.level.json', { source: { catalog: 'Geburtstagsspiel', gameLayout: 2, mapOrder: 2 } }]]);
  const batch = preparePublishedBatch([first, second], { existingByPath, nextMapOrder: 9 });
  assert.equal(batch[0].value.source.mapOrder, 2);
  assert.equal(batch[1].value.source.mapOrder, 9);
  assert.throws(() => preparePublishedBatch([first, first], { nextMapOrder: 9 }), /nur einmal/);
  assert.throws(() => publishLevelsFromBody({ levels: [] }), /mindestens/);
});

test('new levels cannot claim protected map presentation metadata', () => {
  const input = level();
  input.id = 'neuer-ort';
  input.source = { catalog: 'Angreifer', gameLayout: 99, markerClass: 'home admin', home: true, mapOrder: 0 };
  const result = preparePublishedLevel(input, { existing: null, nextMapOrder: 9 });
  assert.deepEqual(result.value.source, {
    catalog: 'Levelwerkstatt', gameLayout: 9, markerClass: '', home: false, mapOrder: 9,
  });
});

test('publishes every reusable content type to a strict static path', () => {
  const pixels = ['0000', '0110', '0110', '0000'];
  const samples = {
    character: { id: 'postler', name: 'Postler', appearance: { width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels } },
    object: { id: 'briefkasten', name: 'Briefkasten', type: 'custom', appearance: { width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels } },
    tileset: { id: 'innstadt', name: 'Innstadt' },
    block: { id: 'ziegel', name: 'Ziegel', width: 2, height: 1, pattern: 'brick' },
    animation: { id: 'winken', name: 'Winken', width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels, keyframes: [{ time: 0, pixels }] },
    cutscene: { id: 'servus', name: { standard: 'Servus', dialect: 'Hawedere' }, duration: 2, tracks: [] },
  };
  for (const type of CONTENT_TYPES.filter((entry) => entry !== 'level')) {
    const prepared = preparePublishedContent(createContentDocument(type, samples[type]));
    assert.match(prepared.path, new RegExp(`^src/data/library/.+/${samples[type].id}\\.${type}\\.json$`));
    assert.equal(prepared.value.type, type);
  }
  assert.throws(() => preparePublishedContent(createContentDocument('level', level())), /Level-Entwürfe/);
});
