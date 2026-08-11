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
test('preserves valid schema-v2 dependencies exactly in an independent clone', () => {
  const dependencies = Object.freeze([
    Object.freeze({ type: 'animation', id: 'winken', relation: 'uses', revision: 3 }),
    Object.freeze({ type: 'animation', id: 'winken', relation: 'uses', revision: 3 }),
    Object.freeze({ type: 'object', id: 'briefkasten', relation: 'contains' }),
  ]);
  const input = Object.freeze({ ...eventV2, dependencies });
  const validated = validateContentDocument(input);
  assert.equal(validated.ok, true, validated.errors.join('\n'));
  assert.deepEqual(validated.value.dependencies, dependencies);
  assert.notStrictEqual(validated.value.dependencies, dependencies);
  assert.notStrictEqual(validated.value.dependencies[0], dependencies[0]);
  assert.deepEqual(parseContentDocument(input).dependencies, dependencies);
  assert.deepEqual(input.dependencies, dependencies);
});

test('schema-v2 dependency and reference entries fail closed under the JSON schema contract', async (context) => {
  const schema = JSON.parse(await readFile(new URL('../schema/franz-lola-content.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.properties.dependencies.items.required, ['type', 'id', 'relation']);
  assert.equal(schema.properties.dependencies.items.additionalProperties, false);
  assert.deepEqual(schema.properties.references.items.required, ['type', 'id']);
  assert.equal(schema.properties.references.items.additionalProperties, false);
  const invalidCases = [
    ['dependencies is not an array', { dependencies: {} }, /dependencies.*Array/i],
    ['dependency is not a plain object', { dependencies: [new Date(0)] }, /dependencies\[0\].*Objekt/i],
    ['dependency has an extra field', { dependencies: [{ type: 'object', id: 'briefkasten', relation: 'uses', extra: true }] }, /dependencies\[0\].*nur/i],
    ['dependency has an unknown type', { dependencies: [{ type: 'unknown', id: 'briefkasten', relation: 'uses' }] }, /dependencies\[0\]\.type/i],
    ['dependency id is not canonical', { dependencies: [{ type: 'object', id: 'Brief Kasten', relation: 'uses' }] }, /dependencies\[0\]\.id/i],
    ['dependency relation is not canonical', { dependencies: [{ type: 'object', id: 'briefkasten', relation: 'Uses It' }] }, /dependencies\[0\]\.relation/i],
    ['dependency revision is below the schema minimum', { dependencies: [{ type: 'object', id: 'briefkasten', relation: 'uses', revision: 0 }] }, /dependencies\[0\]\.revision/i],
    ['dependency revision is not an integer', { dependencies: [{ type: 'object', id: 'briefkasten', relation: 'uses', revision: 1.5 }] }, /dependencies\[0\]\.revision/i],
    ['reference is not a plain object', { references: [new Date(0)] }, /references\[0\].*Objekt/i],
    ['reference has an extra field', { references: [{ type: 'object', id: 'briefkasten', relation: 'uses' }] }, /references\[0\].*nur/i],
  ];
  for (const [name, override, pattern] of invalidCases) {
    await context.test(name, () => {
      const input = { ...eventV2, ...override };
      const before = structuredClone(input);
      const validated = validateContentDocument(input);
      assert.equal(validated.ok, false);
      assert.match(validated.errors.join('\n'), pattern);
      assert.throws(() => parseContentDocument(input), pattern);
      assert.deepEqual(input, before);
    });
  }
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
  assert.equal(contentPublicationPath('event', 'eisvogel'), 'content/events/eisvogel.event.json');
});

test('ships a schema-v2 discriminator with reusable event references', async () => {
  const schema = JSON.parse(await readFile(new URL('../schema/franz-lola-content.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.properties.schemaVersion, { const: 2 });
  assert.ok(schema.properties.type.enum.includes('event'));
  assert.ok(schema.properties.references.items.properties.type.enum.includes('event'));
  assert.ok(schema.required.includes('references'));
});
