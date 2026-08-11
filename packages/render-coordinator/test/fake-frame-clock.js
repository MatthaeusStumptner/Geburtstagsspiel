export function createFakeFrameClock() {
  let timestamp = 0;
  let nextHandle = 1;
  let pending = null;

  return {
    adapter: {
      requestFrame(callback) {
        if (pending) throw new Error('fake frame clock already has a queued callback');
        pending = { callback, handle: nextHandle };
        nextHandle += 1;
        return pending.handle;
      },
      cancelFrame(handle) {
        if (pending?.handle === handle) pending = null;
      },
      now() {
        return timestamp;
      },
    },
    present(nextTimestamp) {
      timestamp = nextTimestamp;
      const frame = pending;
      pending = null;
      if (frame) frame.callback(timestamp);
    },
    pendingCount() {
      return pending ? 1 : 0;
    },
  };
}
