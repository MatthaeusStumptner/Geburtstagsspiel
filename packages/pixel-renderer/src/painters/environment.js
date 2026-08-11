import { drawPixelSprite } from './sprites.js';
import { drawLevelEdgeEffects } from './edge-effects.js';
import { applyMotionAnimation } from '../motion-animation.js';
import { layoutCanvasText } from '../text-layout.js';
import { drawWithVisualEffects } from '../visual-effects.js';

function isWall(grid, x, y) {
  return Boolean(grid[y]?.[x]);
}

function drawStreetTile(context, level, grid, x, y) {
  const { tileSize } = level.board;
  const px = x * tileSize;
  const py = y * tileSize;
  const { palette } = level.theme;
  const shade = (x * 17 + y * 11) % palette.ground.length;
  context.fillStyle = palette.ground[shade];
  context.fillRect(px, py, tileSize, tileSize);
  context.fillStyle = shade % 2 ? '#23333d' : '#202f38';
  if ((x * 5 + y * 7) % 3 === 0) context.fillRect(px + tileSize / 6, py + tileSize / 5, 2, 1);
  if ((x * 7 + y * 3) % 5 === 0) context.fillRect(px + tileSize * 0.66, py + tileSize * 0.7, 3, 1);
  context.fillStyle = palette.curb;
  if (isWall(grid, x, y - 1)) context.fillRect(px, py, tileSize, 2);
  if (isWall(grid, x, y + 1)) context.fillRect(px, py + tileSize - 2, tileSize, 2);
  if (isWall(grid, x - 1, y)) context.fillRect(px, py, 2, tileSize);
  if (isWall(grid, x + 1, y)) context.fillRect(px + tileSize - 2, py, 2, tileSize);
}

function wallInstanceAt(level, x, y) {
  for (let index = level.board.walls.length - 1; index >= 0; index -= 1) {
    const wall = level.board.walls[index];
    if (x >= wall.x && x < wall.x + wall.width && y >= wall.y && y < wall.y + wall.height) return wall;
  }
  return null;
}

function drawBuildingTileGeometry(context, level, grid, x, y, wall = wallInstanceAt(level, x, y)) {
  const { tileSize, columns } = level.board;
  const px = x * tileSize;
  const py = y * tileSize;
  const { palette } = level.theme;
  if (x === 0 || x === columns - 1) {
    context.fillStyle = palette.water;
    context.fillRect(px, py, tileSize, tileSize);
    context.fillStyle = '#167b8e';
    context.fillRect(px + ((y * 7) % 8), py + tileSize * 0.25, tileSize / 2, 2);
    context.fillRect(px + ((y * 11 + 5) % 9), py + tileSize * 0.66, tileSize * 0.42, 2);
    return;
  }

  const pattern = wall?.pattern ?? 'theme';
  const tone = wall?.useThemeColor === false && wall.color ? wall.color : palette.walls[(x * 3 + y * 5) % palette.walls.length];
  const accent = wall?.accent ?? '#48707a';
  const opacity = Number.isFinite(wall?.opacity) ? Math.max(0.15, Math.min(1, wall.opacity)) : 1;
  context.save();
  context.globalAlpha *= opacity;
  context.fillStyle = '#0e2733';
  context.fillRect(px, py, tileSize, tileSize);
  context.fillStyle = tone;
  context.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
  context.fillStyle = accent;
  if (!isWall(grid, x, y - 1)) context.fillRect(px + 2, py, tileSize - 4, 3);
  if (!isWall(grid, x - 1, y)) context.fillRect(px, py + 2, 3, tileSize - 4);

  if (pattern === 'brick') {
    for (let row = 6; row < tileSize - 2; row += 6) context.fillRect(px + 2, py + row, tileSize - 4, 1);
    context.fillRect(px + tileSize / 2, py + 2, 1, 5);
    context.fillRect(px + tileSize / 3, py + 8, 1, 6);
    context.fillRect(px + tileSize * 0.68, py + 14, 1, 6);
  } else if (pattern === 'metal') {
    context.fillRect(px + tileSize * 0.28, py + 3, 2, tileSize - 6);
    context.fillRect(px + tileSize * 0.7, py + 3, 1, tileSize - 6);
  } else if (pattern !== 'solid') {
    if ((x * 13 + y * 7) % 9 === 0 || pattern === 'windows') {
      context.fillStyle = wall?.accent ?? '#d0a94d';
      context.fillRect(px + tileSize * 0.34, py + tileSize * 0.3, tileSize * 0.3, tileSize * 0.25);
    } else if ((x + y) % 4 === 0) {
      context.fillStyle = accent;
      context.fillRect(px + tileSize * 0.3, py + tileSize * 0.34, tileSize * 0.38, 2);
    }
  }
  context.restore();
}

