import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';

const preparedCache = new Map();
const maximumCacheEntries = 256;

function remember(key, prepared) {
  if (preparedCache.has(key)) preparedCache.delete(key);
  preparedCache.set(key, prepared);
  if (preparedCache.size > maximumCacheEntries) preparedCache.delete(preparedCache.keys().next().value);
  return prepared;
}

function fallbackLines(context, value, maximumWidth) {
  const paragraphs = String(value ?? '').split('\n');
  const lines = [];
  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      return;
    }
    words.forEach((word) => {
      const current = lines.at(-1);
      const next = current ? `${current} ${word}` : word;
      if (current !== undefined && context.measureText(next).width > maximumWidth) lines.push(word);
      else if (current !== undefined) lines[lines.length - 1] = next;
      else lines.push(word);
    });
  });
  return lines.length ? lines : [''];
}

export function layoutCanvasText(context, value, maximumWidth, lineHeight) {
  const text = String(value ?? '');
  const font = context.font;
  const key = `${font}\u0000${text}`;
  try {
    const prepared = preparedCache.get(key) ?? remember(key, prepareWithSegments(text, font, { whiteSpace: 'pre-wrap' }));
    const result = layoutWithLines(prepared, Math.max(1, maximumWidth), lineHeight);
    return result.lines.length ? result.lines.map((line) => line.text) : [''];
  } catch {
    // Pretext relies on Canvas and Intl.Segmenter. The fallback keeps non-browser
    // test environments usable, while browsers use the cached Unicode layout.
    return fallbackLines(context, text, maximumWidth);
  }
}

export function clearCanvasTextLayoutCache() {
  preparedCache.clear();
}
