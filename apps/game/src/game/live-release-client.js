import { installPublishedLevels } from './level-catalog.js';

function publisherUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return '';
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

export async function loadLiveRelease({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {}) {
  const base = publisherUrl(baseUrl);
  if (!base || typeof fetchImpl !== 'function') return { source: 'embedded', reason: 'publisher-unavailable' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${base}/api/live/current`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Live-Inhalte antworten mit ${response.status}.`);
    const manifest = await response.json();
    if (manifest?.kind !== 'franz-lola-live-release' || manifest?.schemaVersion !== 1 || !Array.isArray(manifest.levels)) throw new Error('Unbekanntes Live-Release-Format.');
    installPublishedLevels(manifest.levels.map((entry) => entry.document));
    return { source: 'live', releaseId: manifest.id, createdAt: manifest.createdAt };
  } catch (error) {
    return { source: 'embedded', reason: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error) };
  } finally { clearTimeout(timer); }
}