function drawBuildingTile(context, level, grid, x, y, elapsed = 0) {
  const { tileSize, columns } = level.board;
  if (x === 0 || x === columns - 1) return drawBuildingTileGeometry(context, level, grid, x, y, null);
  const wall = wallInstanceAt(level, x, y);
  const bounds = { left: x * tileSize, top: y * tileSize, width: tileSize, height: tileSize };
  return drawWithVisualEffects(context, wall?.effects, bounds, elapsed, () => drawBuildingTileGeometry(context, level, grid, x, y, wall));
}

function isAnimatedBuildingTile(level, x, y) {
  return x !== 0 && x !== level.board.columns - 1 && Boolean(wallInstanceAt(level, x, y)?.effects?.length);
}

function drawDogPark(context, level, grid) {
  const { columns, rows, tileSize } = level.board;
  const fromX = Math.floor(columns / 2) - 2;
  const fromY = Math.floor(rows / 2) - 2;
  for (let y = fromY; y <= fromY + 4; y += 1) {
    for (let x = fromX; x <= fromX + 4; x += 1) {
      if (grid[y]?.[x]) continue;
      context.fillStyle = (x + y) % 2 ? '#16382f' : '#183d33';
      context.globalAlpha = 0.72;
      context.fillRect(x * tileSize + 2, y * tileSize + 2, tileSize - 4, tileSize - 4);
    }
  }
  context.globalAlpha = 1;
}

function drawHome(context, level) {
  const { columns, tileSize } = level.board;
  const width = 7 * tileSize;
  const left = (columns * tileSize - width) / 2;
  const top = 5.4 * tileSize;
  context.fillStyle = '#201b17';
  context.fillRect(left + 6, top + 22, width - 12, 79);
  context.fillStyle = '#8a6a45';
  context.fillRect(left + 12, top + 29, width - 24, 65);
  context.fillStyle = '#4f3528';
  for (let step = 0; step < 6; step += 1) context.fillRect(left + 10 + step * 12, top + 18 - step * 3, width - 20 - step * 24, 6);
  context.fillStyle = '#d8b85a';
  context.fillRect(left + 28, top + 43, 18, 15);
  context.fillRect(left + width - 46, top + 43, 18, 15);
  context.fillStyle = '#4a332b';
  context.fillRect(left + width / 2 - 11, top + 58, 22, 36);
}

function drawBschuett(context, level) {
  const { columns, rows, tileSize } = level.board;
  const width = 5.5 * tileSize;
  const height = 5.5 * tileSize;
  const left = (columns * tileSize - width) / 2;
  const top = (rows * tileSize - height) / 2;
  context.fillStyle = '#194b3b';
  context.fillRect(left, top, width, height);
  context.strokeStyle = '#83bfa0';
  context.lineWidth = 2;
  context.strokeRect(left + 3, top + 3, width - 6, height - 6);
  context.beginPath();
  context.moveTo(left + width / 2, top + 3);
  context.lineTo(left + width / 2, top + height - 3);
  context.stroke();
  context.fillStyle = '#718184';
  context.fillRect(left + 10, top + 24, 24, 5);
  context.fillRect(left + width - 38, top + height - 29, 24, 5);
}

