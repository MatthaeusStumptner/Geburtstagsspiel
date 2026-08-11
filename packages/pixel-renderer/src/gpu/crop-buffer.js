const finiteDimension = (value, fallback = 1) => Math.max(1, Math.ceil(Number(value) || fallback));

export function resolveStableCropSize({
  sceneWidth,
  sceneHeight,
  sourceWidth,
  sourceHeight,
  currentWidth = 1,
  currentHeight = 1,
  quantum = 32,
}) {
  const maximumWidth = finiteDimension(sceneWidth);
  const maximumHeight = finiteDimension(sceneHeight);
  const step = finiteDimension(quantum, 32);
  const requestedWidth = Math.min(maximumWidth, Math.ceil((finiteDimension(sourceWidth) + 2) / step) * step);
  const requestedHeight = Math.min(maximumHeight, Math.ceil((finiteDimension(sourceHeight) + 2) / step) * step);
  return {
    width: Math.min(maximumWidth, Math.max(requestedWidth, finiteDimension(currentWidth))),
    height: Math.min(maximumHeight, Math.max(requestedHeight, finiteDimension(currentHeight))),
  };
}
