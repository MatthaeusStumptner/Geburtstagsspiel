import { animationById } from '../animation.js';
import { drawActorAppearance } from './sprites.js';

const DIRECTIONS = Object.freeze({
  left: { name: 'left', x: -1, y: 0 }, right: { name: 'right', x: 1, y: 0 },
  up: { name: 'up', x: 0, y: -1 }, down: { name: 'down', x: 0, y: 1 }, none: { name: 'none', x: 0, y: 0 },
});
const directionOf = (direction) => typeof direction === 'string' ? DIRECTIONS[direction] ?? DIRECTIONS.none : direction?.name ? direction : DIRECTIONS.none;

function drawDog(context, px, py, direction, elapsed) {
  const wiggle = Math.sin(elapsed * 18) > 0 ? 1 : -1;
  context.fillStyle = 'rgba(1, 5, 8, 0.4)'; context.fillRect(px - 7, py + 5, 14, 3);
  context.fillStyle = '#d8b27b'; context.fillRect(px - 6, py - 3, 12, 9);
  context.fillStyle = '#f1d7aa'; context.fillRect(px - 4 + direction.x * 5, py - 6 + direction.y * 4, 9, 8);
  context.fillStyle = '#a97548';
  context.fillRect(px - 6 + direction.x * 5, py - 5 + direction.y * 4, 3, 6);
  context.fillRect(px + 4 + direction.x * 4, py - 5 + direction.y * 4, 3, 6);
  context.fillStyle = '#2b211b'; context.fillRect(px + direction.x * 8 - 1, py - 2 + direction.y * 7, 3, 3);
  context.fillStyle = '#d8b27b'; context.fillRect(px - direction.x * 8 + wiggle * direction.y, py - direction.y * 8 + wiggle * direction.x, 4, 3);
}

export function drawWalker(context, player, tileSize, { elapsed = 0, hitTimer = 0 } = {}) {
  const current = directionOf(player.direction ?? player.dir);
  const queued = directionOf(player.nextDirection ?? player.nextDir);
  const direction = current.name === 'none' ? queued : current;
  if (hitTimer > 0 && Math.floor(hitTimer * 10) % 2 === 0) return;
  const state = direction.name === 'none' ? 'idle' : direction.name;
  if (drawActorAppearance(context, player, tileSize, { animationId: player.animation ?? '', state, elapsed })) return;
  const px = Math.round(player.x * tileSize + tileSize / 2);
  const py = Math.round(player.y * tileSize + tileSize / 2);
  const dir = direction.name === 'none' ? DIRECTIONS.left : direction;
  const sideX = -dir.y; const sideY = dir.x;
  const dogX = Math.round(px - dir.x * 11 + sideX * 8); const dogY = Math.round(py - dir.y * 11 + sideY * 8);
  context.strokeStyle = '#e7a84c'; context.lineWidth = 2; context.beginPath();
  context.moveTo(px + sideX * 3, py + sideY * 3); context.lineTo(dogX, dogY); context.stroke();
  const step = Math.sin(elapsed * 14) > 0 ? 1 : -1;
  context.fillStyle = 'rgba(1, 5, 8, 0.42)'; context.fillRect(px - 8, py + 9, 17, 4);
  context.fillStyle = '#13201e'; context.fillRect(px - 6 + step, py + 7, 4, 6); context.fillRect(px + 2 - step, py + 7, 4, 6);
  context.fillStyle = '#3f7969'; context.fillRect(px - 7, py - 4, 14, 13);
  context.fillStyle = '#d99a78'; context.fillRect(px - 5, py - 11, 10, 9);
  context.fillStyle = '#f4eee0'; context.fillRect(px - 6, py - 12, 3, 8); context.fillRect(px + 3, py - 12, 3, 8); context.fillRect(px - 5, py - 5, 10, 5);
  context.fillStyle = '#223a42'; context.fillRect(px - 6, py - 14, 12, 3); context.fillRect(px - 4 + dir.x * 2, py - 15 + dir.y * 2, 9, 2);
  context.fillStyle = '#241b18'; context.fillRect(px + dir.x * 4 - 1, py - 8 + dir.y * 2, 2, 2);
  drawDog(context, dogX, dogY, dir, elapsed);
}

export function drawCat(context, cat, tileSize, { frightened = false, frightenedTime = 0 } = {}) {
  if (cat.respawnTimer > 0) return false;
  const elapsed = Number(cat.elapsed) || 0;
  if (frightened && animationById(cat.appearance, 'frightened') && drawActorAppearance(context, cat, tileSize, { animationId: 'frightened', state: 'idle', elapsed })) return;
  const catDirection = directionOf(cat.dir);
  if (!frightened && drawActorAppearance(context, cat, tileSize, { animationId: cat.animation ?? '', state: catDirection.name === 'none' ? 'idle' : catDirection.name, elapsed })) return;
  const px = Math.round(cat.x * tileSize + tileSize / 2); const py = Math.round(cat.y * tileSize + tileSize / 2);
  const flashing = frightened && frightenedTime < 2 && Math.floor(frightenedTime * 8) % 2;
  const body = frightened ? (flashing ? '#f3eee0' : '#2379a3') : cat.color; const accent = frightened ? '#174e77' : cat.accent;
  context.fillStyle = 'rgba(1, 5, 8, 0.36)'; context.fillRect(px - 8, py + 8, 16, 3);
  context.fillStyle = body; context.fillRect(px - 8, py - 7, 16, 16); context.fillRect(px - 7, py - 11, 5, 5); context.fillRect(px + 2, py - 11, 5, 5);
  context.fillStyle = accent; context.fillRect(px - 6, py - 9, 2, 3); context.fillRect(px + 4, py - 9, 2, 3);
  context.fillStyle = '#f5f0d9'; context.fillRect(px - 5, py - 3, 4, 4); context.fillRect(px + 2, py - 3, 4, 4);
  context.fillStyle = frightened ? '#f5f0d9' : '#17212a'; context.fillRect(px - 3, py - 2, 2, 2); context.fillRect(px + 3, py - 2, 2, 2);
  context.fillStyle = body; context.fillRect(px + 7, py + 1, 3, 7); context.fillRect(px + 8, py - 1, 5, 3);
  return true;
}
