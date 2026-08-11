import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudioUrl, normalizeStudioRoute, parseStudioRoute, sameStudioRoute, StudioRouter } from '../src/studio-router.js';

function fakeBrowser(href = 'https://example.test/editor/') {
  const listeners = new Map();
  const calls = [];
  const window = {
    location: new URL(href),
    history: {
      pushState(_state, _title, next) { calls.push(['push', next]); window.location = new URL(next, window.location); },
      replaceState(_state, _title, next) { calls.push(['replace', next]); window.location = new URL(next, window.location); },
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  return { window, storage, calls, listeners, values };
}

test('parses and normalizes only known editor workspaces', () => {
  assert.equal(parseStudioRoute('https://example.test/editor/'), null);
  assert.deepEqual(parseStudioRoute('https://example.test/editor/?level=zauberberg&workspace=objects&selection=theme-element%3Astage-note'), {
    levelId: 'zauberberg', workspace: 'objects', selection: 'theme-element:stage-note', assetId: '', eventId: '', cutsceneId: '', trackId: '', keyframeId: '',
  });
  assert.equal(normalizeStudioRoute({ workspace: 'unbekannt' }).workspace, 'level');
});

test('builds GitHub Pages compatible links and preserves OAuth fragments', () => {
  const result = buildStudioUrl('https://example.test/editor/?preview=1#publisher_session=secret', {
    levelId: 'zauberberg', workspace: 'cutscenes', cutsceneId: 'soundcheck', trackId: 'camera',
  });
  assert.equal(result, '/editor/?preview=1&level=zauberberg&workspace=cutscenes&cutscene=soundcheck&track=camera#publisher_session=secret');
  assert.equal(parseStudioRoute(`https://example.test${result}`).trackId, 'camera');
});

test('compares normalized routes without depending on object identity', () => {
  assert.equal(sameStudioRoute({ levelId: 'hals', workspace: 'events', eventId: 'eisvogel' }, { levelId: 'hals', workspace: 'events', eventId: 'eisvogel' }), true);
  assert.equal(sameStudioRoute({ levelId: 'hals', workspace: 'events' }, { levelId: 'hals', workspace: 'objects' }), false);
});

test('restores the last navigation from local storage when the URL is clean', () => {
  const browser = fakeBrowser();
  browser.storage.setItem('franz-lola:studio-route:v1', JSON.stringify({ levelId: 'dom', workspace: 'events', eventId: 'orgel' }));
  const visited = [];
  const router = new StudioRouter({ window: browser.window, storage: browser.storage });
  const stop = router.start({ levelId: 'home', workspace: 'level' }, (route) => visited.push(route));
  assert.equal(visited[0].levelId, 'dom');
  assert.equal(visited[0].eventId, 'orgel');
  assert.deepEqual(browser.calls[0], ['replace', '/editor/?level=dom&workspace=events&event=orgel']);
  assert.equal(browser.listeners.has('popstate'), true);
  stop();
  assert.equal(browser.listeners.has('popstate'), false);
});

test('adds history entries for places but replaces transient selection changes', () => {
  const browser = fakeBrowser('https://example.test/editor/?level=home&workspace=level');
  const visited = [];
  const router = new StudioRouter({ window: browser.window, storage: browser.storage });
  router.start({ levelId: 'home', workspace: 'level' }, (route) => visited.push(route));
  assert.equal(router.sync({ levelId: 'home', workspace: 'objects', assetId: 'music-note' }), true);
  assert.deepEqual(browser.calls.at(-1), ['push', '/editor/?level=home&workspace=objects&asset=music-note']);
  assert.equal(router.sync({ levelId: 'home', workspace: 'objects', assetId: 'zauberberg-note', selection: 'decoration:note' }), true);
  assert.deepEqual(browser.calls.at(-1), ['replace', '/editor/?level=home&workspace=objects&selection=decoration%3Anote&asset=zauberberg-note']);
  browser.window.location = new URL('https://example.test/editor/?level=home&workspace=level');
  browser.listeners.get('popstate')();
  assert.equal(visited.at(-1).workspace, 'level');
});
