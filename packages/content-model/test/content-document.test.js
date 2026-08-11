import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_DOCUMENT_KIND, CONTENT_TYPES, contentPublicationPath, createContentDocument,
  parseContentDocument, validateContentDocument,
} from '../src/index.js';

const pixels = ['0000', '0110', '0110', '0000'];

const samples = {
  level: { id: 'domplatz', name: { standard: 'Domplatz', dialect: 'Domblotz' }, board: { columns: 9, rows: 9 }, actors: { cats: [] } },
  character: { id: 'postler', name: 'Postler', appearance: { width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels } },
  object: { id: 'briefkasten', name: 'Briefkasten', type: 'custom', width: 2, height: 2, appearance: { width: 4, height: 4, palette: ['transparent', '#f5c451'], pixels } },
  tileset: { id: 'innstadt', name: 'Innstadt', landmark: 'dog-park', palette: { water: '#0a5368' } },
  block: { id: 'ziegel', name: 'Ziegel', width: 3, height: 2, pattern: 'brick', color: '#553322' },
  animation: { id: 'winken', name: 'Winken', width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels, fps: 8, keyframes: [{ time: 0, pixels }] },
  cutscene: { id: 'servus', name: { standard: 'Servus', dialect: 'Hawedere' }, duration: 2, tracks: [] },
  event: { id: 'eisvogel', name: { standard: 'Eisvogel', dialect: 'Eisvogl' }, message: { standard: 'Gefunden!', dialect: 'Gfundn!' }, trigger: { type: 'time', seconds: 1 }, visual: { type: 'kingfisher' } },
};

test('creates and validates every independently publishable content type', () => {
  for (const type of CONTENT_TYPES) {
    const value = createContentDocument(type, samples[type], { dependencies: [{ type: 'object', id: 'briefkasten', relation: 'uses' }, { type: 'unknown', id: 'ignored' }] });
    assert.equal(value.kind, CONTENT_DOCUMENT_KIND);
    assert.equal(value.type, type);
    assert.equal(value.document.id, samples[type].id);
    assert.equal(value.dependencies.length, 1);
    assert.equal(validateContentDocument(value).ok, true, `${type}: ${validateContentDocument(value).errors.join('\n')}`);
    assert.deepEqual(parseContentDocument(JSON.stringify(value)), value);
  }
});

test('uses strict, type-specific static publication paths', () => {
  assert.equal(contentPublicationPath('level', 'domplatz'), 'content/levels/domplatz.level.json');
  assert.equal(contentPublicationPath('character', 'postler'), 'content/characters/postler.character.json');
  assert.equal(contentPublicationPath('cutscene', 'servus'), 'content/cutscenes/servus.cutscene.json');
  assert.equal(contentPublicationPath({ type: 'event', id: 'eisvogel' }), 'content/events/eisvogel.event.json');
  assert.throws(() => contentPublicationPath('object', '../package'), /kanonischer Slug/);
});

test('rejects malformed wrappers before normalization', () => {
  const value = createContentDocument('object', samples.object);
  assert.equal(validateContentDocument({ ...value, kind: 'something-else' }).ok, false);
  assert.equal(validateContentDocument({ ...value, id: '../escape' }).ok, false);
  assert.throws(() => parseContentDocument('{nope'), /gültiges JSON/);
});

test('does not leak level instance overrides into reusable object definitions', () => {
  const value = createContentDocument('object', {
    ...samples.object,
    assetOverrides: ['color', 'appearance'],
  });
  assert.equal('assetOverrides' in value.document, false);
});