function drawFactory(context, level) {
  const { columns, tileSize } = level.board;
  const width = 7 * tileSize;
  const height = 4.9 * tileSize;
  const left = (columns * tileSize - width) / 2;
  const top = 5.25 * tileSize;
  context.fillStyle = '#321f1b';
  context.fillRect(left + 3, top + 8, width - 6, height - 8);
  context.fillStyle = '#8a4d38';
  context.fillRect(left + 8, top + 17, width - 16, height - 22);
  context.fillStyle = '#4d2f28';
  for (let row = 0; row < 8; row += 1) context.fillRect(left + 8, top + 29 + row * 10, width - 16, 1);
  context.fillStyle = '#221a1a';
  context.fillRect(left + 20, top - 9, 18, 27);
  context.fillRect(left + width - 39, top - 2, 13, 20);
  context.fillStyle = '#e2a750';
  for (const x of [left + 24, left + 58, left + width - 70, left + width - 36]) context.fillRect(x, top + 38, 14, 12);
}

function themeElementAnimation(level, id, fallback) {
  return level.theme.elements?.find((element) => element.id === id)?.animation ?? fallback;
}

function stageBounds(level) {
  const { columns, tileSize } = level.board;
  const width = 9 * tileSize;
  const height = 5.6 * tileSize;
  return { tileSize, width, height, left: (columns * tileSize - width) / 2, top: 4.55 * tileSize };
}

function drawStageBackdrop(context, level) {
  const { width, height, left, top } = stageBounds(level);
  context.fillStyle = '#0b0810';
  context.fillRect(left + 4, top + 9, width - 8, height - 9);
  context.fillStyle = '#34203f';
  context.fillRect(left + 12, top + 17, width - 24, height - 28);
}

function drawStageLights(context, level, elapsed) {
  const { tileSize, width, height, left, top } = stageBounds(level);
  context.save(); context.globalAlpha = 0.16; applyMotionAnimation(context, themeElementAnimation(level, 'stage-lights', { type: 'none', speed: 1, amplitude: 0.15 }), elapsed, left + width / 2, top + height / 2, tileSize);
  zauberbergSpotlightPolygons(left, top, width, height).forEach(({ color, points }) => {
    context.fillStyle = color; context.beginPath(); context.moveTo(...points[0]); points.slice(1).forEach((point) => context.lineTo(...point)); context.closePath(); context.fill();
  });
  context.restore();
}

function drawStageForeground(context, level) {
  const { width, height, left, top } = stageBounds(level);
  context.fillStyle = '#131018';
  context.fillRect(left + 15, top + 43, 28, 65);
  context.fillRect(left + width - 43, top + 43, 28, 65);
  context.fillStyle = '#9d4778';
  [left + 23, left + width - 35].forEach((speakerX) => { context.fillRect(speakerX, top + 54, 12, 12); context.fillRect(speakerX, top + 79, 12, 12); });
  context.fillStyle = '#17101c'; context.fillRect(left + 54, top + height - 35, 31, 25); context.fillRect(left + width - 85, top + height - 35, 31, 25);
}

function drawStage(context, level, elapsed) {
  drawStageBackdrop(context, level);
  drawStageLights(context, level, elapsed);
  drawStageForeground(context, level);
}

export function zauberbergSpotlightPolygons(left, top, width, height) {
  return [
    { color: '#ff4f87', points: [[left + 35, top + 20], [left + 74, top + height + 78], [left + 112, top + height + 78]] },
    { color: '#55d9dd', points: [[left + width - 35, top + 20], [left + width - 112, top + height + 78], [left + width - 70, top + height + 78]] },
  ];
}

export function drawEnvironmentBase(context, level, grid) {
  const { columns, rows, tileSize } = level.board;
  context.fillStyle = '#0b1620';
  context.fillRect(0, 0, columns * tileSize, rows * tileSize);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!grid[y][x]) drawStreetTile(context, level, grid, x, y);
      else if (!isAnimatedBuildingTile(level, x, y)) drawBuildingTileGeometry(context, level, grid, x, y);
    }
  }
}

export function drawEnvironmentAnimation(context, level, grid, elapsed = 0) {
  const { columns, rows } = level.board;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (grid[y][x] && isAnimatedBuildingTile(level, x, y)) drawBuildingTile(context, level, grid, x, y, elapsed);
    }
  }
  drawLevelEdgeEffects(context, level, elapsed);
}

export function drawEnvironmentMidground(context, level, grid) {
  if (level.theme.landmark === 'zauberberg') drawStageBackdrop(context, level);
  else if (level.theme.landmark === 'bschuett') drawBschuett(context, level);
  else if (level.theme.landmark === 'tabakfabrik') drawFactory(context, level);
  else drawDogPark(context, level, grid);
  if (level.theme.landmark === 'brahmahof-home') drawHome(context, level);
}

