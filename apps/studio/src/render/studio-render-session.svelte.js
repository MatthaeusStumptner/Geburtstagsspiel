import { actorAnimationState, animationById, animationDuration, animationKeyframes, stateAnimationId } from '@franz-lola/pixel-renderer';

const DEFAULT_SURFACE_ID = 'studio-level-canvas';
const AMBIENT_REASON = 'animation:ambient';
const STATIC_ACTIVITY = Object.freeze({ continuous: false, until: 0 });

const hasEffects = (value) => Array.isArray(value?.effects) && value.effects.length > 0;

function mergeActivity(...activities) {
  return activities.reduce((activity, next) => ({
    continuous: activity.continuous || Boolean(next?.continuous),
    until: Math.max(activity.until, Number(next?.until) || 0),
  }), STATIC_ACTIVITY);
}

function motionActivity(animation) {
  if (!animation?.type || animation.type === 'none') return STATIC_ACTIVITY;
  if (animation.type !== 'keyframes') return { continuous: true, until: 0 };
  const keyframes = animation.keyframes ?? [];
  if (keyframes.length <= 1) return STATIC_ACTIVITY;
  if (animation.loop !== false) return { continuous: true, until: 0 };
  return { continuous: false, until: Math.max(0.1, Number(animation.duration) || keyframes.at(-1)?.time || 1) };
}

function selectedAppearanceActivity(appearance, { animationId = '', state = 'idle' } = {}) {
  const animation = animationById(appearance, animationId) ?? animationById(appearance, stateAnimationId(appearance, state));
  const keyframes = animationKeyframes(animation);
  if (keyframes.length <= 1) return STATIC_ACTIVITY;
  if (animation.loop) return { continuous: true, until: 0 };
  return { continuous: false, until: animationDuration(animation) };
}

function directionName(direction) {
  return typeof direction === 'string' ? direction : direction?.name;
}

function walkerState(actor) {
  const current = actor?.direction ?? actor?.dir;
  if (directionName(current) === 'none') return actorAnimationState({ direction: actor?.nextDirection ?? actor?.nextDir });
  return actorAnimationState({ direction: current });
}

function actorActivity(actor, { state = 'idle', animationId = '', fallbackAnimated = false } = {}) {
  if (!actor) return STATIC_ACTIVITY;
  const appearance = actor.appearance;
  return mergeActivity(
    hasEffects(actor) ? { continuous: true, until: 0 } : STATIC_ACTIVITY,
    appearance ? selectedAppearanceActivity(appearance, { animationId, state }) : fallbackAnimated ? { continuous: true, until: 0 } : STATIC_ACTIVITY,
  );
}

function decorationActivity(item) {
  return mergeActivity(
    hasEffects(item) ? { continuous: true, until: 0 } : STATIC_ACTIVITY,
    motionActivity(item?.animation),
    selectedAppearanceActivity(item?.appearance, { animationId: item?.spriteAnimation ?? '', state: 'idle' }),
  );
}

function eventActivity(event, { showEvents }) {
  const visual = event?.visual;
  if (!visual || visual.type === 'none' || (!showEvents && visual.visibility !== 'always') || !visual.appearance) return STATIC_ACTIVITY;
  return mergeActivity(
    motionActivity(visual.animation),
    selectedAppearanceActivity(visual.appearance, { animationId: visual.spriteAnimation ?? '', state: 'idle' }),
  );
}

export function getLevelAnimationActivity(level, { showEvents = false, selections = [] } = {}) {
  if (!level) return STATIC_ACTIVITY;
  const activities = [];
  if (Array.isArray(level.theme?.edgeEffects) && level.theme.edgeEffects.length > 0) activities.push({ continuous: true, until: 0 });
  if (level.theme?.landmark === 'zauberberg') activities.push(motionActivity(level.theme.elements?.find((element) => element.id === 'stage-lights')?.animation));
  if (level.board?.walls?.some(hasEffects)) activities.push({ continuous: true, until: 0 });
  if (level.collectibles?.powerUps?.length) activities.push({ continuous: true, until: 0 });
  activities.push(...(level.decorations ?? []).map(decorationActivity));
  activities.push(actorActivity(level.actors?.player, { state: walkerState(level.actors?.player), animationId: level.actors?.player?.animation ?? '', fallbackAnimated: true }));
  activities.push(...(level.actors?.cats ?? []).map((cat) => actorActivity(cat, { state: actorAnimationState({ direction: cat?.dir }), animationId: cat?.animation ?? '' })));
  activities.push(...(level.actors?.characters ?? []).map((character) => actorActivity(character, { state: walkerState({ direction: character?.state }), animationId: character?.animation ?? '', fallbackAnimated: true })));
  activities.push(...(level.events ?? []).map((event) => eventActivity(event, { showEvents })));
  const primarySelection = Array.isArray(selections) ? selections.at(-1) : null;
  if (primarySelection && primarySelection.primary !== false) activities.push({ continuous: true, until: 0 });
  return mergeActivity(...activities);
}

