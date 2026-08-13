import { loadLiveRelease } from './game/live-release-client.js';

async function start() {
  const content = await loadLiveRelease({ baseUrl: import.meta.env.VITE_PUBLISHER_URL });
  globalThis.__GASSI_CONTENT_RELEASE__ = Object.freeze(content);
  await import('./main.js');
}

void start();