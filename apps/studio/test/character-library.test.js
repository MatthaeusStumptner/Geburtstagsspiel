import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterLibrary, characterPlacement, createBlankCharacterAsset } from '../src/character-library.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('creates a visible five-state character without turning it into a cat', () => {
  const asset = createBlankCharacterAsset('Passauer Postler');
  assert.equal(asset.id, 'passauer-postler');
  assert.deepEqual(Object.keys(asset.appearance.stateAnimations), ['idle', 'up', 'right', 'down', 'left']);
  assert.equal(asset.appearance.animations.length, 5);
  assert.equal(asset.appearance.width, 24);
  assert.equal(asset.appearance.height, 24);
  assert.equal(asset.appearance.palette.length, 12);
  assert.ok(asset.appearance.animations.every((animation) => animation.frames.length === 2));
  assert.ok(asset.appearance.pixels.some((row) => /[1-9a-z]/.test(row)));
  const placement = characterPlacement(asset, { x: 4, y: 7 }, 2);
  assert.equal(placement.characterId, 'passauer-postler');
  assert.equal(placement.name, 'Passauer Postler');
  assert.equal(placement.x, 4);
  assert.equal(placement.animation, '');
  assert.equal(placement.behavior.controller, 'stationary');
  assert.equal(Object.hasOwn(placement, 'strategy'), false);
});

test('persists global character definitions independently from a level document', () => {
  const storage = new MemoryStorage();
  const library = new CharacterLibrary(storage);
  const asset = createBlankCharacterAsset('Donaunixe', 'empty', 24);
  asset.appearance.pixels[0] = `1${'0'.repeat(23)}`;
  library.save(asset);
  const restored = new CharacterLibrary(storage).list()[0];
  assert.equal(restored.id, 'donaunixe');
  assert.equal(restored.appearance.pixels[0], `1${'0'.repeat(23)}`);
});

test('places a self-contained instance that survives without browser storage', () => {
  const asset = createBlankCharacterAsset('Wächterin');
  const placement = characterPlacement(asset, { x: 2, y: 3 });
  const placedPixels = placement.appearance.pixels.join('');
  asset.appearance.pixels[0] = '0'.repeat(24);
  asset.appearance.pixels[4] = '0'.repeat(24);
  asset.effects.push({ id: 'late', type: 'sparkle' });
  assert.notEqual(placedPixels, asset.appearance.pixels.join(''));
  assert.deepEqual(placement.effects, []);
  assert.equal(placement.scale, 1);
});

test('creates truly empty canvases in every supported working resolution', () => {
  for (const size of [8, 12, 16, 24]) {
    const asset = createBlankCharacterAsset(`Leer ${size}`, 'empty', size);
    assert.equal(asset.appearance.width, size);
    assert.equal(asset.appearance.height, size);
    assert.equal(asset.appearance.pixels.length, size);
    assert.ok(asset.appearance.pixels.every((row) => row === '0'.repeat(size)));
  }
});
