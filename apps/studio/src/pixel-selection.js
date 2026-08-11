const key = (x, y) => `${x}:${y}`;
const point = (value) => { const [x, y] = String(value).split(':').map(Number); return { x, y }; };

export function rectanglePixelKeys(start, end, width, height) {
  const left = Math.max(0, Math.min(start.x, end.x)); const right = Math.min(width - 1, Math.max(start.x, end.x));
  const top = Math.max(0, Math.min(start.y, end.y)); const bottom = Math.min(height - 1, Math.max(start.y, end.y));
  const result = [];
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) result.push(key(x, y));
  return result;
}

export function linePixelKeys(start, end, width, height) {
  let x = Math.round(start.x); let y = Math.round(start.y);
  const targetX = Math.round(end.x); const targetY = Math.round(end.y);
  const dx = Math.abs(targetX - x); const sx = x < targetX ? 1 : -1;
  const dy = -Math.abs(targetY - y); const sy = y < targetY ? 1 : -1;
  let error = dx + dy; const result = [];
  while (true) {
    if (x >= 0 && y >= 0 && x < width && y < height) result.push(key(x, y));
    if (x === targetX && y === targetY) break;
    const doubled = 2 * error;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
  }
  return result;
}

export function outlineRectanglePixelKeys(start, end, width, height, filled = false) {
  if (filled) return rectanglePixelKeys(start, end, width, height);
  const points = rectanglePixelKeys(start, end, width, height).map(point);
  const left = Math.min(start.x, end.x); const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y); const bottom = Math.max(start.y, end.y);
  return points.filter(({ x, y }) => x === left || x === right || y === top || y === bottom).map(({ x, y }) => key(x, y));
}

export function floodFillPixelKeys(rows, startOrX, startY) {
  const start = typeof startOrX === 'object' ? startOrX : { x: startOrX, y: startY };
  const height = rows.length; const width = rows[0]?.length ?? 0;
  if (start.x < 0 || start.y < 0 || start.x >= width || start.y >= height) return [];
  const token = rows[start.y][start.x]; const found = []; const visited = new Set(); const queue = [{ ...start }];
  while (queue.length) {
    const current = queue.shift(); const currentKey = key(current.x, current.y);
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    if (current.x < 0 || current.y < 0 || current.x >= width || current.y >= height || rows[current.y][current.x] !== token) continue;
    found.push(currentKey);
    queue.push({ x: current.x - 1, y: current.y }, { x: current.x + 1, y: current.y }, { x: current.x, y: current.y - 1 }, { x: current.x, y: current.y + 1 });
  }
  return found;
}

export function selectPixelRectangle(selection, start, end, width, height, additive = false) {
  return [...new Set([...(additive ? selection : []), ...rectanglePixelKeys(start, end, width, height)])];
}

export function selectPixelsByToken(rows, token) {
  const result = [];
  rows.forEach((row, y) => [...row].forEach((value, x) => { if (value === token) result.push(key(x, y)); }));
  return result;
}

export function invertPixelSelection(selection, width, height) {
  const selected = new Set(selection); const result = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (!selected.has(key(x, y))) result.push(key(x, y));
  return result;
}

export function applyTokenToSelection(rows, selection, token) {
  const next = [...rows];
  for (const value of selection) {
    const { x, y } = point(value); if (!next[y] || x < 0 || x >= next[y].length) continue;
    next[y] = `${next[y].slice(0, x)}${token}${next[y].slice(x + 1)}`;
  }
  return next;
}

export function moveSelectedPixels(rows, selection, dx, dy) {
  const height = rows.length; const width = rows[0]?.length ?? 0; const selected = new Set(selection);
  const moved = selection.map((value) => { const source = point(value); return { source, target: { x: source.x + dx, y: source.y + dy }, token: rows[source.y]?.[source.x] ?? '0' }; });
  if (moved.some(({ target }) => target.x < 0 || target.y < 0 || target.x >= width || target.y >= height)) return { rows, selection, moved: false };
  let next = rows.map((row, y) => [...row].map((token, x) => selected.has(key(x, y)) ? '0' : token).join(''));
  const nextSelection = [];
  for (const entry of moved) {
    const { x, y } = entry.target; next[y] = `${next[y].slice(0, x)}${entry.token}${next[y].slice(x + 1)}`; nextSelection.push(key(x, y));
  }
  return { rows: next, selection: nextSelection, moved: true };
}

export function copySelectedPixels(rows, selection) {
  if (!selection.length) return null;
  const points = selection.map(point);
  const left = Math.min(...points.map(({ x }) => x)); const top = Math.min(...points.map(({ y }) => y));
  const right = Math.max(...points.map(({ x }) => x)); const bottom = Math.max(...points.map(({ y }) => y));
  return {
    width: right - left + 1,
    height: bottom - top + 1,
    cells: points.map(({ x, y }) => ({ x: x - left, y: y - top, token: rows[y]?.[x] ?? '0' })),
    mask: points.map(({ x, y }) => key(x - left, y - top)),
  };
}

export function pasteSelectedPixels(rows, clipboard, originOrX = { x: 0, y: 0 }, originY) {
  if (!clipboard?.cells?.length) return { rows, selection: [], pasted: false };
  const origin = typeof originOrX === 'object' ? originOrX : { x: originOrX, y: originY };
  const height = rows.length; const width = rows[0]?.length ?? 0; const next = [...rows]; const selection = [];
  for (const cell of clipboard.cells) {
    const x = origin.x + cell.x; const y = origin.y + cell.y;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    next[y] = `${next[y].slice(0, x)}${cell.token}${next[y].slice(x + 1)}`;
    selection.push(key(x, y));
  }
  return { rows: next, selection, pasted: selection.length > 0 };
}
