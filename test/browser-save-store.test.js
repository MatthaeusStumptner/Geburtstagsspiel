import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSaveStore } from '../src/platform/browser-save-store.js';

test('contains JSON parsing failures and keeps unrelated keys untouched', () => {
  const data = new Map([['broken', '{'], ['other-app', 'keep']]);
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const store = new BrowserSaveStore(storage);
  assert.equal(store.readJson('broken'), null);
  store.writeJson('game', { score: 42 });
  assert.deepEqual(store.readJson('game'), { score: 42 });
  store.remove('game');
  assert.equal(data.get('other-app'), 'keep');
});
