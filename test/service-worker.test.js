import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import {
  buildServiceWorkerSource,
  generateServiceWorker,
} from '../scripts/generate-service-worker.mjs';
import { registerGameServiceWorker } from '../src/platform/register-service-worker.js';

function workerRuntime(source, { origin = 'https://example.test' } = {}) {
  const listeners = new Map();
  const self = {
    location: { origin },
    addEventListener(type, handler) { listeners.set(type, handler); },
    skipWaiting() {},
    clients: { claim() { return Promise.resolve(); } },
  };
  vm.runInNewContext(source, { self, URL, Set, Promise });
  return { listeners, self };
}

test('builds a deterministic worker with a canonical generated asset allowlist', () => {
  const source = buildServiceWorkerSource({
    cacheName: 'franz-lola-assets-abc123',
    assetPaths: [
      '/Geburtstagsspiel/assets/z.js',
      '/Geburtstagsspiel/assets/a.css',
      '/Geburtstagsspiel/assets/z.js',
    ],
  });

  assert.equal(source, buildServiceWorkerSource({
    cacheName: 'franz-lola-assets-abc123',
    assetPaths: [
      '/Geburtstagsspiel/assets/a.css',
      '/Geburtstagsspiel/assets/z.js',
    ],
  }));
  assert.match(source, /franz-lola-assets-abc123/);
  assert.match(source, /\/Geburtstagsspiel\/assets\/a\.css/);
  assert.throws(() => buildServiceWorkerSource({
    cacheName: 'franz-lola-assets-abc123',
    assetPaths: ['/Geburtstagsspiel/not-an-asset.js'],
  }), /generated asset/i);
});

test('generated worker cache-first policy accepts only exact same-origin generated assets', async () => {
  const source = buildServiceWorkerSource({
    cacheName: 'franz-lola-assets-abc123',
    assetPaths: ['/Geburtstagsspiel/assets/app-abc.js'],
  });
  const { listeners, self } = workerRuntime(source);
  const puts = [];
  const cache = {
    match: async () => null,
    put: async (request) => puts.push(request.url),
  };
  const caches = { open: async () => cache };
  const response = { ok: true, type: 'basic', url: 'https://example.test/Geburtstagsspiel/assets/app-abc.js', clone() { return this; } };
  const exactRequest = { method: 'GET', url: response.url, destination: 'script', mode: 'cors' };
  const exactEvent = { request: exactRequest, respondWith(value) { this.response = value; } };

  const runtime = { listeners: new Map() };
  const scopedSelf = { ...self, addEventListener(type, handler) { runtime.listeners.set(type, handler); } };
  vm.runInNewContext(source, { self: scopedSelf, URL, Set, Promise, caches, fetch: async () => response });
  await runtime.listeners.get('fetch')(exactEvent);
  await exactEvent.response;
  assert.deepEqual(puts, [exactRequest.url]);

  const foreignEvent = { request: { ...exactRequest, url: 'https://elsewhere.test/assets/app-abc.js' }, respondWith(value) { this.response = value; } };
  runtime.listeners.get('fetch')(foreignEvent);
  assert.equal(foreignEvent.response, undefined);
  assert.deepEqual(puts, [exactRequest.url]);
});

test('generated worker sends documents, JSON, and unlisted requests to the network without cache writes', async () => {
  const source = buildServiceWorkerSource({
    cacheName: 'franz-lola-assets-abc123',
    assetPaths: ['/Geburtstagsspiel/assets/app-abc.js'],
  });
  const calls = [];
  const runtime = { listeners: new Map() };
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener(type, handler) { runtime.listeners.set(type, handler); },
    skipWaiting() {},
    clients: { claim() { return Promise.resolve(); } },
  };
  vm.runInNewContext(source, {
    self, URL, Set, Promise,
    caches: { open: async () => ({ match: async () => { throw new Error('must not read cache'); }, put: async () => { throw new Error('must not write cache'); } }) },
    fetch: async (request) => { calls.push(request.url); return { ok: true }; },
  });
  for (const request of [
    { method: 'GET', url: 'https://example.test/Geburtstagsspiel/', destination: 'document', mode: 'navigate' },
    { method: 'GET', url: 'https://example.test/Geburtstagsspiel/data/level.json', destination: '', mode: 'cors' },
    { method: 'GET', url: 'https://example.test/Geburtstagsspiel/other.js', destination: 'script', mode: 'cors' },
  ]) {
    const event = { request, respondWith(value) { this.response = value; } };
    runtime.listeners.get('fetch')(event);
    await event.response;
  }
  assert.deepEqual(calls, [
    'https://example.test/Geburtstagsspiel/',
    'https://example.test/Geburtstagsspiel/data/level.json',
    'https://example.test/Geburtstagsspiel/other.js',
  ]);
});

