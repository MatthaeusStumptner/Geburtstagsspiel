import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const SAVE_KEY = 'gassi-runde-hals-save';

async function runBootstrap({ savedValue = null, mobile = false } = {}) {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const match = html.match(/<script data-initial-layout-bootstrap>([\s\S]*?)<\/script>/);
  assert.ok(match, 'index.html must contain the synchronous initial-layout bootstrap');

  const classes = new Set();
  vm.runInNewContext(match[1], {
    document: { body: { classList: { add: (...names) => names.forEach((name) => classes.add(name)) } } },
    localStorage: { getItem: (key) => (key === SAVE_KEY ? savedValue : null) },
    matchMedia: () => ({ matches: mobile }),
  });
  return classes;
}

test('first visit reserves the map layout before the app renders', async () => {
  const classes = await runBootstrap();
  assert.deepEqual([...classes], ['map-active']);
});

test('saved gameplay reserves only the mobile playfield layout on a mobile viewport', async () => {
  const savedValue = JSON.stringify({ version: 9, mode: 'paused' });
  assert.deepEqual([...(await runBootstrap({ savedValue, mobile: true }))], ['mobile-game-active']);
  assert.deepEqual([...(await runBootstrap({ savedValue, mobile: false }))], []);
});

test('map saves and malformed saves start in the stable map layout', async () => {
  assert.deepEqual([...(await runBootstrap({ savedValue: JSON.stringify({ version: 9, mode: 'map' }) }))], ['map-active']);
  assert.deepEqual([...(await runBootstrap({ savedValue: '{broken' }))], ['map-active']);
});
