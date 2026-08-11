import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const SAVE_KEY = 'gassi-runde-hals-save';

async function runBootstrap({ savedValue = null, mobile = false } = {}) {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const match = html.match(/<script data-initial-layout-bootstrap>([\s\S]*?)<\/script>/);
  assert.ok(match, 'index.html must contain the synchronous initial-layout bootstrap');
  const versionMatch = html.match(/<body data-min-save-version="(\d+)" data-save-version="(\d+)">/);
  assert.ok(versionMatch, 'index.html must own the shared supported save-version range');

  const classes = new Set();
  vm.runInNewContext(match[1], {
    document: {
      body: {
        dataset: { minSaveVersion: versionMatch[1], saveVersion: versionMatch[2] },
        classList: { add: (...names) => names.forEach((name) => classes.add(name)) },
      },
    },
    localStorage: { getItem: (key) => (key === SAVE_KEY ? savedValue : null) },
    matchMedia: () => ({ matches: mobile }),
  });
  return classes;
}

test('first visit reserves the map layout before the app renders', async () => {
  const classes = await runBootstrap();
  assert.deepEqual([...classes], ['map-active']);
});

test('supported saved gameplay reserves the runtime playfield layout on every viewport', async () => {
  for (const version of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const savedValue = JSON.stringify({ version, mode: 'paused' });
    assert.deepEqual([...(await runBootstrap({ savedValue, mobile: true }))], ['mobile-game-active']);
    assert.deepEqual([...(await runBootstrap({ savedValue, mobile: false }))], ['mobile-game-active']);
  }
});

test('map saves and malformed saves start in the stable map layout', async () => {
  assert.deepEqual([...(await runBootstrap({ savedValue: JSON.stringify({ version: 9, mode: 'map' }) }))], ['map-active']);
  assert.deepEqual([...(await runBootstrap({ savedValue: '{broken' }))], ['map-active']);
});

test('unsupported and non-object saves follow the loader back to the map layout', async () => {
  const rejectedSaves = [
    JSON.stringify({ version: 10, mode: 'paused' }),
    JSON.stringify({ version: 1, mode: 'paused' }),
    JSON.stringify(['paused']),
    JSON.stringify('paused'),
  ];

  for (const savedValue of rejectedSaves) {
    assert.deepEqual([...(await runBootstrap({ savedValue, mobile: true }))], ['map-active']);
  }
});

test('the restored gameplay focus mode removes the occluded app shell from layout', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  assert.match(css, /body\.mobile-game-active \.app-shell\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*100dvh[\s\S]*?min-height:\s*0[\s\S]*?padding:\s*0[\s\S]*?\}/);
  assert.match(css, /body\.mobile-game-active \.topbar,\s*body\.mobile-game-active #svelte-side-panel,\s*body\.mobile-game-active footer\s*\{\s*display:\s*none;?\s*\}/);
  assert.match(css, /body\.mobile-game-active \.game-layout\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0[\s\S]*?display:\s*block[\s\S]*?height:\s*100%[\s\S]*?\}/);
});
