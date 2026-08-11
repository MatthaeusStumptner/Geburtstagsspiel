import test from 'node:test';
import assert from 'node:assert/strict';
import { DraftRepository } from '../src/draft-repository.js';
import { createStarterLevel } from '../src/editor-state.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('saves, lists, loads and removes independent local drafts', () => {
  const storage = new MemoryStorage();
  const repository = new DraftRepository(storage, 'test');
  const first = createStarterLevel();
  const second = { ...createStarterLevel(), id: 'zweites-level', name: { standard: 'Zweites Level', dialect: 'Zwoats Level' } };
  repository.save(first); repository.save(second);
  assert.deepEqual(repository.list().map((entry) => entry.id).sort(), ['mein-level', 'zweites-level']);
  assert.equal(repository.active().id, 'zweites-level');
  const loaded = repository.load('mein-level'); loaded.name.standard = 'Verändert';
  assert.equal(repository.load('mein-level').name.standard, 'Mein Passau-Level');
  assert.equal(repository.remove('zweites-level'), true);
  assert.equal(repository.load('zweites-level'), null);
  assert.equal(repository.active(), null);
  assert.equal(repository.remove('zweites-level'), false);
});

test('recovers safely from corrupt browser storage', () => {
  const storage = new MemoryStorage(); storage.setItem('test', '{kaputt');
  const repository = new DraftRepository(storage, 'test');
  assert.deepEqual(repository.list(), []);
  assert.equal(repository.active(), null);
});

test('can save a conflict backup without replacing the active draft', () => {
  const storage = new MemoryStorage();
  const repository = new DraftRepository(storage, 'test');
  const active = createStarterLevel();
  const backup = { ...createStarterLevel(), id: 'mein-level-lokale-sicherung' };
  repository.save(active);
  repository.save(backup, { activate: false });
  assert.equal(repository.active().id, active.id);
  assert.equal(repository.load(backup.id).id, backup.id);
});

test('treats legacy drafts as clean until a new local edit is based on cloud state', () => {
  const storage = new MemoryStorage();
  const level = createStarterLevel();
  storage.setItem('test', JSON.stringify({ activeId: level.id, drafts: { [level.id]: { savedAt: '2020-01-01', level } } }));
  const repository = new DraftRepository(storage, 'test');
  assert.deepEqual(repository.activeEntry().sync, { baseRevision: null, dirty: false, source: 'legacy' });

  repository.save(level, { sync: { baseRevision: 7, dirty: false, source: 'cloud' } });
  assert.deepEqual(repository.entry(level.id).sync, { baseRevision: 7, dirty: false, source: 'cloud' });
  repository.save({ ...level, description: 'bearbeitet' }, { sync: { baseRevision: 7, dirty: true, source: 'local' } });
  assert.deepEqual(repository.entry(level.id).sync, { baseRevision: 7, dirty: true, source: 'local' });
});
