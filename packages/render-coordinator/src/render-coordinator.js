import { RENDER_PROFILES } from './profiles.js';

function cloneSurface(surface) {
  return Object.freeze({
    id: surface.id,
    profile: surface.profileName,
    visible: surface.visible,
    active: surface.active,
    dirty: surface.dirty,
    lastReason: surface.lastReason,
    lastPresentedAt: surface.lastPresentedAt,
    counters: Object.freeze({ ...surface.counters }),
  });
}

function unknownSurface(id) {
  throw new Error(`unknown surface: ${id}`);
}

export function createRenderCoordinator({ requestFrame, cancelFrame, now }) {
  if (typeof requestFrame !== 'function' || typeof cancelFrame !== 'function' || typeof now !== 'function') {
    throw new TypeError('requestFrame, cancelFrame, and now functions are required');
  }

  const surfaces = new Map();
  let queuedHandle = null;

  function surfaceFor(id) {
    const surface = surfaces.get(id);
    if (!surface) unknownSurface(id);
    return surface;
  }

  function isRunnable(surface) {
    if (!surface.visible || !surface.active) return false;
    if (surface.profile.mode === 'manual') return false;
    return surface.profile.mode === 'continuous'
      || surface.profile.mode === 'animated'
      || surface.dirty;
  }

  function shouldPresent(surface, timestamp) {
    if (!isRunnable(surface)) return false;
    if (surface.profile.mode === 'on-demand') return surface.dirty;
    if (surface.profile.mode === 'continuous') return true;
    return surface.lastPresentedAt === null
      || timestamp - surface.lastPresentedAt >= 1000 / surface.profile.maxFps;
  }

  function updateQueue() {
    const shouldQueue = [...surfaces.values()].some(isRunnable);
    if (shouldQueue && queuedHandle === null) queuedHandle = requestFrame(presentFrame);
    if (!shouldQueue && queuedHandle !== null) {
      cancelFrame(queuedHandle);
      queuedHandle = null;
    }
  }

  function render(surface, timestamp) {
    const invalidationVersion = surface.invalidationVersion;
    const frame = Object.freeze({
      id: surface.id,
      profile: surface.profileName,
      timestamp,
      reason: surface.lastReason,
      renderCount: surface.counters.renders,
    });
    const tracksDirtyWork = surface.profile.mode === 'on-demand' || surface.profile.mode === 'manual';
    if (tracksDirtyWork) surface.dirty = false;

    try {
      surface.render(frame);
    } catch (error) {
      if (surfaces.get(surface.id) === surface && tracksDirtyWork && surface.invalidationVersion === invalidationVersion) {
        surface.dirty = true;
      }
      throw error;
    }

    if (surfaces.get(surface.id) !== surface) return;
    surface.lastPresentedAt = timestamp;
    surface.counters.renders += 1;
  }

  function presentFrame(timestamp) {
    queuedHandle = null;
    try {
      for (const surface of [...surfaces.values()]) {
        if (surfaces.get(surface.id) === surface && shouldPresent(surface, timestamp)) render(surface, timestamp);
      }
    } finally {
      updateQueue();
    }
  }

  function registerSurface({ id, profile, render: renderCallback, visible = true, active = true }) {
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('surface id must be a non-empty string');
    if (surfaces.has(id)) throw new Error(`surface already registered: ${id}`);
    if (!Object.hasOwn(RENDER_PROFILES, profile)) throw new Error(`unknown render profile: ${profile}`);
    if (typeof renderCallback !== 'function') throw new TypeError('surface render must be a function');
    if (typeof visible !== 'boolean' || typeof active !== 'boolean') throw new TypeError('visible and active must be booleans');

    const surface = {
      id,
      profileName: profile,
      profile: RENDER_PROFILES[profile],
      render: renderCallback,
      visible,
      active,
      dirty: false,
      lastReason: null,
      lastPresentedAt: null,
      invalidationVersion: 0,
      counters: { renders: 0, invalidations: 0 },
    };
    surfaces.set(id, surface);
    updateQueue();
    return cloneSurface(surface);
  }

  function invalidate(id, reason) {
    const surface = surfaceFor(id);
    if (!surface.dirty) surface.lastReason = reason;
    surface.dirty = true;
    surface.invalidationVersion += 1;
    surface.counters.invalidations += 1;
    updateQueue();
    return cloneSurface(surface);
  }

  function setSurfaceState(id, state) {
    const surface = surfaceFor(id);
    if (!state || typeof state !== 'object') throw new TypeError('surface state must be an object');
    for (const key of Object.keys(state)) {
      if (key !== 'visible' && key !== 'active') throw new Error(`unknown surface state: ${key}`);
      if (typeof state[key] !== 'boolean') throw new TypeError(`surface state ${key} must be a boolean`);
    }
    if (Object.hasOwn(state, 'visible')) {
      surface.visible = state.visible;
      if (!surface.visible) surface.dirty = false;
    }
    if (Object.hasOwn(state, 'active')) surface.active = state.active;
    updateQueue();
    return cloneSurface(surface);
  }

  function unregisterSurface(id) {
    surfaceFor(id);
    surfaces.delete(id);
    updateQueue();
  }

  function presentNow(id, timestamp = now()) {
    const surface = surfaceFor(id);
    if (surface.profile.mode !== 'manual') throw new Error(`surface is not manual: ${id}`);
    if (!Number.isFinite(timestamp)) throw new TypeError('timestamp must be finite');
    render(surface, timestamp);
    updateQueue();
    return cloneSurface(surface);
  }

  function snapshot() {
    const entries = Object.fromEntries([...surfaces.entries()].map(([id, surface]) => [id, cloneSurface(surface)]));
    return Object.freeze({ surfaces: Object.freeze(entries) });
  }

  return Object.freeze({
    registerSurface,
    unregisterSurface,
    invalidate,
    setSurfaceState,
    presentNow,
    snapshot,
  });
}
