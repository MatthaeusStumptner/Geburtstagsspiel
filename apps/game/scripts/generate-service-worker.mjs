import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OWNED_CACHE_PREFIX = 'franz-lola-assets-';
const DEFAULT_BASE_PATH = '/Geburtstagsspiel/';
const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));
export const gameRoot = resolve(moduleDirectory, '..');
export const outputPath = resolve(gameRoot, 'dist', 'sw.js');

function normalizeBasePath(basePath) {
  const normalized = String(basePath ?? DEFAULT_BASE_PATH).replaceAll('\\', '/');
  if (!normalized.startsWith('/') || !normalized.endsWith('/')) {
    throw new TypeError('Service worker base path must start and end with a slash.');
  }
  return normalized;
}

function normalizeAssetPaths(assetPaths) {
  if (!Array.isArray(assetPaths)) throw new TypeError('Generated asset paths must be an array.');
  const normalized = assetPaths.map((assetPath) => {
    let decodedPath = '';
    let unsafe = typeof assetPath !== 'string'
      || !assetPath.startsWith('/')
      || assetPath.startsWith('//')
      || !assetPath.includes('/assets/')
      || /[\\?#]/.test(assetPath)
      || /%(?:25|2f|5c)/i.test(assetPath);
    if (!unsafe) {
      try {
        decodedPath = decodeURIComponent(assetPath);
      } catch {
        unsafe = true;
      }
    }
    if (!unsafe) {
      unsafe = decodedPath.split('/').some((segment) => segment === '.' || segment === '..');
    }
    if (unsafe) throw new TypeError(`Invalid generated asset path: ${String(assetPath)}`);
    return assetPath;
  });
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

function validateCacheName(cacheName) {
  if (typeof cacheName !== 'string' || !new RegExp(`^${OWNED_CACHE_PREFIX}[a-z0-9]+$`).test(cacheName)) {
    throw new TypeError(`Invalid game asset cache name: ${String(cacheName)}`);
  }
  return cacheName;
}

export function buildServiceWorkerSource({ cacheName, assetPaths }) {
  const normalizedCacheName = validateCacheName(cacheName);
  const normalizedAssetPaths = normalizeAssetPaths(assetPaths);
  const cacheNameLiteral = JSON.stringify(normalizedCacheName);
  const assetPathsLiteral = JSON.stringify(normalizedAssetPaths);

  return `const CACHE_NAME = ${cacheNameLiteral};
const OWNED_CACHE_PREFIX = ${JSON.stringify(OWNED_CACHE_PREFIX)};
const ASSET_PATHS = ${assetPathsLiteral};
const ASSET_URLS = new Set(ASSET_PATHS.map((assetPath) => new URL(assetPath, self.location.origin).href));

function isCacheableAssetResponse(response) {
  if (!response || !response.ok) return false;
  if (response.type === 'basic') return true;
  return new URL(response.url).origin === self.location.origin;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then((cache) => cache.addAll(ASSET_PATHS))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((cacheNames) => Promise.all(cacheNames
      .filter((cacheName) => cacheName.startsWith(OWNED_CACHE_PREFIX) && cacheName !== CACHE_NAME)
      .map((cacheName) => caches.delete(cacheName))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const requestUrl = new URL(request.url);
  const networkOnly = request.mode === 'navigate'
    || request.destination === 'document'
    || /\.(?:html?|json)$/i.test(requestUrl.pathname);
  if (networkOnly) {
    event.respondWith(fetch(request));
    return;
  }
  if (requestUrl.origin !== self.location.origin) return;
  if (!ASSET_URLS.has(requestUrl.href)) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (isCacheableAssetResponse(response)) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // A cache quota failure must not break the running game asset.
      }
    }
    return response;
  }));
});
`;
}

async function listAssetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return listAssetFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  }));
  return files.flat();
}

export async function generateServiceWorker({
  distDirectory = resolve(gameRoot, 'dist'),
  assetsDirectory = resolve(gameRoot, 'dist', 'assets'),
  basePath = DEFAULT_BASE_PATH,
} = {}) {
  const normalizedBasePath = normalizeBasePath(basePath);
  const resolvedAssetsDirectory = resolve(assetsDirectory);
  const outputPath = join(resolve(distDirectory), 'sw.js');
  const assetFiles = (await listAssetFiles(resolvedAssetsDirectory))
    .filter((assetFile) => resolve(assetFile) !== outputPath)
    .sort((left, right) => left.localeCompare(right));
  const digest = createHash('sha256');
  const assetPaths = [];
  for (const assetFile of assetFiles) {
    const relativeAssetPath = relative(resolvedAssetsDirectory, assetFile).replaceAll('\\', '/');
    if (!relativeAssetPath || relativeAssetPath.startsWith('../')) throw new TypeError(`Asset escapes assets directory: ${assetFile}`);
    digest.update(relativeAssetPath);
    digest.update('\0');
    digest.update(await readFile(assetFile));
    digest.update('\0');
    assetPaths.push(`${normalizedBasePath}assets/${relativeAssetPath}`);
  }
  const cacheName = `${OWNED_CACHE_PREFIX}${digest.digest('hex')}`;
  const source = buildServiceWorkerSource({ cacheName, assetPaths });
  await writeFile(outputPath, source, 'utf8');
  return Object.freeze({ cacheName, assetPaths: Object.freeze(normalizeAssetPaths(assetPaths)), source });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  generateServiceWorker().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}