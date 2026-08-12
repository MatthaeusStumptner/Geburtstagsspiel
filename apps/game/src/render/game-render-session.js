const IDLE = 'idle';
const SURFACE_ID = 'game';
const VALID_MODES = new Set(['continuous', 'hidden', 'once']);

function policyMode(policy) {
  const mode = typeof policy === 'string' ? policy : policy?.mode;
  if (!VALID_MODES.has(mode)) throw new Error(`unknown game render policy: ${mode}`);
  return mode;
}

export function createGameRenderSession({ coordinator, render }) {
  if (!coordinator || typeof coordinator.registerSurface !== 'function') {
    throw new TypeError('coordinator is required');
  }
  if (typeof render !== 'function') throw new TypeError('render must be a function');

  let mode = null;
  let visible = false;
  let active = false;
  let pendingReason = IDLE;
  let renderCount = 0;
  let hiddenSkips = 0;
  let lastReason = IDLE;

  function setSurfaceState(nextState) {
    const changed = Object.entries(nextState).some(([key, value]) => (key === 'visible' ? visible : active) !== value);
    if (!changed) return;
    coordinator.setSurfaceState(SURFACE_ID, nextState);
    if (Object.hasOwn(nextState, 'visible')) visible = nextState.visible;
    if (Object.hasOwn(nextState, 'active')) active = nextState.active;
  }

  function present({ timestamp }) {
    const reason = pendingReason === IDLE ? 'continuous' : pendingReason;
    pendingReason = IDLE;
    try {
      render(reason, timestamp);
    } catch (error) {
      if (mode !== 'hidden' && pendingReason === IDLE) pendingReason = reason;
      if (mode === 'once' && visible && pendingReason !== IDLE) {
        setSurfaceState({ active: true });
      }
      throw error;
    }
    renderCount += 1;
    lastReason = reason;
    if (mode === 'once' && pendingReason === IDLE) setSurfaceState({ active: false });
  }

  function registerSurface() {
    coordinator.registerSurface({
      id: SURFACE_ID,
      profile: 'game',
      visible,
      active,
      render: present,
    });
  }

  registerSurface();

  return Object.freeze({
    invalidate(reason) {
      if (mode !== 'hidden' && pendingReason === IDLE) pendingReason = reason;
      coordinator.invalidate(SURFACE_ID, reason);
      if (mode === 'once' && visible) setSurfaceState({ active: true });
    },

    frame(_timestamp, policy) {
      mode = policyMode(policy);
      if (mode === 'hidden') {
        hiddenSkips += 1;
        pendingReason = IDLE;
        setSurfaceState({ visible: false, active: false });
      } else if (mode === 'continuous') {
        setSurfaceState({ visible: true, active: true });
      } else {
        setSurfaceState({ visible: true, active: pendingReason !== IDLE });
      }
    },

    reset() {
      coordinator.unregisterSurface(SURFACE_ID);
      registerSurface();
    },

    snapshot() {
      return Object.freeze({ pendingReason, renderCount, hiddenSkips, lastReason });
    },
  });
}