export function hasAnimatedLevelContent(level, options) {
  const activity = getLevelAnimationActivity(level, options);
  return activity.continuous || activity.until > 0;
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
  let ambientContinuous = Boolean(active);
  let ambientUntil = 0;
  let reducedMotion = false;
  let reducedFramePending = false;
  let pendingOneShotVersion = 0;
  let destroyed = false;
  let invalidationVersion = 0;
  let measurement = null;
  let renderCount = 0;
  let lastRenderReason = 'idle';

  const ambientShouldRun = (timestamp = 0) => surfaceVisible
    && !reducedMotion
    && (ambientContinuous || ambientUntil > timestamp / 1000);

  function setCoordinatorState(state) {
    if (!destroyed) coordinator.setSurfaceState(id, state);
  }

  function queueAmbient() {
    if (!destroyed && surfaceVisible) coordinator.invalidate(id, AMBIENT_REASON);
  }

  function queueOneShot(reason) {
    if (destroyed) return false;
    invalidationVersion += 1;
    pendingOneShotVersion = invalidationVersion;
    if (surfaceVisible) setCoordinatorState({ active: true });
    coordinator.invalidate(id, reason);
    return surfaceVisible;
  }

  function clearAmbientWork() {
    if (destroyed || !surfaceVisible || pendingOneShotVersion || reducedFramePending) return;
    setCoordinatorState({ visible: false, active: false });
    setCoordinatorState({ visible: true, active: false });
  }

  function present(frame) {
    const presentedVersion = invalidationVersion;
    const presentedOneShotVersion = pendingOneShotVersion;
    render(Object.freeze({ ...frame, measurement }));
    renderCount += 1;
    lastRenderReason = frame.reason ?? 'idle';
    if (destroyed) return;
    if (pendingOneShotVersion === presentedOneShotVersion) pendingOneShotVersion = 0;
    if (reducedFramePending) {
      if (frame.reason === 'motion:reduced') reducedFramePending = false;
      else queueOneShot('motion:reduced');
    }
    if (ambientShouldRun(frame.timestamp)) {
      setCoordinatorState({ active: true });
      queueAmbient();
    } else if (presentedVersion === invalidationVersion && pendingOneShotVersion === 0 && !reducedFramePending) {
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
  if (ambientShouldRun()) queueAmbient();

  const session = {
    invalidate(reason) {
      return queueOneShot(reason);
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
      queueOneShot('visibility:visible');
    },

    setActive(nextActive) {
      session.setAnimationActivity({ continuous: Boolean(nextActive), until: 0 });
    },

    setAnimationActivity(nextActivity) {
      if (destroyed) return;
      const nextContinuous = Boolean(nextActivity?.continuous);
      const nextUntil = Math.max(0, Number(nextActivity?.until) || 0);
      if (nextContinuous === ambientContinuous && nextUntil === ambientUntil) return;
      ambientContinuous = nextContinuous;
      ambientUntil = nextUntil;
      if (ambientShouldRun()) {
        setCoordinatorState({ active: true });
        queueAmbient();
      } else if (!ambientContinuous && ambientUntil === 0) {
        clearAmbientWork();
      }
    },

    setReducedMotion(nextReducedMotion) {
      if (destroyed) return;
      const next = Boolean(nextReducedMotion);
      if (next === reducedMotion) return;
      reducedMotion = next;
      if (reducedMotion) {
        reducedFramePending = true;
        queueOneShot('motion:reduced');
      } else {
        setCoordinatorState({ active: true });
        queueOneShot('motion:full');
      }
    },

    resize(nextMeasurement) {
      if (destroyed) return;
      measurement = nextMeasurement;
      queueOneShot('layout:resize-observer');
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
        active: ambientContinuous || ambientUntil > 0,
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