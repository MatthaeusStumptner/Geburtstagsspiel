function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

function positive(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

export function highestVisibleBlockerBottom(blockers, canvasTop = 0) {
  return blockers.reduce((bottom, blocker) => {
    const blockerBottom = Number(blocker?.bottom);
    if (!blocker?.visible || !Number.isFinite(blockerBottom)) return bottom;
    return Math.max(bottom, blockerBottom);
  }, positive(canvasTop));
}

function normalize(input) {
  const cssWidth = Math.max(1, rounded(positive(input.canvasWidth)));
  const canvasHeight = Math.max(1, rounded(positive(input.canvasHeight)));
  const devicePixelRatio = Math.max(1, rounded(positive(input.devicePixelRatio, 1)));
  const hudOverlap = input.mobile
    ? Math.max(0, positive(input.hudBottom) - positive(input.canvasTop))
    : 0;
  const safeBottom = input.mobile ? positive(input.safeBottom) : 0;
  const cssHeight = Math.max(1, rounded(canvasHeight - hudOverlap - safeBottom));

  return {
    cssWidth,
    cssHeight,
    viewport: { x: 0, y: 0, width: cssWidth, height: cssHeight },
    devicePixelRatio,
  };
}

function isEqual(left, right) {
  return left.cssWidth === right.cssWidth
    && left.cssHeight === right.cssHeight
    && left.devicePixelRatio === right.devicePixelRatio;
}

export function createGameplayLayout() {
  let revision = 0;
  let initialized = false;
  let current = {
    cssWidth: 1,
    cssHeight: 1,
    viewport: { x: 0, y: 0, width: 1, height: 1 },
    devicePixelRatio: 1,
  };

  function snapshot() {
    return Object.freeze({
      ...current,
      viewport: Object.freeze({ ...current.viewport }),
      revision,
    });
  }

  return Object.freeze({
    update(input) {
      const next = normalize(input);
      if (!initialized || !isEqual(current, next)) {
        current = next;
        initialized = true;
        revision += 1;
      }
      return snapshot();
    },
    snapshot,
  });
}
