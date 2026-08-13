import test from 'node:test';
import assert from 'node:assert/strict';
import { createContentDocument } from '@franz-lola/content-model';
import { readContentItem } from '../src/content-store.js';

const pixels = ['0000', '0110', '0110', '0000'];
function row(type, id, document) { return { content_type: type, id, display_name: document.name, description: document.description, document_json: JSON.stringify(document), revision: 3, status: 'draft', updated_by: 'redaktion', updated_at: '2026-08-13T12:00:00.000Z', published_revision: 2, published_commit_sha: 'live:release-1', publication_id: null, deleted_at: null }; }
function typedReadDatabase(expectedTable, expectedId, result) {
  return { batch() {}, prepare(sql) {
    assert.match(sql, new RegExp(`FROM\\s+${expectedTable}\\b`));
    assert.doesNotMatch(sql, /\bcontent_items\b/);
    const statement = { bind(...values) { assert.deepEqual(values, [expectedId]); return statement; }, async first() { return result; } };
    return statement;
  } };
}
test('character and object reads use their own physical D1 tables', async () => {
  const character = createContentDocument('character', { id: 'postler', name: 'Postler', appearance: { width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels } });
  const object = createContentDocument('object', { id: 'bank', name: 'Bank', type: 'custom', width: 2, height: 1, color: '#55d9dd' });
  const characterResult = await readContentItem(typedReadDatabase('characters', 'postler', row('character', 'postler', character)), 'character', 'postler');
  const objectResult = await readContentItem(typedReadDatabase('assets', 'bank', row('object', 'bank', object)), 'object', 'bank');
  assert.equal(characterResult.content.document.name, 'Postler');
  assert.equal(objectResult.content.document.name, 'Bank');
});
