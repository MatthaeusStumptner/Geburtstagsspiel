import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectLibrary, applyAssetToPlacement, createBlankObjectAsset, overridePlacementValue, placementFromAsset } from '../src/object-library.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('ships reusable Passau objects independently from a particular map', () => {
  const library = new ObjectLibrary(new MemoryStorage());
  const assets = library.list();
  assert.deepEqual(assets.map((asset) => asset.id), ['music-note', 'zauberberg-note', 'stage-lights', 'kingfisher', 'tree', 'bench', 'sign', 'text-block', 'brahmahof-mailbox', 'concert-speaker', 'university-book', 'factory-steam', 'river-spark', 'oberhaus-flag', 'cathedral-bell', 'lola-stick']);
  assert.equal(assets.find((asset) => asset.id === 'music-note').appearance.animations[0].id, 'idle');
  assert.notDeepEqual(assets.find((asset) => asset.id === 'music-note').appearance.pixels, assets.find((asset) => asset.id === 'zauberberg-note').appearance.pixels);
  assert.equal(assets.find((asset) => asset.id === 'text-block').type, 'text');
  assert.equal(assets.find((asset) => asset.id === 'text-block').textStyle.backgroundOpacity, 0);
  assert.equal(assets.find((asset) => asset.id === 'text-block').textStyle.borderOpacity, 0);
  assets[0].name = 'verändert';
  assert.equal(library.list()[0].name, 'Musiknote');
});

test('saves an arbitrary pixel object and restores it from browser storage', () => {
  const storage = new MemoryStorage();
  const library = new ObjectLibrary(storage);
  const asset = createBlankObjectAsset('Lolas Bühne');
  asset.appearance.animations[0].keyframes[0].pixels[0] = `1${'0'.repeat(11)}`;
  const saved = library.save(asset);
  const restored = new ObjectLibrary(storage).list().find((entry) => entry.id === 'lolas-buhne');
  assert.equal(saved.id, 'lolas-buhne');
  assert.equal(restored.appearance.animations[0].keyframes[0].pixels[0], `1${'0'.repeat(11)}`);
});

test('places a self-contained sprite instance that survives without the editor library', () => {
  const asset = createBlankObjectAsset('Konzertplakat');
  asset.animation = { type: 'pulse', speed: 2, amplitude: 0.2 };
  asset.effects = [{ id: 'glitch', type: 'glitch', intensity: 0.5, speed: 2, color: '#ff4f87' }];
  const placement = placementFromAsset(asset, { x: 7, y: 9 }, 3);
  assert.equal(placement.assetId, 'konzertplakat');
  assert.equal(placement.x, 7);
  assert.equal(placement.y, 9);
  assert.equal(placement.spriteAnimation, 'idle');
  assert.notStrictEqual(placement.appearance, asset.appearance);
  assert.deepEqual(placement.animation, asset.animation);
  assert.deepEqual(placement.effects, asset.effects);
  assert.notStrictEqual(placement.effects, asset.effects);
  assert.deepEqual(placement.assetOverrides, []);
});

test('saved edits override built-in assets instead of being hidden by defaults', () => {
  const storage = new MemoryStorage();
  const library = new ObjectLibrary(storage);
  library.save({ ...library.list().find((asset) => asset.id === 'music-note'), color: '#ff00aa' });
  assert.equal(new ObjectLibrary(storage).list().find((asset) => asset.id === 'music-note').color, '#ff00aa');
});

test('linked asset updates are immediate while explicit instance overrides stay local', () => {
  const asset = createBlankObjectAsset('Ampel');
  const instance = placementFromAsset(asset, { x: 2, y: 3 });
  const overridden = overridePlacementValue(instance, ['color'], '#ff00aa');
  assert.deepEqual(overridden.assetOverrides, ['color']);
  assert.equal(overridden.appearance.palette.includes('#ff00aa'), true);

  const changedAsset = { ...asset, name: 'Neue Ampel', color: '#33cc44' };
  changedAsset.appearance = { ...asset.appearance, palette: ['transparent', '#33cc44'] };
  const updated = applyAssetToPlacement(overridden, changedAsset);
  assert.equal(updated.name, 'Neue Ampel');
  assert.equal(updated.color, '#ff00aa');
  assert.equal(updated.appearance.palette.includes('#ff00aa'), true);
});

test('every editable linked asset setting propagates or remains overridden deterministically', () => {
  const original = createBlankObjectAsset('Prüfobjekt');
  original.content = { standard: 'Alt', dialect: 'Oid' };
  original.textStyle = { fontSize: 1, align: 'left' };
  original.spriteAnimation = 'idle';
  const changed = {
    ...original,
    name: 'Neu', type: 'text', width: 4, height: 5, color: '#33cc44', label: 'N', spriteAnimation: 'walk',
    appearance: { ...original.appearance, palette: ['transparent', '#33cc44'] },
    animation: { type: 'pulse', speed: 2, amplitude: 0.4 }, effects: [{ id: 'glow', type: 'neon', color: '#33cc44' }],
    content: { standard: 'Neu', dialect: 'Nei' }, textStyle: { fontSize: 2, align: 'center' },
  };
  const fields = ['name', 'type', 'width', 'height', 'color', 'label', 'appearance', 'spriteAnimation', 'animation', 'effects', 'content', 'textStyle'];
  fields.forEach((field) => {
    const instance = placementFromAsset(original, { x: 1, y: 1 });
    const inherited = applyAssetToPlacement(instance, changed);
    assert.deepEqual(inherited[field], changed[field], `${field} must inherit`);

    const localValue = field === 'width' || field === 'height' ? 7 : instance[field];
    const overridden = overridePlacementValue(instance, [field], localValue);
    const kept = applyAssetToPlacement(overridden, changed);
    assert.deepEqual(kept[field], overridden[field], `${field} override must survive`);
  });
});
