export async function registerGameServiceWorker({ navigator, baseUrl, production }) {
  if (!production || typeof navigator?.serviceWorker?.register !== 'function') return null;
  try {
    return await navigator.serviceWorker.register(new URL('sw.js', baseUrl).href);
  } catch {
    return null;
  }
}