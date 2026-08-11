export function respawnCat(cat, start, delay = 1.6) {
  cat.x = start.x;
  cat.y = start.y;
  cat.previousX = start.x;
  cat.previousY = start.y;
  cat.respawnTimer = delay;
  cat.lastDecision = '';
  return cat;
}
