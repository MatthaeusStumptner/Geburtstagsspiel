const IDLE = 'idle';

export function createRenderScheduler({ render, pacer }) {
  let pendingReason = IDLE;
  let renderCount = 0;
  let hiddenSkips = 0;
  let lastReason = IDLE;

  function present(timestamp, fallbackReason) {
    const reason = pendingReason === IDLE ? fallbackReason : pendingReason;
    pendingReason = IDLE;
    render(reason, timestamp);
    renderCount += 1;
    lastReason = reason;
  }

  return Object.freeze({
    request(reason) {
      pendingReason = reason;
    },

    frame(timestamp, policy) {
      if (policy === 'hidden') {
        hiddenSkips += 1;
        pendingReason = IDLE;
        return;
      }
      if (policy === 'continuous') {
        if (pacer.shouldPresent(timestamp)) present(timestamp, 'continuous');
        return;
      }
      if (pendingReason !== IDLE) present(timestamp, pendingReason);
    },

    reset(timestamp) {
      pacer.reset(timestamp);
    },

    snapshot() {
      return Object.freeze({ pendingReason, renderCount, hiddenSkips, lastReason });
    },
  });
}
