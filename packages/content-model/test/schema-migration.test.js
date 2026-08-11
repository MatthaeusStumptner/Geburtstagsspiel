import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CONTENT_SCHEMA_VERSION,
  CONTENT_TYPES,
  MIN_CONTENT_SCHEMA_VERSION,
  contentPublicationPath,
  migrateContentDocument,
  parseContentDocument,
  validateContentDocument,
} from '../src/index.js';
import { eventV2, legacyObjectV1 } from './fixtures/content-documents.js';

test('migrates schema v1 to v2 and accepts reusable events', () => {
  assert.equal(MIN_CONTENT_SCHEMA_VERSION, 1);
  assert.equal(CONTENT_SCHEMA_VERSION, 2);
  assert.deepEqual(CONTENT_TYPES, [
    'character', 'tileset', 'block', 'animation', 'cutscene', 'object', 'event',
  ]);
  const migrated = migrateContentDocument(legacyObjectV1);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.references, []);
  assert.equal(legacyObjectV1.schemaVersion, 1);
  assert.equal('references' in legacyObjectV1, false);
  assert.deepEqual(parseContentDocument(eventV2), eventV2);
});

test('migrates immutable v1 inputs through public validation and parsing', () => {
  const validated = validateContentDocument(legacyObjectV1);
  assert.equal(validated.ok, true, validated.errors.join('\n'));
  assert.equal(validated.value.schemaVersion, 2);
  assert.deepEqual(validated.value.references, []);
  const parsed = parseContentDocument(legacyObjectV1);
  assert.equal(parsed.schemaVersion, 2);
  assert.deepEqual(parsed.references, []);
  assert.equal(legacyObjectV1.schemaVersion, 1);
  assert.notStrictEqual(parsed, legacyObjectV1);
});

test('clones schema v2 without changing its values', () => {
  const migrated = migrateContentDocument(eventV2);
  assert.deepEqual(migrated, eventV2);
  assert.notStrictEqual(migrated, eventV2);
  assert.notStrictEqual(migrated.document, eventV2.document);
});

test('fails closed on non-canonical schema-v2 reference IDs without rewriting them', () => {
  const input = {
    ...eventV2,
    references: [{ type: 'object', id: '../missing' }],
  };
  assert.deepEqual(migrateContentDocument(input).references, [
    { type: 'object', id: '../missing' },
  ]);
  const validated = validateContentDocument(input);
  assert.equal(validated.ok, false);
  assert.match(validated.errors.join('\n'), /references\[0\]\.id/);
  assert.throws(() => parseContentDocument(input), /references\[0\]\.id/);
  assert.deepEqual(input.references, [{ type: 'object', id: '../missing' }]);
});

test('fails closed on non-string schema-v2 reference IDs', () => {
  const input = {
    ...eventV2,
    references: [{ type: 'object', id: 123 }],
  };
  const validated = validateContentDocument(input);
  assert.equal(validated.ok, false);
  assert.match(validated.errors.join('\n'), /references\[0\]\.id/);
  assert.throws(() => parseContentDocument(input), /references\[0\]\.id/);
  assert.deepEqual(input.references, [{ type: 'object', id: 123 }]);
});

test('fails closed on unknown schema-v2 reference types without dropping them', () => {
  const input = {
    ...eventV2,
    references: [{ type: 'unknown', id: 'missing' }],
  };
  assert.deepEqual(migrateContentDocument(input).references, [
    { type: 'unknown', id: 'missing' },
  ]);
  const validated = validateContentDocument(input);
  assert.equal(validated.ok, false);
  assert.match(validated.errors.join('\n'), /references\[0\]\.type/);
  assert.throws(() => parseContentDocument(input), /references\[0\]\.type/);
  assert.deepEqual(input.references, [{ type: 'unknown', id: 'missing' }]);
});

test('preserves a valid schema-v2 reference array exactly without mutating it', () => {
  const references = Object.freeze([
    Object.freeze({ type: 'object', id: 'briefkasten' }),
    Object.freeze({ type: 'object', id: 'briefkasten' }),
  ]);
  const input = Object.freeze({ ...eventV2, references });
  const migrated = migrateContentDocument(input);
  assert.deepEqual(migrated.references, references);
  assert.notStrictEqual(migrated.references, references);
  const validated = validateContentDocument(input);
  assert.equal(validated.ok, true, validated.errors.join('\n'));
  assert.deepEqual(validated.value.references, references);
  assert.notStrictEqual(validated.value.references, references);
  assert.deepEqual(parseContentDocument(input).references, references);
  assert.deepEqual(input.references, references);
});
test('fails closed with version-specific issues for invalid schema versions', () => {
  for (const schemaVersion of [0, 3, 1.5, '2', null]) {
    assert.throws(
      () => migrateContentDocument({ ...legacyObjectV1, schemaVersion }),
      new RegExp(`schemaVersion ${String(schemaVersion).replace('.', '\\.')}`),
    );
  }
  assert.throws(() => migrateContentDocument([]), /Objekt/);
  assert.throws(() => parseContentDocument({ ...eventV2, schemaVersion: 3 }), /schemaVersion 3/);
});

test('publishes events through their exact reusable-content path', () => {
  assert.equal(contentPublicationPath('event', 'eisvogel'), 'src/data/library/events/eisvogel.event.json');
});

test('ships a schema-v2 discriminator with reusable event references', async () => {
  const schema = JSON.parse(await readFile(new URL('../schema/franz-lola-content.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.properties.schemaVersion, { const: 2 });
  assert.ok(schema.properties.type.enum.includes('event'));
  assert.ok(schema.properties.references.items.properties.type.enum.includes('event'));
  assert.ok(schema.required.includes('references'));
});
