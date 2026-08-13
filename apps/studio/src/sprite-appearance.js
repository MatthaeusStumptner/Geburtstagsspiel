const clone = (value) => JSON.parse(JSON.stringify(value));

export const SPRITE_SIZES = Object.freeze([8, 12, 16, 24]);

export function normalizeSpriteSize(value, fallback = 24) {
  const size = Math.round(Number(value));
  return SPRITE_SIZES.includes(size) ? size : fallback;
}

export function resizePixelRows(rows, sourceWidth, sourceHeight, targetWidth, targetHeight = targetWidth) {
  const width = Math.max(1, Math.round(Number(sourceWidth) || 1));
  const height = Math.max(1, Math.round(Number(sourceHeight) || 1));
  const nextWidth = normalizeSpriteSize(targetWidth);
  const nextHeight = normalizeSpriteSize(targetHeight, nextWidth);
  const source = Array.from({ length: height }, (_, y) => String(rows?.[y] ?? '').padEnd(width, '0').slice(0, width));
  return Array.from({ length: nextHeight }, (_, y) => {
    const sourceY = Math.min(height - 1, Math.floor(y * height / nextHeight));
    return Array.from({ length: nextWidth }, (_, x) => {
      const sourceX = Math.min(width - 1, Math.floor(x * width / nextWidth));
      return source[sourceY][sourceX] ?? '0';
    }).join('');
  });
}

export function resizeAppearance(input, targetSize) {
  const appearance = clone(input);
  const sourceWidth = Math.max(1, Number(appearance.width) || appearance.pixels?.[0]?.length || 1);
  const sourceHeight = Math.max(1, Number(appearance.height) || appearance.pixels?.length || 1);
  const size = normalizeSpriteSize(targetSize);
  const resize = (pixels) => resizePixelRows(pixels, sourceWidth, sourceHeight, size, size);
  appearance.width = size;
  appearance.height = size;
  appearance.pixels = resize(appearance.pixels);
  appearance.animations = (appearance.animations ?? []).map((animation) => ({
    ...animation,
    frames: (animation.frames ?? []).map((frame) => ({ ...frame, pixels: resize(frame.pixels) })),
    keyframes: (animation.keyframes ?? []).map((frame) => ({ ...frame, pixels: resize(frame.pixels) })),
  }));
  return appearance;
}
