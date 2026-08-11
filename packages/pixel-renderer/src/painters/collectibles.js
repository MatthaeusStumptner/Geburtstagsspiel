const coordinateCache = new WeakMap();

function collectibleCoordinates(values) {
  if (!values || typeof values !== 'object') return [];
  if (!(values instanceof Set)) return Array.from(values, (key) => String(key).split(',').map(Number));
  const cached = coordinateCache.get(values);
  if (cached?.size === values.size) return cached.coordinates;
  const coordinates = Array.from(values, (key) => String(key).split(',').map(Number));
  coordinateCache.set(values, { size: values.size, coordinates });
  return coordinates;
}

export function drawCollectibles(context, { pellets = [], powerUps = [] }, tileSize, elapsed = 0) {
  context.fillStyle = '#f4c552';
  for (const [x, y] of collectibleCoordinates(pellets)) {
    const size = (x + y) % 3 === 0 ? 4 : 3;
    context.fillRect(x * tileSize + (tileSize - size) / 2, y * tileSize + (tileSize - size) / 2, size, size);
  }
  for (const [x, y] of collectibleCoordinates(powerUps)) {
    const px = x * tileSize + tileSize / 2; const py = y * tileSize + tileSize / 2;
    const glow = 0.55 + Math.sin(elapsed * 6) * 0.18; context.fillStyle = `rgba(76, 224, 179, ${glow})`;
    context.fillRect(px - 4, py - 2, 8, 7); context.fillRect(px - 6, py - 6, 3, 3); context.fillRect(px - 1, py - 8, 3, 3); context.fillRect(px + 4, py - 6, 3, 3);
  }
}

function drawKingfisher(context, event, tile, elapsed, active) {
  const px = event.visual.x * tile; const py = event.visual.y * tile + (active ? Math.round(Math.sin(elapsed * 10) * 3) : 0);
  context.fillStyle = '#082b38'; context.fillRect(px - 5, py + 8, 17, 2);
  context.fillStyle = '#31b7cf'; context.fillRect(px - 4, py - 5, 11, 11);
  context.fillStyle = '#176e91'; context.fillRect(px - 6, py - 2, 7, 8);
  context.fillStyle = '#ef9146'; context.fillRect(px + 1, py + 1, 8, 6);
  context.fillStyle = '#f1d05c'; context.fillRect(px + 7, py - 3, 7, 2);
  context.fillStyle = '#07141b'; context.fillRect(px + 5, py - 4, 2, 2);
}

function drawPaw(context, event, tile, active) {
  const px = event.visual.x * tile; const py = event.visual.y * tile;
  context.fillStyle = active ? event.visual.accent : event.visual.color; context.globalAlpha = 0.82;
  context.fillRect(px - 6, py - 1, 12, 9); context.fillRect(px - 10, py - 8, 5, 5); context.fillRect(px - 3, py - 11, 5, 5); context.fillRect(px + 5, py - 8, 5, 5); context.globalAlpha = 1;
}

function drawBell(context, event, tile, elapsed, active) {
  const px = event.visual.x * tile; const py = event.visual.y * tile; const swing = active ? Math.round(Math.sin(elapsed * 18) * 2) : 0;
  context.fillStyle = '#8f6c2e'; context.fillRect(px - 5 + swing, py + 2, 10, 2);
  context.fillStyle = event.visual.accent; context.fillRect(px - 7 + swing, py + 4, 14, 8); context.fillRect(px - 9 + swing, py + 11, 18, 3);
  context.fillStyle = '#fff0b0'; context.fillRect(px - 3 + swing, py + 5, 3, 5);
}

function drawCustomEvent(context, event, tile, active) {
  const px = event.visual.x * tile; const py = event.visual.y * tile; context.fillStyle = active ? event.visual.accent : event.visual.color;
  context.font = `${Math.max(8, Math.round(tile * 0.7))}px monospace`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(event.visual.label, px, py);
}

function drawSpriteEvent(context, event, tile, elapsed, active) {
  const px = event.visual.x * tile; const py = event.visual.y * tile;
  context.save();
  applyMotionAnimation(context, event.visual.animation, elapsed, px, py, tile);
  if (active) { context.shadowColor = event.visual.accent; context.shadowBlur = tile * 0.45; }
  drawPixelSprite(context, event.visual.appearance, {
    left: px - tile * 0.75,
    top: py - tile * 0.75,
    width: tile * 1.5,
    height: tile * 1.5,
  }, { animationId: event.visual.spriteAnimation, elapsed });
  context.restore();
}

export function drawEasterEggs(context, level, eggs = {}, elapsed = 0) {
  const tile = level.board.tileSize;
  if (!level.events?.length) {
    if (eggs.ilzvogel) drawKingfisher(context, { visual: { x: 0.375, y: 6 } }, tile, elapsed, eggs.active === 'ilzvogel');
    if (eggs.hundewiese) drawPaw(context, { visual: { x: level.board.columns / 2, y: level.board.rows * 0.488, color: '#75a27c', accent: '#f5c451' } }, tile, eggs.active === 'hundewiese');
    return;
  }
  const unlocked = eggs.unlocked instanceof Set ? eggs.unlocked : new Set(eggs.unlocked ?? []);
  const activeId = eggs.active ?? '';
  level.events.forEach((event) => {
    const visible = eggs.showAll || event.visual.visibility === 'always' || unlocked.has(event.id) || activeId === event.id;
    if (!visible || event.visual.type === 'none') return;
    const active = activeId === event.id;
    if (event.visual.appearance) drawSpriteEvent(context, event, tile, elapsed, active);
    else if (event.visual.type === 'kingfisher') drawKingfisher(context, event, tile, elapsed, active);
    else if (event.visual.type === 'paw') drawPaw(context, event, tile, active);
    else if (event.visual.type === 'bell') drawBell(context, event, tile, elapsed, active);
    else drawCustomEvent(context, event, tile, active);
  });
  if (eggs.showZones) {
    context.save(); context.fillStyle = 'rgba(245, 196, 81, 0.18)'; context.strokeStyle = 'rgba(245, 196, 81, 0.75)'; context.lineWidth = 1;
    level.events.filter((event) => event.trigger.type === 'zone').flatMap((event) => event.trigger.zones).forEach((zone) => { context.fillRect(zone.x * tile, zone.y * tile, zone.width * tile, zone.height * tile); context.strokeRect(zone.x * tile + 0.5, zone.y * tile + 0.5, zone.width * tile - 1, zone.height * tile - 1); });
    context.restore();
  }
}

import { drawPixelSprite } from './sprites.js';
import { applyMotionAnimation } from '../motion-animation.js';
