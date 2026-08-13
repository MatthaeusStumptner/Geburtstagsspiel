import test from 'node:test';
import assert from 'node:assert/strict';
import { createContentDocument } from '@franz-lola/content-model';
import { saveContentItem } from '../src/content-store.js';

const pixels = ['0000', '0110', '0110', '0000'];

function typedWriteDatabase(expectedTable, type) {
  let stored = null;
  const sqlLog = [];
  const marker = (sql) => /\/\*\s*([^*]+?)\s*\*\//.exec(sql)?.[1] ?? '';
  return {
    sqlLog,
    prepare(sql) {
      sqlLog.push(sql);
      const statement = {
        sql, values: [],
        bind(...values) { statement.values = values; return statement; },
        async first() { return marker(sql) === 'content-by-id' ? stored : null; },
        async run() { return { meta: { changes: 0 } }; },
      };
      return statement;
    },
    async batch(statements) {
      for (const statement of statements) {
        const name = marker(statement.sql);
        if (name === 'insert-content') {
          assert.match(statement.sql, new RegExp(`INSERT INTO\\s+${expectedTable}\\b`));
          assert.doesNotMatch(statement.sql, /\bcontent_items\b/);
          const [id, nameValue, description, documentJson, editor, now] = statement.values;
          stored = { content_type: type, id, display_name: nameValue, description, document_json: documentJson, revision: 1, status: 'draft', updated_by: editor, updated_at: now, published_revision: null, published_commit_sha: null, publication_id: null, deleted_at: null };
        }
        if (name === 'insert-content-revision') assert.match(statement.sql, /INSERT INTO\s+entity_revisions\b/);
        if (name === 'clear-content-dependencies' || name === 'insert-content-dependency') assert.match(statement.sql, /\bentity_dependencies\b/);
      }
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
}

test('character and object writes keep current records, revisions and dependencies in typed storage', async () => {
  const character = createContentDocument('character', {
    id: 'postler', name: 'Postler',
    appearance: { width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels },
  }, { dependencies: [{ type: 'animation', id: 'winken', relation: 'uses' }] });
  const object = createContentDocument('object', { id: 'bank', name: 'Bank', type: 'custom', width: 2, height: 1, color: '#55d9dd' });
  const characterDb = typedWriteDatabase('characters', 'character');
  const objectDb = typedWriteDatabase('assets', 'object');

  assert.equal((await saveContentItem(characterDb, character, { expectedRevision: 0, login: 'redaktion' })).revision, 1);
  assert.equal((await saveContentItem(objectDb, object, { expectedRevision: 0, login: 'redaktion' })).revision, 1);
  assert.ok(characterDb.sqlLog.some((sql) => /entity_revisions/.test(sql)));
  assert.ok(characterDb.sqlLog.some((sql) => /entity_dependencies/.test(sql)));
});
