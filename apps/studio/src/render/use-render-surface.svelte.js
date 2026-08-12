import { getContext } from 'svelte';
import { createStudioRenderSession } from './studio-render-session.svelte.js';

export const STUDIO_RENDER_COORDINATOR_CONTEXT = Symbol.for('franz-lola.studio.render-coordinator');

const readVisible = (value) => Boolean(typeof value === 'function' ? value() : value);
const NOOP_OBSERVER = Object.freeze({ observe() {}, disconnect() {} });
const observerFrom = (factory, callback) => typeof factory === 'function' ? factory(callback) ?? NOOP_OBSERVER : NOOP_OBSERVER;
const disconnect = (observer) => observer?.disconnect?.();

function browserEnvironment() {
  return {
    devicePixelRatio: () => globalThis.devicePixelRatio ?? 1,
    documentVisible: () => globalThis.document?.visibilityState !== 'hidden',
    subscribeDocumentVisibility(callback) {
      const document = globalThis.document;
      if (!document?.addEventListener) return () => {};
      document.addEventListener('visibilitychange', callback);
      return () => document.removeEventListener('visibilitychange', callback);
    },
    createResizeObserver: (callback) => typeof globalThis.ResizeObserver === 'function' ? new globalThis.ResizeObserver(callback) : null,
    createIntersectionObserver: (callback) => typeof globalThis.IntersectionObserver === 'function' ? new globalThis.IntersectionObserver(callback) : null,
    reducedMotionQuery: () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null,
  };
}

function measurementFrom(entry, environment) {
  const rect = entry?.contentRect ?? entry;
  const borderBox = Array.isArray(entry?.borderBoxSize) ? entry.borderBoxSize[0] : entry?.borderBoxSize;
  return Object.freeze({
    width: Math.max(1, Number(borderBox?.inlineSize ?? rect?.width) || 1),
    height: Math.max(1, Number(borderBox?.blockSize ?? rect?.height) || 1),
    devicePixelRatio: Math.max(1, Number(environment.devicePixelRatio()) || 1),
    reason: 'resize-observer',
  });
}

export function createRenderSurfaceLifecycle({
  coordinator,
  id,
  profile,
  visible = true,
  render,
  environment = browserEnvironment(),
}) {
  let workspaceVisible = readVisible(visible);
  let intersectionVisible = true;
  let documentVisible = environment.documentVisible?.() !== false;
  let surfaceProfile = profile;
  let ambientActive = false;
  let session = null;
  let mounted = false;
  let destroyed = false;
  let pendingReason = 'surface:mount';

  const updateVisibility = () => session?.setVisible(workspaceVisible && intersectionVisible && documentVisible);

  const lifecycle = {
    action(node) {
      if (mounted) throw new Error(`render surface already mounted: ${id}`);
      mounted = true;
      destroyed = false;
      documentVisible = environment.documentVisible?.() !== false;
      let resizeObserver = null;
      let intersectionObserver = null;
      let motionQuery = null;
      let updateReducedMotion = null;
      let unsubscribeDocumentVisibility = null;
      const cleanup = () => {
        disconnect(resizeObserver);
        disconnect(intersectionObserver);
        motionQuery?.removeEventListener?.('change', updateReducedMotion);
        motionQuery?.removeListener?.(updateReducedMotion);
        unsubscribeDocumentVisibility?.();
        session?.destroy();
        session = null;
        mounted = false;
      };

      try {
        session = createStudioRenderSession({
          coordinator,
          id,
          profile: surfaceProfile,
          visible: workspaceVisible && intersectionVisible && documentVisible,
          active: ambientActive,
          render,
        });
        motionQuery = environment.reducedMotionQuery?.() ?? null;
        updateReducedMotion = (event = motionQuery) => session?.setReducedMotion(Boolean(event?.matches));
        updateReducedMotion();
        const initialRect = node.getBoundingClientRect();
        session.resize(measurementFrom(initialRect, environment));
        if (pendingReason) {
          session.invalidate(pendingReason);
          pendingReason = null;
        }

        resizeObserver = observerFrom(environment.createResizeObserver, (entries) => {
          const entry = entries[0];
          if (entry) session?.resize(measurementFrom(entry, environment));
        });
        intersectionObserver = observerFrom(environment.createIntersectionObserver, (entries) => {
          intersectionVisible = Boolean(entries[0]?.isIntersecting);
          updateVisibility();
        });
        resizeObserver.observe?.(node);
        intersectionObserver.observe?.(node);
        motionQuery?.addEventListener?.('change', updateReducedMotion);
        motionQuery?.addListener?.(updateReducedMotion);
        unsubscribeDocumentVisibility = environment.subscribeDocumentVisibility?.(() => {
          documentVisible = environment.documentVisible?.() !== false;
          updateVisibility();
        }) ?? null;
        updateVisibility();
      } catch (error) {
        cleanup();
        throw error;
      }

      return {
        destroy() {
          if (destroyed) return;
          destroyed = true;
          cleanup();
        },
      };
    },

    invalidate(reason) {
      if (destroyed) return false;
      if (!session) {
        pendingReason = pendingReason ?? reason;
        return false;
      }
      return session.invalidate(reason);
    },

    setVisible(nextVisible) {
      workspaceVisible = readVisible(nextVisible);
      updateVisibility();
    },

    setActive(nextActive) {
      ambientActive = Boolean(nextActive);
      session?.setActive(ambientActive);
    },

    setProfile(nextProfile) {
      surfaceProfile = nextProfile;
      session?.setProfile(nextProfile);
    },

    setAnimationActivity(nextActivity) {
      ambientActive = Boolean(nextActivity?.continuous) || (Number(nextActivity?.until) || 0) > 0;
      session?.setAnimationActivity(nextActivity);
    },

    snapshot() {
      return session?.snapshot() ?? Object.freeze({
        id,
        profile: surfaceProfile,
        visible: workspaceVisible && intersectionVisible && documentVisible,
        active: ambientActive,
        destroyed,
      });
    },
  };

  return Object.freeze(lifecycle);
}

export function useRenderSurface(options) {
  const contextValue = getContext(STUDIO_RENDER_COORDINATOR_CONTEXT);
  const coordinator = typeof contextValue === 'function' ? contextValue() : contextValue;
  if (!coordinator) throw new Error('studio render coordinator context is missing');
  return createRenderSurfaceLifecycle({ ...options, coordinator });
}
