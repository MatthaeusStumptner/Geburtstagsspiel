const EPSILON = 1e-7;

function atTileCenter(actor) {
  return Math.abs(actor.x - Math.round(actor.x)) < EPSILON && Math.abs(actor.y - Math.round(actor.y)) < EPSILON;
}

function distanceToNextCenter(actor, direction) {
  if (direction.x > 0) return Math.floor(actor.x + 1 + EPSILON) - actor.x;
  if (direction.x < 0) return actor.x - Math.ceil(actor.x - 1 - EPSILON);
  if (direction.y > 0) return Math.floor(actor.y + 1 + EPSILON) - actor.y;
  if (direction.y < 0) return actor.y - Math.ceil(actor.y - 1 - EPSILON);
  return 0;
}

export function moveGridActor(actor, distance, { decideAtCenter, wrap }) {
  actor.previousX = actor.x;
  actor.previousY = actor.y;
  let remaining = Math.max(0, Number(distance) || 0);
  let guard = 0;
  while (remaining > EPSILON && guard < 32) {
    guard += 1;
    if (atTileCenter(actor)) {
      actor.x = Math.round(actor.x); actor.y = Math.round(actor.y); decideAtCenter(actor);
      if (!actor.dir || (actor.dir.x === 0 && actor.dir.y === 0)) break;
    }
    const segment = distanceToNextCenter(actor, actor.dir);
    if (segment <= EPSILON) {
      decideAtCenter(actor);
      if (!actor.dir || (actor.dir.x === 0 && actor.dir.y === 0)) break;
      continue;
    }
    const travel = Math.min(remaining, segment);
    actor.x += actor.dir.x * travel; actor.y += actor.dir.y * travel; remaining -= travel; wrap(actor);
  }
  return actor;
}
