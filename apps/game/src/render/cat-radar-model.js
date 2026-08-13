const hiddenRadar = () => ({ visible: false, indicators: [] });

function finitePoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function finiteViewport(value) {
  return finitePoint(value)
    && Number.isFinite(value.width)
    && value.width > 0
    && Number.isFinite(value.height)
    && value.height > 0;
}

function validPresentedCat(cat) {
  return cat
    && typeof cat.id === 'string'
    && cat.id.trim() === cat.id
    && cat.id.length > 0
    && finitePoint(cat.screen)
    && typeof cat.onScreen === 'boolean'
    && Number.isFinite(cat.distance)
    && cat.distance >= 0
    && typeof cat.color === 'string'
    && cat.color.trim() === cat.color
    && cat.color.length > 0
    && Number.isFinite(cat.respawnTimer)
    && cat.respawnTimer >= 0;
}

const roundThree = (value) => Math.round(value * 1000) / 1000;

function projectIndicator(viewport, playerScreen, cat) {
  const centerX = viewport.x + viewport.width / 2;
  const centerY = viewport.y + viewport.height / 2;
  const dx = cat.screen.x - playerScreen.x;
  const dy = cat.screen.y - playerScreen.y;
  const horizontalInset = Math.min(28, viewport.width * 0.08);
  const verticalInset = Math.min(26, viewport.height * 0.1);
  const distance = Math.max(1, Math.round(cat.distance));

  let x = centerX;
  let y = centerY;
  let angle = 0;
  let zeroVector = dx === 0 && dy === 0;
  if (!zeroVector) {
    const horizontalFactor = dx > 0
      ? (viewport.x + viewport.width - horizontalInset - centerX) / dx
      : dx < 0
        ? (viewport.x + horizontalInset - centerX) / dx
        : Number.POSITIVE_INFINITY;
    const verticalFactor = dy > 0
      ? (viewport.y + viewport.height - verticalInset - centerY) / dy
      : dy < 0
        ? (viewport.y + verticalInset - centerY) / dy
        : Number.POSITIVE_INFINITY;
    const factor = Math.min(horizontalFactor, verticalFactor);
    if (!Number.isFinite(factor) || factor < 0) zeroVector = true;
    else {
      x += dx * factor;
      y += dy * factor;
      angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    }
  }

  const hidden = cat.onScreen || cat.respawnTimer > 0 || zeroVector;
  return {
    id: cat.id,
    hidden,
    x: roundThree(x),
    y: roundThree(y),
    angle: roundThree(angle),
    distance,
    danger: distance <= 5,
    color: cat.color,
  };
}

export function calculateCatRadar(frame, options = {}) {
  if (options.active !== true) return hiddenRadar();
  const viewport = frame?.camera?.viewport;
  const playerScreen = frame?.player?.screen;
  const cats = frame?.cats;
  if (!finiteViewport(viewport) || !finitePoint(playerScreen) || !Array.isArray(cats) || !cats.every(validPresentedCat)
    || new Set(cats.map((cat) => cat.id)).size !== cats.length) {
    return hiddenRadar();
  }

  const indicators = cats.map((cat) => projectIndicator(viewport, playerScreen, cat));
  return {
    visible: indicators.some((indicator) => !indicator.hidden),
    indicators,
  };
}
