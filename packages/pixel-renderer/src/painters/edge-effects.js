export const EDGE_EFFECT_TYPES = Object.freeze(['water-flow', 'fish', 'boat', 'leaves', 'fireflies', 'mist', 'city-lights', 'birds', 'steam', 'sparks', 'stage-pulse']);

const sides = (side) => side === 'both' ? ['left', 'right'] : [side === 'right' ? 'right' : 'left'];
const edgeX = (level, side, inset = 0.5) => side === 'left' ? level.board.tileSize * inset : level.board.columns * level.board.tileSize - level.board.tileSize * inset;
const hash = (index, seed = 1) => Math.abs(Math.sin((index + 1) * 91.731 + seed * 17.17)) % 1;

function waterFlow(context, level, effect, elapsed, side) {
  const { rows, tileSize } = level.board; const x = edgeX(level, side, 0.5); const direction = side === 'left' ? 1 : -1;
  context.save(); context.fillStyle = effect.color; context.globalAlpha = 0.2 + effect.intensity * 0.38;
  const spacing = tileSize * 0.72; const offset = (elapsed * effect.speed * tileSize * 0.7) % spacing;
  for (let y = -spacing + offset; y < rows * tileSize; y += spacing) {
    const wobble = Math.sin(y * 0.07 + elapsed * effect.speed * 2.4) * tileSize * 0.12;
    context.fillRect(Math.round(x + direction * wobble - tileSize * 0.28), Math.round(y), tileSize * 0.56, Math.max(1, tileSize * 0.08));
  }
  context.restore();
}

function fish(context, level, effect, elapsed, side) {
  const { rows, tileSize } = level.board; const count = effect.count; const direction = side === 'left' ? 1 : -1;
  for (let index = 0; index < count; index += 1) {
    const phase = (elapsed * effect.speed * 0.22 + hash(index, 2)) % 1;
    if (phase > 0.58) continue;
    const jump = Math.sin(phase / 0.58 * Math.PI) * tileSize * (0.55 + effect.intensity * 0.65);
    const x = edgeX(level, side, 0.5) + direction * jump; const y = (0.12 + hash(index, 3) * 0.76) * rows * tileSize;
    context.save(); context.fillStyle = effect.color; context.globalAlpha = 0.55 + effect.intensity * 0.35;
    context.fillRect(Math.round(x - 3), Math.round(y - 2), 6, 3); context.fillRect(Math.round(x - direction * 5), Math.round(y - 1), 3, 3);
    context.fillStyle = effect.accent; context.fillRect(Math.round(x + direction), Math.round(y - 2), 1, 1); context.restore();
  }
}

function boat(context, level, effect, elapsed, side) {
  const { rows, tileSize } = level.board; const travel = rows * tileSize + tileSize * 3;
  const y = travel - ((elapsed * effect.speed * tileSize * 0.34 + hash(2, effect.count) * travel) % travel) - tileSize;
  const x = edgeX(level, side, 0.55); context.save(); context.globalAlpha = 0.7 + effect.intensity * 0.25;
  context.fillStyle = effect.color; context.fillRect(Math.round(x - 7), Math.round(y + 2), 14, 4); context.fillRect(Math.round(x - 5), Math.round(y + 6), 10, 2);
  context.fillStyle = effect.accent; context.fillRect(Math.round(x), Math.round(y - 8), 2, 10); context.fillRect(Math.round(x + 2), Math.round(y - 7), 6, 5); context.restore();
}

function particles(context, level, effect, elapsed, side) {
  const { rows, tileSize } = level.board; const x = edgeX(level, side, 0.7); const count = effect.count;
  context.save(); context.fillStyle = effect.color;
  for (let index = 0; index < count; index += 1) {
    const phase = elapsed * effect.speed * (0.3 + hash(index, 4) * 0.25) + hash(index, 5) * 20;
    const drift = Math.sin(phase * 1.7) * tileSize * (0.4 + effect.intensity);
    const y = ((hash(index, 6) * rows * tileSize - phase * tileSize * 0.24) % (rows * tileSize) + rows * tileSize) % (rows * tileSize);
    const size = effect.type === 'fireflies' ? 2 : 2 + index % 3;
    context.globalAlpha = effect.type === 'fireflies' ? 0.25 + (Math.sin(phase * 5) * 0.5 + 0.5) * 0.7 : 0.34 + effect.intensity * 0.35;
    context.fillRect(Math.round(x + drift - size / 2), Math.round(y), size, size);
  }
  context.restore();
}

