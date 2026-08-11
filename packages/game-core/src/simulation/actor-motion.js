import { moveGridActor } from './grid-motion.js';

export const DIRECTIONS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1, name: 'up' }),
  down: Object.freeze({ x: 0, y: 1, name: 'down' }),
  left: Object.freeze({ x: -1, y: 0, name: 'left' }),
  right: Object.freeze({ x: 1, y: 0, name: 'right' }),
  none: Object.freeze({ x: 0, y: 0, name: 'none' }),
});

export function directionByName(name, fallback = DIRECTIONS.none) {
  return DIRECTIONS[name] ?? fallback;
}

export function queuePlayerDirection(actor, direction) {
  if (!actor || !direction || direction.name === 'none') return false;
  const current = actor.dir ?? DIRECTIONS.none;
  actor.nextDir = direction;
  const reversing = current.name !== 'none' && current.x === -direction.x && current.y === -direction.y;
  if (reversing) actor.dir = direction;
  return reversing;
}

export function canMoveOnGrid(level, grid, x, y, direction) {
  if (!direction || direction.name === 'none') return false;
  let nextX = Math.round(x) + direction.x;
  const nextY = Math.round(y) + direction.y;
  if (nextY < 0 || nextY >= level.board.rows) return false;
  if (nextX < 0 || nextX >= level.board.columns) {
    if (!level.board.tunnelRows.includes(nextY)) return false;
    nextX = nextX < 0 ? level.board.columns - 1 : 0;
  }
  return !grid[nextY]?.[nextX];
}

export function wrapGridActor(actor, columns) {
  if (actor.x < -0.5) actor.x = columns - 0.5;
  if (actor.x > columns - 0.5) actor.x = -0.5;
}

export function movePlayerActor(actor, distance, { canMove, wrap }) {
  const controller = actor.behavior?.controller ?? 'user';
  if (controller === 'stationary') { actor.dir = DIRECTIONS.none; return actor; }
  return moveGridActor(actor, distance * (actor.behavior?.speedMultiplier ?? 1), {
    decideAtCenter(current) {
      if (canMove(current.x, current.y, current.nextDir)) current.dir = current.nextDir;
      if (!canMove(current.x, current.y, current.dir)) current.dir = DIRECTIONS.none;
    },
    wrap,
  });
}

function defaultStrategy(index) {
  if (index === 1) return 'ambush';
  if (index === 2) return 'scatter-chase';
  return 'chase';
}

export function chooseCatDirection({ cat, x, y, player, elapsed, powerActive, canMove, wander, random = Math.random }) {
  const behavior = cat.behavior ?? {};
  const strategy = behavior.strategy ?? defaultStrategy(cat.index ?? 0);
  if (strategy === 'stationary') return DIRECTIONS.none;
  const reverse = { x: -cat.dir.x, y: -cat.dir.y };
  let options = Object.values(DIRECTIONS).filter((direction) => direction.name !== 'none' && canMove(x, y, direction));
  const withoutReverse = options.filter((direction) => direction.x !== reverse.x || direction.y !== reverse.y);
  if (withoutReverse.length) options = withoutReverse;
  if (!options.length) return DIRECTIONS.none;

  const lookAhead = behavior.lookAhead ?? (strategy === 'ambush' ? 3 : 0);
  const target = behavior.target ?? { x: 22, y: 22 };
  const scatterActive = strategy === 'scatter' || strategy === 'guard'
    || (strategy === 'scatter-chase' && Math.sin(elapsed * 0.7) > 0.35);
  const effectiveTarget = strategy === 'random'
    ? null
    : scatterActive
      ? target
      : { x: player.x + player.dir.x * lookAhead, y: player.y + player.dir.y * lookAhead };
  const wanderMultiplier = behavior.wanderMultiplier ?? ((cat.index ?? 0) + 1);

  return options.map((direction) => {
    const dx = effectiveTarget ? x + direction.x - effectiveTarget.x : 0;
    const dy = effectiveTarget ? y + direction.y - effectiveTarget.y : 0;
    const distance = effectiveTarget ? dx * dx + dy * dy : 0;
    const personality = random() * wanderMultiplier * (behavior.wander ?? wander);
    return { direction, score: powerActive ? -distance + personality : distance + personality };
  }).sort((a, b) => a.score - b.score)[0].direction;
}

export function moveCatActor(actor, distance, { canMove, wrap, chooseDirection }) {
  if (actor.behavior?.strategy === 'stationary') { actor.dir = DIRECTIONS.none; return actor; }
  return moveGridActor(actor, distance * (actor.behavior?.speedMultiplier ?? 1), {
    decideAtCenter(current) {
      const key = `${current.x},${current.y}`;
      if (current.lastDecision !== key || !canMove(current.x, current.y, current.dir)) {
        current.dir = chooseDirection(current, current.x, current.y);
        current.lastDecision = key;
      }
    },
    wrap,
  });
}
