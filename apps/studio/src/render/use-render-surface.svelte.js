import { getContext } from 'svelte';
import { createStudioRenderSession } from './studio-render-session.svelte.js';

export const STUDIO_RENDER_COORDINATOR_CONTEXT = Symbol.for('franz-lola.studio.render-coordinator');

const readVisible = (value) => Boolean(typeof value === 'function' ? value() : value);

function browserEnvironment() {
  return {
    devicePixelRatio: () => globalThis.devicePixelRatio ?? 1,
    createResizeObserver: (callback) => new ResizeObserver(callback),
    createIntersectionObserver: (callback) => new IntersectionObserver(callback),
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
  let ambientActive = false;
  let session = null;
  let mounted = false;
  let destroyed = false;
  let pendingReason = 'surface:mount';

  const updateVisibility = () => session?.setVisible(workspaceVisible && intersectionVisible);

  const lifecycle = {
    action(node) {
      if (mounted) throw new Error(`render surface already mounted: ${id}`);
      mounted = true;
      session = createStudioRenderSession({
        coordinator,
        id,
        profile,
        visible: workspaceVisible && intersectionVisible,
        active: ambientActive,
        render,
      });

      const motionQuery = environment.reducedMotionQuery();
      const updateReducedMotion = (event = motionQuery) => session?.setReducedMotion(Boolean(event?.matches));
      updateReducedMotion();
      const initialRect = node.getBoundingClientRect();
      session.resize(measurementFrom(initialRect, environment));
      if (pendingReason) {
        session.invalidate(pendingReason);
        pendingReason = null;
      }

      const resizeObserver = environment.createResizeObserver((entries) => {
        const entry = entries[0];
        if (entry?.contentRect) session?.resize(measurementFrom(entry, environment));
      });
      const intersectionObserver = environment.createIntersectionObserver((entries) => {
        intersectionVisible = Boolean(entries[0]?.isIntersecting);
        updateVisibility();
      });
      resizeObserver.observe(node);
      intersectionObserver.observe(node);
      motionQuery?.addEventListener?.('change', updateReducedMotion);
      motionQuery?.addListener?.(updateReducedMotion);

      return {
        destroy() {
          if (destroyed) return;
          destroyed = true;
          resizeObserver.disconnect();
          intersectionObserver.disconnect();
          motionQuery?.removeEventListener?.('change', updateReducedMotion);
          motionQuery?.removeListener?.(updateReducedMotion);
          session?.destroy();
          session = null;
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

    snapshot() {
      return session?.snapshot() ?? Object.freeze({
        id,
        visible: workspaceVisible && intersectionVisible,
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