function mist(context, level, effect, elapsed, side) {
  const { rows, tileSize } = level.board; const x = edgeX(level, side, 0.6); context.save(); context.fillStyle = effect.color;
  for (let index = 0; index < effect.count; index += 1) {
    const y = ((elapsed * effect.speed * tileSize * 0.13 + hash(index, 7) * rows * tileSize) % (rows * tileSize));
    const width = tileSize * (0.8 + hash(index, 8) * 1.6); context.globalAlpha = 0.05 + effect.intensity * 0.1;
    context.fillRect(Math.round(x - width / 2 + Math.sin(elapsed + index) * tileSize * 0.3), Math.round(y), Math.round(width), Math.max(2, tileSize * 0.18));
  }
  context.restore();
}

function cityLights(context, level, effect, elapsed, side) {
  const { rows, tileSize } = level.board; const x = edgeX(level, side, 0.5); context.save(); context.fillStyle = effect.color;
  for (let index = 0; index < effect.count; index += 1) {
    if (Math.sin(elapsed * effect.speed * 3 + index * 4.2) < -0.15) continue;
    const y = (index + 1) / (effect.count + 1) * rows * tileSize; context.globalAlpha = 0.35 + effect.intensity * 0.55;
    context.fillRect(Math.round(x - 2), Math.round(y), 4, 3);
  }
  context.restore();
}

function birds(context, level, effect, elapsed, side) {
  const { rows, tileSize } = level.board; context.save(); context.strokeStyle = effect.color; context.lineWidth = Math.max(1, tileSize * 0.06); context.globalAlpha = 0.45 + effect.intensity * 0.4;
  for (let index = 0; index < effect.count; index += 1) {
    const x = edgeX(level, side, 0.65) + Math.sin(elapsed * effect.speed + index * 2) * tileSize * 0.55; const y = (0.15 + hash(index, 9) * 0.7) * rows * tileSize;
    context.beginPath(); context.moveTo(x - 4, y); context.lineTo(x, y - 2 - Math.sin(elapsed * 6 + index) * 2); context.lineTo(x + 4, y); context.stroke();
  }
  context.restore();
}

function industrial(context, level, effect, elapsed, side) {
  const { rows, tileSize } = level.board; const x = edgeX(level, side, 0.62); context.save(); context.fillStyle = effect.color;
  for (let index = 0; index < effect.count; index += 1) {
    const phase = elapsed * effect.speed + index * 1.71; const y = ((rows - 1 - hash(index, 10) * rows * 0.75) * tileSize - (phase % 3) * tileSize * 0.45);
    context.globalAlpha = effect.type === 'steam' ? Math.max(0, 0.28 - (phase % 3) * 0.06) + effect.intensity * 0.12 : 0.3 + effect.intensity * 0.55;
    const size = effect.type === 'steam' ? 4 + (phase % 3) * 3 : 2 + index % 2; context.fillRect(Math.round(x + Math.sin(phase * 2) * tileSize * 0.4 - size / 2), Math.round(y), Math.round(size), Math.round(size));
  }
  context.restore();
}

function stagePulse(context, level, effect, elapsed, side) {
  const { rows, tileSize } = level.board; const alpha = 0.12 + (Math.sin(elapsed * effect.speed * 4) * 0.5 + 0.5) * effect.intensity * 0.42;
  context.save(); context.fillStyle = effect.color; context.globalAlpha = alpha; const x = side === 'left' ? 0 : (level.board.columns - 1) * tileSize;
  for (let y = 0; y < rows * tileSize; y += tileSize * 1.5) context.fillRect(x, y, tileSize, Math.max(2, tileSize * 0.16)); context.restore();
}

export function drawLevelEdgeEffects(context, level, elapsed = 0) {
  for (const effect of level.theme.edgeEffects ?? []) for (const side of sides(effect.side)) {
    if (effect.type === 'water-flow') waterFlow(context, level, effect, elapsed, side);
    else if (effect.type === 'fish') fish(context, level, effect, elapsed, side);
    else if (effect.type === 'boat') boat(context, level, effect, elapsed, side);
    else if (effect.type === 'leaves' || effect.type === 'fireflies') particles(context, level, effect, elapsed, side);
    else if (effect.type === 'mist') mist(context, level, effect, elapsed, side);
    else if (effect.type === 'city-lights') cityLights(context, level, effect, elapsed, side);
    else if (effect.type === 'birds') birds(context, level, effect, elapsed, side);
    else if (effect.type === 'steam' || effect.type === 'sparks') industrial(context, level, effect, elapsed, side);
    else if (effect.type === 'stage-pulse') stagePulse(context, level, effect, elapsed, side);
  }
}
