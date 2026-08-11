export const STUDIO_WORKSPACES = ['level', 'objects', 'characters', 'cutscenes', 'events', 'playtest', 'publish'];

const ROUTE_KEYS = {
  levelId: 'level',
  workspace: 'workspace',
  selection: 'selection',
  assetId: 'asset',
  eventId: 'event',
  cutsceneId: 'cutscene',
  trackId: 'track',
  keyframeId: 'keyframe',
};
const ROUTE_FIELDS = Object.keys(ROUTE_KEYS);
const STORAGE_KEY = 'franz-lola:studio-route:v1';
const clean = (value) => String(value ?? '').trim().slice(0, 160);

export function normalizeStudioRoute(route = {}, fallback = {}) {
  const requestedWorkspace = clean(route.workspace || fallback.workspace || 'level');
  return {
    levelId: clean(route.levelId || fallback.levelId),
    workspace: STUDIO_WORKSPACES.includes(requestedWorkspace) ? requestedWorkspace : 'level',
    selection: clean(route.selection),
    assetId: clean(route.assetId),
    eventId: clean(route.eventId),
    cutsceneId: clean(route.cutsceneId),
    trackId: clean(route.trackId),
    keyframeId: clean(route.keyframeId),
  };
}

function asUrl(value) {
  if (value instanceof URL) return new URL(value.href);
  return new URL(String(value), 'http://studio.local/');
}

export function parseStudioRoute(value, fallback = {}) {
  const url = asUrl(value);
  const hasRoute = Object.values(ROUTE_KEYS).some((key) => url.searchParams.has(key));
  if (!hasRoute) return null;
  return normalizeStudioRoute({
    levelId: url.searchParams.get(ROUTE_KEYS.levelId) || fallback.levelId,
    workspace: url.searchParams.get(ROUTE_KEYS.workspace) || fallback.workspace,
    selection: url.searchParams.get(ROUTE_KEYS.selection),
    assetId: url.searchParams.get(ROUTE_KEYS.assetId),
    eventId: url.searchParams.get(ROUTE_KEYS.eventId),
    cutsceneId: url.searchParams.get(ROUTE_KEYS.cutsceneId),
    trackId: url.searchParams.get(ROUTE_KEYS.trackId),
    keyframeId: url.searchParams.get(ROUTE_KEYS.keyframeId),
  }, fallback);
}

export function buildStudioUrl(value, route) {
  const url = asUrl(value);
  const normalized = normalizeStudioRoute(route);
  for (const key of Object.values(ROUTE_KEYS)) url.searchParams.delete(key);
  for (const field of ROUTE_FIELDS) {
    const content = normalized[field];
    if (content) url.searchParams.set(ROUTE_KEYS[field], content);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function sameStudioRoute(left, right) {
  const a = normalizeStudioRoute(left);
  const b = normalizeStudioRoute(right);
  return ROUTE_FIELDS.every((field) => a[field] === b[field]);
}

export class StudioRouter {
  constructor({ window = globalThis.window, storage = globalThis.localStorage, storageKey = STORAGE_KEY } = {}) {
    this.window = window;
    this.storage = storage;
    this.storageKey = storageKey;
    this.route = null;
    this.listener = null;
    this.onPopState = () => {
      const next = parseStudioRoute(this.window.location, this.route ?? {});
      if (!next) return;
      this.route = next;
      this.write(next);
      this.listener?.(next);
    };
  }

  read(fallback) {
    try {
      const value = JSON.parse(this.storage?.getItem(this.storageKey) ?? 'null');
      return value && typeof value === 'object' ? normalizeStudioRoute(value, fallback) : null;
    } catch {
      return null;
    }
  }

  write(route) {
    try { this.storage?.setItem(this.storageKey, JSON.stringify(route)); } catch { /* Storage can be unavailable in private mode. */ }
  }

  commit(route, replace) {
    const nextUrl = buildStudioUrl(this.window.location, route);
    this.window.history[replace ? 'replaceState' : 'pushState'](null, '', nextUrl);
    this.route = route;
    this.write(route);
  }

  start(fallback, listener) {
    this.listener = listener;
    const fromUrl = parseStudioRoute(this.window.location, fallback);
    const initial = fromUrl ?? this.read(fallback) ?? normalizeStudioRoute(fallback);
    this.route = initial;
    if (!fromUrl) this.commit(initial, true);
    else this.write(initial);
    this.window.addEventListener('popstate', this.onPopState);
    this.listener?.(initial);
    return () => this.stop();
  }

  sync(route, { replace = false } = {}) {
    const next = normalizeStudioRoute(route);
    const current = parseStudioRoute(this.window.location, this.route ?? next) ?? this.route;
    if (current && sameStudioRoute(current, next)) {
      this.route = next;
      this.write(next);
      return false;
    }
    const changedPlace = !current || current.levelId !== next.levelId || current.workspace !== next.workspace;
    this.commit(next, replace || !changedPlace);
    return true;
  }

  stop() {
    this.window?.removeEventListener('popstate', this.onPopState);
    this.listener = null;
  }
}
