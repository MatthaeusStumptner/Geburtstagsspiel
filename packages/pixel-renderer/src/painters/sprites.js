import { selectAppearanceFrame } from '../animation.js';

const spriteRasterCache = new WeakMap();

function createRasterCanvas(context, width, height) {
  const document = context.canvas?.ownerDocument ?? globalThis.document;
  if (!document?.createElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawPixels(context, appearance, pixels, left, top, scale) {
  for (let y = 0; y < pixels.length; y += 1) {
    const row = pixels[y];
    let runColor = null;
    let runStart = 0;
    for (let x = 0; x <= row.length; x += 1) {
      const token = x < row.length ? row[x] : '';
      const paletteIndex = token ? Number.parseInt(token, 36) : -1;
      const pixelColor = appearance.palette[paletteIndex];
      const color = pixelColor && pixelColor !== 'transparent' ? pixelColor : null;
      if (color === runColor) continue;
      if (runColor) {
        context.fillStyle = runColor;
        context.fillRect(left + runStart * scale, top + y * scale, (x - runStart) * scale, scale);
      }
      runColor = color;
      runStart = x;
    }
  }
}

function cachedSpriteRaster(context, appearance, pixels, scale) {
  if (!context.drawImage || !pixels || typeof pixels !== 'object') return null;
  let appearanceCache = spriteRasterCache.get(appearance);
  if (!appearanceCache || appearanceCache.palette !== appearance.palette) {
    appearanceCache = { palette: appearance.palette, frames: new WeakMap() };
    spriteRasterCache.set(appearance, appearanceCache);
  }
  let scales = appearanceCache.frames.get(pixels);
  if (!scales) {
    scales = new Map();
    appearanceCache.frames.set(pixels, scales);
  }
  if (scales.has(scale)) return scales.get(scale);
  const raster = createRasterCanvas(context, appearance.width * scale, appearance.height * scale);
  const rasterContext = raster?.getContext?.('2d');
  if (!rasterContext) return null;
  rasterContext.imageSmoothingEnabled = false;
  drawPixels(rasterContext, appearance, pixels, 0, 0, scale);
  scales.set(scale, raster);
  return raster;
}

export function drawPixelSprite(context, appearance, bounds, { animationId = '', state = 'idle', elapsed = 0 } = {}) {
  if (!appearance) return false;
  const availableWidth = Math.max(1, Number(bounds.width) || appearance.width);
  const availableHeight = Math.max(1, Number(bounds.height) || appearance.height);
  const scale = Math.max(1, Math.floor(Math.min(availableWidth / appearance.width, availableHeight / appearance.height)));
  const width = appearance.width * scale;
  const height = appearance.height * scale;
  const left = Math.round((Number(bounds.left) || 0) + (availableWidth - width) / 2);
  const top = Math.round((Number(bounds.top) || 0) + (availableHeight - height) / 2);
  const pixels = selectAppearanceFrame(appearance, { animationId, state, elapsed });
  if (!pixels) return false;
  const raster = cachedSpriteRaster(context, appearance, pixels, scale);
  if (raster) {
    context.imageSmoothingEnabled = false;
    context.drawImage(raster, left, top);
  } else {
    drawPixels(context, appearance, pixels, left, top, scale);
  }
  return true;
}

export function drawActorAppearance(context, actor, tileSize, options = {}) {
  return drawPixelSprite(context, actor?.appearance, {
    left: actor.x * tileSize + tileSize * 0.05,
    top: actor.y * tileSize + tileSize * 0.05,
    width: tileSize * 0.9,
    height: tileSize * 0.9,
  }, options);
}
