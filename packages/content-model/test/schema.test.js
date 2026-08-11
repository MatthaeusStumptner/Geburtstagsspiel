import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ships a machine-readable schema for the public level contract', async () => {
  const schema = JSON.parse(await readFile(new URL('../schema/franz-lola-level.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.deepEqual(schema.properties.kind, { const: 'franz-lola-level' });
  assert.ok(schema.required.includes('board'));
  assert.ok(schema.$defs.decoration);
  assert.ok(schema.$defs.appearance);
  assert.ok(schema.$defs.appearance.properties.animations);
  assert.ok(schema.$defs.actorBehavior);
  assert.equal(schema.$defs.actor.allOf[1].properties.id.type, 'string');
  assert.equal(schema.properties.actors.properties.characters.items.$ref, '#/$defs/actor');
  assert.equal(schema.$defs.actor.allOf[1].properties.characterId.type, 'string');
  assert.ok(schema.$defs.difficultyProfile);
  assert.ok(schema.$defs.motionAnimation);
  assert.ok(schema.$defs.levelEvent);
  assert.ok(schema.properties.events);
  assert.ok(schema.$defs.cutscene);
  assert.ok(schema.$defs.cutsceneTrack);
  assert.ok(schema.properties.cutscenes);
  assert.ok(schema.$defs.decoration.properties === undefined || schema.$defs.decoration.allOf[1].properties.appearance);
  assert.ok(schema.$defs.visualEffect);
  assert.ok(schema.$defs.edgeEffect);
  assert.ok(schema.properties.theme.properties.edgeEffects);
  assert.equal(schema.$defs.textStyle.properties.borderOpacity.maximum, 1);
});