export function drawEnvironmentLandmarkAnimation(context, level, elapsed = 0) {
  if (level.theme.landmark === 'zauberberg') drawStageLights(context, level, elapsed);
}

export function drawEnvironmentForeground(context, level) {
  if (level.theme.landmark === 'zauberberg') drawStageForeground(context, level);
}

export function drawEnvironment(context, level, grid, elapsed = 0, options = {}) {
  const { columns, rows, tileSize } = level.board;
  context.fillStyle = '#0b1620';
  context.fillRect(0, 0, columns * tileSize, rows * tileSize);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (grid[y][x]) drawBuildingTile(context, level, grid, x, y, elapsed);
      else drawStreetTile(context, level, grid, x, y);
    }
  }
  drawLevelEdgeEffects(context, level, elapsed);
  if (level.theme.landmark === 'bschuett') drawBschuett(context, level);
  else if (level.theme.landmark === 'tabakfabrik') drawFactory(context, level);
  else if (level.theme.landmark === 'zauberberg') drawStage(context, level, elapsed);
  else drawDogPark(context, level, grid);
  if (level.theme.landmark === 'brahmahof-home') drawHome(context, level);
  if (!options.excludeDecorations) drawDecorations(context, level, elapsed, options.language, { excludeText: options.excludeText });
}

export function drawDecorations(context, level, elapsed, language = 'standard', { excludeText = false, onlyText = false } = {}) {
  const tile = level.board.tileSize;
  level.decorations.forEach((item) => {
    if ((excludeText && item.type === 'text') || (onlyText && item.type !== 'text')) return;
    drawDecoration(context, item, tile, elapsed, language);
  });
}