test('activation cleans up only stale caches owned by the game', async () => {
  const source = buildServiceWorkerSource({
    cacheName: 'franz-lola-assets-current',
    assetPaths: ['/Geburtstagsspiel/assets/app.js'],
  });
  const deleted = [];
  const runtime = { listeners: new Map() };
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener(type, handler) { runtime.listeners.set(type, handler); },
    skipWaiting() {},
    clients: { claim() { return Promise.resolve(); } },
  };
  vm.runInNewContext(source, {
    self, URL, Set, Promise,
    caches: { keys: async () => ['franz-lola-assets-old', 'franz-lola-assets-current', 'other-app'], delete: async (name) => { deleted.push(name); } },
  });
  const event = { waitUntil(value) { this.wait = value; } };
  runtime.listeners.get('activate')(event);
  await event.wait;
  assert.deepEqual(deleted, ['franz-lola-assets-old']);
});

test('worker generation hashes sorted asset content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gassi-sw-'));
  try {
    await writeFile(join(directory, 'app.js'), 'one');
    await writeFile(join(directory, 'style.css'), 'two');
    const first = await generateServiceWorker({ distDirectory: directory, assetsDirectory: directory, basePath: '/Geburtstagsspiel/' });
    const firstSource = await readFile(join(directory, 'sw.js'), 'utf8');
    const second = await generateServiceWorker({ distDirectory: directory, assetsDirectory: directory, basePath: '/Geburtstagsspiel/' });
    const secondSource = await readFile(join(directory, 'sw.js'), 'utf8');
    assert.equal(first.cacheName, second.cacheName);
    assert.equal(firstSource, secondSource);
    assert.match(first.cacheName, /^franz-lola-assets-[a-f0-9]{64}$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test('importing the generator does not write a service-worker artifact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gassi-sw-import-'));
  try {
    const scriptDirectory = await mkdtemp(join(directory, 'scripts-'));
    const scriptPath = join(scriptDirectory, 'generate-service-worker.mjs');
    await writeFile(scriptPath, await readFile(new URL('../scripts/generate-service-worker.mjs', import.meta.url), 'utf8'));
    const scriptUrl = new URL(`file:///${scriptPath.replaceAll('\\', '/')}`).href;
    await import(`${scriptUrl}?isolated-import`);
    await assert.rejects(readFile(join(directory, 'dist', 'sw.js'), 'utf8'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('registration is production-only, base-relative, and failure-safe', async () => {
  const registrations = [];
  const navigator = { serviceWorker: { register: async (url) => { registrations.push(url); return { scope: url }; } } };
  const registration = await registerGameServiceWorker({ navigator, baseUrl: 'https://example.test/Geburtstagsspiel/', production: true });
  assert.deepEqual(registration, { scope: 'https://example.test/Geburtstagsspiel/sw.js' });
  assert.deepEqual(registrations, ['https://example.test/Geburtstagsspiel/sw.js']);
  assert.equal(await registerGameServiceWorker({ navigator, baseUrl: 'https://example.test/Geburtstagsspiel/', production: false }), null);
  assert.equal(await registerGameServiceWorker({ navigator: {}, baseUrl: 'https://example.test/Geburtstagsspiel/', production: true }), null);
  assert.equal(await registerGameServiceWorker({ navigator: { serviceWorker: { register: async () => { throw new Error('offline'); } } }, baseUrl: 'https://example.test/Geburtstagsspiel/', production: true }), null);
});

test('worker pre-caches only canonical assets and never writes a failed response', async () => {
  const source = buildServiceWorkerSource({
    cacheName: 'franz-lola-assets-current',
    assetPaths: ['/Geburtstagsspiel/assets/a.js', '/Geburtstagsspiel/assets/b.css'],
  });
  const writes = [];
  const runtime = { listeners: new Map() };
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener(type, handler) { runtime.listeners.set(type, handler); },
    skipWaiting() {},
    clients: { claim() { return Promise.resolve(); } },
  };
  const cache = {
    addAll: async (paths) => writes.push(['precache', ...paths]),
    match: async () => null,
    put: async () => writes.push(['runtime-cache']),
  };
  vm.runInNewContext(source, {
    self, URL, Set, Promise,
    caches: { open: async () => cache },
    fetch: async () => ({ ok: false, type: 'opaque', clone() { throw new Error('failed response must not be cloned'); } }),
  });
  const installEvent = { waitUntil(value) { this.wait = value; } };
  runtime.listeners.get('install')(installEvent);
  await installEvent.wait;
  assert.deepEqual(writes, [['precache', '/Geburtstagsspiel/assets/a.js', '/Geburtstagsspiel/assets/b.css']]);
  const fetchEvent = {
    request: { method: 'GET', url: 'https://example.test/Geburtstagsspiel/assets/a.js', destination: 'script', mode: 'cors' },
    respondWith(value) { this.response = value; },
  };
  runtime.listeners.get('fetch')(fetchEvent);
  await fetchEvent.response;
  assert.deepEqual(writes, [['precache', '/Geburtstagsspiel/assets/a.js', '/Geburtstagsspiel/assets/b.css']]);
});

test('generated worker excludes browser-save and publisher vocabulary', () => {
  const source = buildServiceWorkerSource({
    cacheName: 'franz-lola-assets-abc123',
    assetPaths: ['/Geburtstagsspiel/assets/app-abc.js'],
  });
  assert.doesNotMatch(source, /localStorage|publisher|save|\/levels\//i);
});

test('listed navigation, document, HTML, and JSON requests bypass the asset cache', async () => {
  const assetPaths = [
    '/Geburtstagsspiel/assets/app.js',
    '/Geburtstagsspiel/assets/page.html',
    '/Geburtstagsspiel/assets/level.json',
  ];
  const source = buildServiceWorkerSource({ cacheName: 'franz-lola-assets-current', assetPaths });
  const network = [];
  let cacheOpens = 0;
  const runtime = { listeners: new Map() };
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener(type, handler) { runtime.listeners.set(type, handler); },
    skipWaiting() {},
    clients: { claim() { return Promise.resolve(); } },
  };
  vm.runInNewContext(source, {
    self, URL, Set, Promise,
    caches: { open: async () => { cacheOpens += 1; return { match: async () => ({ cached: true }) }; } },
    fetch: async (request) => { network.push(request.url); return { network: true }; },
  });
  const requests = [
    { method: 'GET', url: 'https://example.test/Geburtstagsspiel/assets/app.js', destination: 'script', mode: 'navigate' },
    { method: 'GET', url: 'https://example.test/Geburtstagsspiel/assets/app.js', destination: 'document', mode: 'same-origin' },
    { method: 'GET', url: 'https://example.test/Geburtstagsspiel/assets/page.html', destination: '', mode: 'same-origin' },
    { method: 'GET', url: 'https://example.test/Geburtstagsspiel/assets/level.json', destination: '', mode: 'same-origin' },
  ];
  for (const request of requests) {
    const event = { request, respondWith(value) { this.response = value; } };
    runtime.listeners.get('fetch')(event);
    assert.deepEqual(await event.response, { network: true });
  }
  assert.equal(cacheOpens, 0);
  assert.deepEqual(network, requests.map((request) => request.url));
});

test('rejects ambiguous and encoded generated asset paths', () => {
  const invalidPaths = [
    '//elsewhere.test/Geburtstagsspiel/assets/app.js',
    '/Geburtstagsspiel/assets/./app.js',
    '/Geburtstagsspiel/assets/%2e%2e/app.js',
    '/Geburtstagsspiel/assets/%2E%2E/app.js',
    '/Geburtstagsspiel/assets/%252e%252e/app.js',
    '/Geburtstagsspiel/assets/dir%2fapp.js',
    '/Geburtstagsspiel/assets/dir%5Capp.js',
    '/Geburtstagsspiel/assets\\app.js',
  ];
  for (const assetPath of invalidPaths) {
    assert.throws(() => buildServiceWorkerSource({
      cacheName: 'franz-lola-assets-current',
      assetPaths: [assetPath],
    }), /invalid generated asset path/i, assetPath);
  }
});

test('failed pre-cache installation rejects without activating cache cleanup', async () => {
  const source = buildServiceWorkerSource({
    cacheName: 'franz-lola-assets-current',
    assetPaths: ['/Geburtstagsspiel/assets/app.js'],
  });
  const failure = new Error('pre-cache failed');
  let skipWaitingCalls = 0;
  const deleted = [];
  const runtime = { listeners: new Map() };
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener(type, handler) { runtime.listeners.set(type, handler); },
    skipWaiting() { skipWaitingCalls += 1; },
    clients: { claim() { return Promise.resolve(); } },
  };
  vm.runInNewContext(source, {
    self, URL, Set, Promise,
    caches: {
      open: async () => ({ addAll: async () => { throw failure; } }),
      keys: async () => ['franz-lola-assets-old'],
      delete: async (name) => deleted.push(name),
    },
  });
  const event = { waitUntil(value) { this.wait = value; } };
  runtime.listeners.get('install')(event);
  await assert.rejects(event.wait, failure);
  assert.equal(skipWaitingCalls, 0);
  assert.deepEqual(deleted, []);
});
