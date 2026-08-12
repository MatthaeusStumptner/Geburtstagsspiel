const DEFAULT_SURFACE_ID = 'studio-level-canvas';
const AMBIENT_REASON = 'animation:ambient';

const hasEffects = (value) => Array.isArray(value?.effects) && value.effects.length > 0;
const animationFrames = (animation) => animation?.keyframes ?? animation?.frames ?? [];
const hasMotion = (value) => Boolean(value?.animation?.type && value.animation.type !== 'none')
  && (value.animation.type !== 'keyframes' || animationFrames(value.animation).length > 1);
const hasAppearanceAnimation = (value) => value?.appearance?.animations
  ?.some((animation) => animationFrames(animation).length > 1) ?? false;
const isAnimatedEntity = (value) => Boolean(value)
  && (hasEffects(value) || hasMotion(value) || hasAppearanceAnimation(value));

export function hasAnimatedLevelContent(level) {
  if (!level) return false;
  if (Array.isArray(level.theme?.edgeEffects) && level.theme.edgeEffects.length > 0) return true;
  if (level.theme?.elements?.some(hasMotion)) return true;
  if (level.board?.walls?.some(hasEffects)) return true;
  if (level.decorations?.some(isAnimatedEntity)) return true;
  if (isAnimatedEntity(level.actors?.player)) return true;
  if (level.actors?.cats?.some(isAnimatedEntity)) return true;
  if (level.actors?.characters?.some(isAnimatedEntity)) return true;
  return Boolean(level.events?.some((event) => isAnimatedEntity(event?.visual)));
}

export function createStudioRenderSession({
  coordinator,
  id = DEFAULT_SURFACE_ID,
  profile = 'editor',
  visible = true,
  active = false,
  render,
}) {
  if (!coordinator || typeof coordinator.registerSurface !== 'function') {
    throw new TypeError('coordinator is required');
  }
  if (typeof render !== 'function') throw new TypeError('render must be a function');

  let surfaceVisible = Boolean(visible);
  let ambientActive = Boolean(active);
  let reducedMotion = false;
  let destroyed = false;
  let invalidationVersion = 0;
  let measurement = null;
  let renderCount = 0;
  let lastRenderReason = 'idle';

  const ambientShouldRun = () => surfaceVisible && ambientActive && !reducedMotion;

  function setCoordinatorState(state) {
    if (!destroyed) coordinator.setSurfaceState(id, state);
  }

  function clearPendingAndSleep() {
    if (destroyed) return;
    setCoordinatorState({ visible: false, active: false });
    if (surfaceVisible) setCoordinatorState({ visible: true, active: false });
  }

  function present(frame) {
    const presentedVersion = invalidationVersion;
    render(Object.freeze({ ...frame, measurement }));
    renderCount += 1;
    lastRenderReason = frame.reason ?? 'idle';
    if (destroyed) return;
    if (ambientShouldRun()) {
      setCoordinatorState({ active: true });
      coordinator.invalidate(id, AMBIENT_REASON);
    } else if (presentedVersion === invalidationVersion) {
      setCoordinatorState({ active: false });
    }
  }

  coordinator.registerSurface({
    id,
    profile,
    visible: surfaceVisible,
    active: ambientShouldRun(),
    render: present,
  });
  if (ambientShouldRun()) coordinator.invalidate(id, AMBIENT_REASON);

  const session = {
    invalidate(reason) {
      if (destroyed) return false;
      invalidationVersion += 1;
      if (surfaceVisible) setCoordinatorState({ active: true });
      coordinator.invalidate(id, reason);
      return surfaceVisible;
    },

    setVisible(nextVisible) {
      if (destroyed) return;
      const next = Boolean(nextVisible);
      if (next === surfaceVisible) return;
      surfaceVisible = next;
      if (!surfaceVisible) {
        setCoordinatorState({ visible: false, active: false });
        return;
      }
      setCoordinatorState({ visible: true, active: ambientShouldRun() });
      session.invalidate('visibility:visible');
    },

    setActive(nextActive) {
      if (destroyed) return;
      const next = Boolean(nextActive);
      if (next === ambientActive) return;
      ambientActive = next;
      if (ambientShouldRun()) {
        setCoordinatorState({ active: true });
        session.invalidate(AMBIENT_REASON);
      } else {
        clearPendingAndSleep();
      }
    },

    setReducedMotion(nextReducedMotion) {
      if (destroyed) return;
      const next = Boolean(nextReducedMotion);
      if (next === reducedMotion) return;
      reducedMotion = next;
      if (ambientShouldRun()) {
        setCoordinatorState({ active: true });
        session.invalidate('motion:full');
      } else {
        clearPendingAndSleep();
      }
    },

    resize(nextMeasurement) {
      if (destroyed) return;
      measurement = nextMeasurement;
      session.invalidate('layout:resize-observer');
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      coordinator.unregisterSurface(id);
    },

    snapshot() {
      return Object.freeze({
        id,
        visible: surfaceVisible,
        active: ambientActive,
        reducedMotion,
        measurement,
        renderCount,
        lastRenderReason,
        destroyed,
      });
    },

    get renderCount() {
      return renderCount;
    },
  };

  return Object.freeze(session);
}