export function drawDecoration(context, item, tile, elapsed = 0, language = 'standard') {
    const left = item.x * tile;
    const top = item.y * tile;
    const width = item.width * tile;
    const height = item.height * tile;
    context.save();
    const animation = item.animation ?? { type: 'none', speed: 1, amplitude: 0.15 };
    const centerX = left + width / 2; const centerY = top + height / 2;
    applyMotionAnimation(context, animation, elapsed, centerX, centerY, tile);
    drawWithVisualEffects(context, item.effects, { left, top, width, height }, elapsed, () => {
    context.fillStyle = item.color;
    if (item.type === 'text') {
      const style = item.textStyle ?? {};
      const padding = (Number(style.padding) || 0) * tile;
      const textWidth = Math.max(1, width - padding * 2);
      const fontSize = Math.max(4, (Number(style.fontSize) || 0.5) * tile);
      const value = item.content?.[language] || item.content?.standard || item.label || '';
      const backgroundOpacity = Math.max(0, Math.min(1, Number.isFinite(style.backgroundOpacity) ? style.backgroundOpacity : 0.88));
      if (backgroundOpacity > 0) {
        context.save(); context.globalAlpha *= backgroundOpacity; context.fillStyle = style.background || '#071016';
        context.fillRect(left, top, width, height); context.restore();
      }
      const borderOpacity = Math.max(0, Math.min(1, Number.isFinite(style.borderOpacity) ? style.borderOpacity : 0));
      if (borderOpacity > 0) {
        context.save(); context.globalAlpha *= borderOpacity; context.strokeStyle = style.borderColor || item.color; context.lineWidth = Math.max(1, tile * 0.06); context.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1); context.restore();
      }
      context.fillStyle = item.color; context.font = `600 ${fontSize}px "Courier New", monospace`; context.textAlign = style.align || 'center'; context.textBaseline = 'top';
      const lineHeight = fontSize * 1.18;
      const lines = layoutCanvasText(context, style.uppercase ? value.toUpperCase() : value, textWidth, lineHeight);
      const blockHeight = lines.length * lineHeight;
      const startY = style.verticalAlign === 'top' ? top + padding : style.verticalAlign === 'bottom' ? top + height - padding - blockHeight : top + (height - blockHeight) / 2;
      const textX = style.align === 'left' ? left + padding : style.align === 'right' ? left + width - padding : left + width / 2;
      context.beginPath(); context.rect(left + padding, top + padding, textWidth, Math.max(1, height - padding * 2)); context.clip();
      lines.forEach((line, index) => context.fillText(line, textX, startY + index * lineHeight, textWidth));
    } else if (item.appearance && drawPixelSprite(context, item.appearance, { left, top, width, height }, { animationId: item.spriteAnimation ?? '', state: 'idle', elapsed })) {
      // Freely authored sprite objects use the same animation format as actors.
    } else if (item.type === 'tree') {
      context.fillStyle = '#5c3b2a'; context.fillRect(left + width * 0.43, top + height * 0.48, Math.max(2, width * 0.14), height * 0.42);
      context.fillStyle = item.color; context.fillRect(left + width * 0.2, top + height * 0.08, width * 0.6, height * 0.55);
    } else if (item.type === 'bench') {
      context.fillRect(left + width * 0.12, top + height * 0.46, width * 0.76, Math.max(3, height * 0.16));
      context.fillRect(left + width * 0.2, top + height * 0.62, 3, height * 0.22); context.fillRect(left + width * 0.76, top + height * 0.62, 3, height * 0.22);
    } else if (item.type === 'lamp') {
      context.fillRect(left + width * 0.47, top + height * 0.25, Math.max(2, width * 0.08), height * 0.65);
      context.fillStyle = '#f5c451'; context.fillRect(left + width * 0.32, top + height * 0.08, width * 0.38, height * 0.25);
    } else if (item.type === 'flower') {
      context.fillRect(left + width * 0.46, top + height * 0.42, 2, height * 0.4);
      context.fillStyle = '#f5c451'; context.fillRect(left + width * 0.32, top + height * 0.22, width * 0.36, height * 0.3);
    } else if (item.type === 'water') {
      context.globalAlpha = 0.72; context.fillRect(left + 2, top + 2, width - 4, height - 4);
      context.fillStyle = 'rgba(255,255,255,.28)'; context.fillRect(left + width * 0.15, top + height * 0.38, width * 0.55, 2);
    } else if (item.type === 'rock') {
      context.fillRect(left + width * 0.2, top + height * 0.3, width * 0.62, height * 0.5);
    } else {
      context.font = `${Math.max(8, Math.floor(Math.min(width, height) * 0.55))}px monospace`;
      context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(item.label || '◆', left + width / 2, top + height / 2);
    }
    if (item.type === 'sign') {
      context.fillRect(left + width * 0.46, top + height * 0.48, Math.max(2, width * 0.08), height * 0.42);
      context.fillRect(left + width * 0.08, top + height * 0.08, width * 0.84, height * 0.45);
      context.fillStyle = '#071016'; context.font = `${Math.max(5, Math.floor(tile * 0.22))}px monospace`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(item.label.slice(0, 12), left + width / 2, top + height * 0.3);
    }
    context.restore();
    });
}

export function drawDecorationPreview(context, item, bounds, elapsed = 0, language = 'standard') {
  const scaleX = bounds.width / Math.max(1, item.width);
  const scaleY = bounds.height / Math.max(1, item.height);
  const tile = Math.max(1, Math.floor(Math.min(scaleX, scaleY)));
  const previewItem = {
    ...item,
    x: (bounds.left + (bounds.width - item.width * tile) / 2) / tile,
    y: (bounds.top + (bounds.height - item.height * tile) / 2) / tile,
  };
  drawDecoration(context, previewItem, tile, elapsed, language);
}

export function drawEditorGrid(context, level) {
  const { columns, rows, tileSize } = level.board;
  context.save();
  context.strokeStyle = 'rgba(255,255,255,0.16)';
  context.lineWidth = 1;
  for (let x = 0; x <= columns; x += 1) {
    context.beginPath();
    context.moveTo(x * tileSize + 0.5, 0);
    context.lineTo(x * tileSize + 0.5, rows * tileSize);
    context.stroke();
  }
  for (let y = 0; y <= rows; y += 1) {
    context.beginPath();
    context.moveTo(0, y * tileSize + 0.5);
    context.lineTo(columns * tileSize, y * tileSize + 0.5);
    context.stroke();
  }
  context.restore();
}
