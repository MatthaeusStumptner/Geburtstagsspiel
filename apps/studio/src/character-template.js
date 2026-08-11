export const PLAYER_STATES = Object.freeze(['idle', 'up', 'right', 'down', 'left']);

const SOURCE_SIZE = 48;
const OUTPUT_SIZE = 24;
const DIRECTIONS = Object.freeze({
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
});
const DETAIL_PRIORITY = Object.freeze(['7', 'b', '8', '6', '5', '4', 'a', '9', '3', '2', '1']);

function createSourceFrame(state, phase = 0) {
  const grid = Array.from({ length: SOURCE_SIZE }, () => Array(SOURCE_SIZE).fill('0'));
  const paint = (x, y, width, height, token) => {
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        if (row >= 0 && row < SOURCE_SIZE && column >= 0 && column < SOURCE_SIZE) grid[row][column] = token;
      }
    }
  };
  const paintLine = (startX, startY, endX, endY, token) => {
    let x = Math.round(startX); let y = Math.round(startY);
    const targetX = Math.round(endX); const targetY = Math.round(endY);
    const dx = Math.abs(targetX - x); const sx = x < targetX ? 1 : -1;
    const dy = -Math.abs(targetY - y); const sy = y < targetY ? 1 : -1;
    let error = dx + dy;
    while (true) {
      paint(x - 1, y - 1, 2, 2, token);
      if (x === targetX && y === targetY) break;
      const twiceError = 2 * error;
      if (twiceError >= dy) { error += dy; x += sx; }
      if (twiceError <= dx) { error += dx; y += sy; }
    }
  };

  // This is the original game pose, rasterized into an editable palette sprite.
  // Idle deliberately uses the original left-facing stance.
  const direction = DIRECTIONS[state] ?? DIRECTIONS.left;
  const centerX = 24; const centerY = 24;
  const sideX = -direction.y; const sideY = direction.x;
  const dogX = Math.round(centerX - direction.x * 11 + sideX * 8);
  const dogY = Math.round(centerY - direction.y * 11 + sideY * 8);
  const step = phase === 0 ? 1 : -1;
  const wiggle = phase === 0 ? 1 : -1;

  // Goldene Leine, danach Franz exactly in the painter order used by the game.
  paintLine(centerX + sideX * 3, centerY + sideY * 3, dogX, dogY, '8');
  paint(centerX - 8, centerY + 9, 17, 4, '1');
  paint(centerX - 6 + step, centerY + 7, 4, 6, '2');
  paint(centerX + 2 - step, centerY + 7, 4, 6, '2');
  paint(centerX - 7, centerY - 4, 14, 13, '3');
  paint(centerX - 5, centerY - 11, 10, 9, '4');
  paint(centerX - 6, centerY - 12, 3, 8, '5');
  paint(centerX + 3, centerY - 12, 3, 8, '5');
  paint(centerX - 5, centerY - 5, 10, 5, '5');
  paint(centerX - 6, centerY - 14, 12, 3, '6');
  paint(centerX - 4 + direction.x * 2, centerY - 15 + direction.y * 2, 9, 2, '6');
  paint(centerX + direction.x * 4 - 1, centerY - 8 + direction.y * 2, 2, 2, '7');

  // Lola uses the same body, head, ears, nose and wagging tail as the original.
  paint(dogX - 7, dogY + 5, 14, 3, '1');
  paint(dogX - 6, dogY - 3, 12, 9, '9');
  paint(dogX - 4 + direction.x * 5, dogY - 6 + direction.y * 4, 9, 8, 'a');
  paint(dogX - 6 + direction.x * 5, dogY - 5 + direction.y * 4, 3, 6, 'b');
  paint(dogX + 4 + direction.x * 4, dogY - 5 + direction.y * 4, 3, 6, 'b');
  paint(dogX + direction.x * 8 - 1, dogY - 2 + direction.y * 7, 3, 3, '7');
  paint(dogX - direction.x * 8 + wiggle * direction.y, dogY - direction.y * 8 + wiggle * direction.x, 4, 3, '9');
  return grid;
}

function downsample(source) {
  const factor = SOURCE_SIZE / OUTPUT_SIZE;
  return Array.from({ length: OUTPUT_SIZE }, (_, targetY) => Array.from({ length: OUTPUT_SIZE }, (_, targetX) => {
    const counts = new Map();
    for (let sourceY = targetY * factor; sourceY < (targetY + 1) * factor; sourceY += 1) {
      for (let sourceX = targetX * factor; sourceX < (targetX + 1) * factor; sourceX += 1) {
        const token = source[sourceY][sourceX];
        if (token !== '0') counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
    if (!counts.size) return '0';
    return [...counts].sort((left, right) => right[1] - left[1]
      || DETAIL_PRIORITY.indexOf(left[0]) - DETAIL_PRIORITY.indexOf(right[0]))[0][0];
  }).join(''));
}

function createFrame(state, phase) {
  return downsample(createSourceFrame(state, phase));
}

export function createFranzLolaAppearance() {
  const palette = [
    'transparent',
    'rgba(1, 5, 8, 0.42)',
    '#13201e',
    '#3f7969',
    '#d99a78',
    '#f4eee0',
    '#223a42',
    '#241b18',
    '#e7a84c',
    '#d8b27b',
    '#f1d7aa',
    '#a97548',
  ];
  const animations = PLAYER_STATES.map((state) => ({
    id: state,
    fps: state === 'idle' ? 2 : 8,
    loop: true,
    frames: [
      { pixels: createFrame(state, 0) },
      { pixels: createFrame(state, 1) },
    ],
  }));
  return {
    width: OUTPUT_SIZE,
    height: OUTPUT_SIZE,
    palette,
    pixels: [...animations[0].frames[0].pixels],
    animations,
    stateAnimations: Object.fromEntries(PLAYER_STATES.map((state) => [state, state])),
  };
}
