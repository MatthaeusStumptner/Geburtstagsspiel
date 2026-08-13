import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

function requiredFinite(value, label, scenario) {
  assert.ok(Number.isFinite(value), `[${scenario}] ${label} must be a finite number`);
  return value;
}

export function assertVisualHealth(sample, scenario) {
  assert.ok(sample && typeof sample === 'object', `[${scenario}] visual health sample is missing`);
  const opaquePixels = requiredFinite(sample.opaquePixels, 'visual.opaquePixels', scenario);
  const uniqueColors = requiredFinite(sample.uniqueColors, 'visual.uniqueColors', scenario);
  const chromaPixels = requiredFinite(sample.chromaPixels, 'visual.chromaPixels', scenario);
  const luminanceRange = requiredFinite(sample.luminanceRange, 'visual.luminanceRange', scenario);
  assert.ok(opaquePixels >= 512, `[${scenario}] rendered canvas has insufficient opaque pixels`);
  assert.ok(uniqueColors >= 8, `[${scenario}] rendered canvas has insufficient color variation`);
  assert.ok(chromaPixels >= 32, `[${scenario}] rendered canvas is blank or gray (insufficient chroma)`);
  assert.ok(luminanceRange >= 32, `[${scenario}] rendered canvas has insufficient luminance range`);
  return { opaquePixels, uniqueColors, chromaPixels, luminanceRange };
}

export async function captureLocatorPngVisualHealth(locator, path, scenario) {
  if (!locator || typeof locator.screenshot !== 'function' || typeof locator.page !== 'function') {
    throw new TypeError(`[${scenario}] a Playwright locator is required`);
  }
  await locator.screenshot({ path, type: 'png', animations: 'allow' });
  const metadata = await stat(path);
  assert.ok(metadata.size > 0, `[${scenario}] saved compositor PNG is empty`);
  const png = await readFile(path);
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  const sample = await locator.page().evaluate(async (imageUrl) => {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    let opaquePixels = 0; let chromaPixels = 0; let minLuminance = 255; let maxLuminance = 0;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]; const green = pixels[index + 1]; const blue = pixels[index + 2]; const alpha = pixels[index + 3];
      if (alpha > 0) opaquePixels += 1;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) >= 12) chromaPixels += 1;
      const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
      minLuminance = Math.min(minLuminance, luminance); maxLuminance = Math.max(maxLuminance, luminance);
      colors.add(`${red >> 3},${green >> 3},${blue >> 3},${alpha >> 5}`);
    }
    return { opaquePixels, uniqueColors: colors.size, chromaPixels, luminanceRange: maxLuminance - minLuminance };
  }, dataUrl);
  return { sample: assertVisualHealth(sample, scenario), artifact: { path, bytes: metadata.size } };
}
