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
