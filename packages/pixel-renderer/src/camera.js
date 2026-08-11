const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function calculateCamera({
  worldWidth,
  worldHeight,
  viewport,
  target,
  zoom = 1,
  enabled = true,
}) {
  const safeWorldWidth = positive(worldWidth, 1);
  const safeWorldHeight = positive(worldHeight, 1);
  const safeViewport = {
    x: Number.isFinite(viewport?.x) ? viewport.x : 0,
    y: Number.isFinite(viewport?.y) ? viewport.y : 0,
    width: positive(viewport?.width, safeWorldWidth),
    height: positive(viewport?.height, safeWorldHeight),
  };

  if (!enabled) {
    const containScale = Math.min(safeViewport.width / safeWorldWidth, safeViewport.height / safeWorldHeight);
    const width = safeWorldWidth * containScale;
    const height = safeWorldHeight * containScale;
    return {
      viewport: {
        x: safeViewport.x + (safeViewport.width - width) / 2,
        y: safeViewport.y + (safeViewport.height - height) / 2,
        width,
        height,
      },
      source: { x: 0, y: 0, width: safeWorldWidth, height: safeWorldHeight },
      scale: containScale,
    };
  }

  const coverScale = Math.max(
    safeViewport.width / safeWorldWidth,
    safeViewport.height / safeWorldHeight,
  ) * positive(zoom, 1);
  const sourceWidth = Math.min(safeWorldWidth, safeViewport.width / coverScale);
  const sourceHeight = Math.min(safeWorldHeight, safeViewport.height / coverScale);
  const targetX = Number.isFinite(target?.x) ? target.x : safeWorldWidth / 2;
  const targetY = Number.isFinite(target?.y) ? target.y : safeWorldHeight / 2;
  const sourceX = clamp(targetX - sourceWidth / 2, 0, safeWorldWidth - sourceWidth);
  const sourceY = clamp(targetY - sourceHeight / 2, 0, safeWorldHeight - sourceHeight);

  return {
    viewport: safeViewport,
    source: { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight },
    scale: coverScale,
  };
}

export function snapCameraToTexels(camera, sceneScale = 1, worldWidth, worldHeight) {
  const scale = positive(sceneScale, 1);
  const step = 1 / scale;
  const maximumX = positive(worldWidth, camera.source.width);
  const maximumY = positive(worldHeight, camera.source.height);
  const maximumOriginX = Math.floor((maximumX - camera.source.width) / step) * step;
  const maximumOriginY = Math.floor((maximumY - camera.source.height) / step) * step;
  const snappedX = clamp(Math.round(camera.source.x / step) * step, 0, maximumOriginX);
  const snappedY = clamp(Math.round(camera.source.y / step) * step, 0, maximumOriginY);
  return { ...camera, source: { ...camera.source, x: snappedX, y: snappedY } };
}

export function projectWorldPoint(camera, point) {
  const { source } = camera;
  const { viewport } = camera;
  return {
    x: viewport.x + ((point.x - source.x) / source.width) * viewport.width,
    y: viewport.y + ((point.y - source.y) / source.height) * viewport.height,
  };
}

export function visibleWorldBounds(camera) {
  return {
    left: camera.source.x,
    top: camera.source.y,
    right: camera.source.x + camera.source.width,
    bottom: camera.source.y + camera.source.height,
  };
}
