import { reachableTileKeys, tileKey, validateLevelDocument } from '@franz-lola/content-model';
import { directionByName } from './simulation/actor-motion.js';
import { FixedStepLoop } from './simulation/fixed-step-loop.js';
import { LevelSimulation } from './simulation/level-simulation.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function numericSeed(seed) {
  if (Number.isFinite(Number(seed))) return Number(seed) >>> 0;
  let value = 2166136261;
  for (const character of String(seed ?? '')) {
    value ^= character.codePointAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seed) {
  let value = numericSeed(seed);
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pelletKeys(level, difficulty) {
  const reachable = reachableTileKeys(level);
  const powerUps = new Set(level.collectibles.powerUps.map(({ x, y }) => tileKey(x, y)));
  const { player, cats } = level.actors;
  const { columns, rows } = level.board;
  const candidates = [...reachable]
    .map((key) => ({ key, coordinates: key.split(',').map(Number) }))
    .filter(({ key, coordinates: [x, y] }) => (
      x > 0 && x < columns - 1
      && y > 0 && y < rows - 1
      && !(x === player.x && y === player.y)
      && !powerUps.has(key)
      && !cats.some((cat) => Math.abs(x - cat.x) <= 2 && Math.abs(y - cat.y) <= 1)
    ))
    .sort((left, right) => {
      const [leftX, leftY] = left.coordinates;
      const [rightX, rightY] = right.coordinates;
      const seed = level.gameplay.pelletSeed;
      return ((leftX * 137 + leftY * 71 + seed) % 997) - ((rightX * 137 + rightY * 71 + seed) % 997)
        || left.key.localeCompare(right.key);
    });
  const target = level.gameplay.treatTargets[difficulty] ?? level.gameplay.treatTargets.normal;
  return candidates.slice(0, target).map(({ key }) => key);
}

function previousPositions(player, cats, characters) {
  const position = (actor) => Object.freeze({
    x: Number.isFinite(actor.previousX) ? actor.previousX : actor.x,
    y: Number.isFinite(actor.previousY) ? actor.previousY : actor.y,
  });
  return Object.freeze({
    player: position(player),
    cats: Object.freeze(cats.map(position)),
    characters: Object.freeze(characters.map(position)),
  });
}

function normalizedElapsed(value) {
  return Number((Number(value) || 0).toFixed(12));
}

export function createGameSession({ level, difficulty = 'normal', seed = 0 } = {}) {
  const validation = validateLevelDocument(level);
  if (!validation.ok) throw new TypeError(`Invalid level: ${validation.errors.join(' ')}`);

  const normalizedLevel = validation.value;
  const pellets = pelletKeys(normalizedLevel, difficulty);
  const simulation = new LevelSimulation(normalizedLevel, {
    difficulty,
    pellets,
    random: seededRandom(seed),
  });
  const fixedStep = new FixedStepLoop({ updatesPerSecond: 120 });
  const frozenLevel = deepFreeze(clone(normalizedLevel));
  const characters = normalizedLevel.actors.characters.map((character) => ({
    ...clone(character),
    previousX: character.x,
    previousY: character.y,
  }));
  const queuedInputs = [];
  let events = [];

  function queueInput(input) {
    if (typeof input !== 'string') return false;
    queuedInputs.push(input);
    return true;
  }

  function step(dt) {
    const seconds = Number.isFinite(Number(dt)) ? Math.max(0, Number(dt)) : 0;
    events = [];
    fixedStep.advanceSeconds(seconds, (fixedDt) => {
      if (queuedInputs.length) simulation.setDirection(queuedInputs.shift());
      events.push(...simulation.step(fixedDt));
    });
    return snapshot();
  }

  function restore(input = {}) {
    if (input.player && typeof input.player === 'object') {
      const x = Number(input.player.x); const y = Number(input.player.y);
      if (Number.isFinite(x)) simulation.player.x = x;
      if (Number.isFinite(y)) simulation.player.y = y;
      simulation.player.previousX = simulation.player.x;
      simulation.player.previousY = simulation.player.y;
      simulation.player.dir = directionByName(input.player.direction, simulation.player.dir);
      simulation.player.nextDir = directionByName(input.player.nextDirection, simulation.player.dir);
    }
    if (Array.isArray(input.cats)) simulation.cats.forEach((cat, index) => {
      const saved = input.cats[index];
      if (!saved || typeof saved !== 'object') return;
      const x = Number(saved.x); const y = Number(saved.y);
      if (Number.isFinite(x)) cat.x = x;
      if (Number.isFinite(y)) cat.y = y;
      cat.previousX = cat.x; cat.previousY = cat.y;
      cat.dir = directionByName(saved.direction, cat.dir);
      cat.lastDecision = typeof saved.lastDecision === 'string' ? saved.lastDecision : '';
      cat.respawnTimer = Number.isFinite(Number(saved.respawnTimer)) ? Math.max(0, Number(saved.respawnTimer)) : cat.respawnTimer;
    });
    if (Array.isArray(input.pellets)) simulation.pellets = new Set(input.pellets.map(String));
    if (Array.isArray(input.powerUps)) simulation.powerUps = new Set(input.powerUps.map(String));
    if (Array.isArray(input.unlockedEvents)) simulation.unlockedEvents = new Set(input.unlockedEvents.map(String));
    for (const key of ['score', 'lives', 'elapsed', 'powerTimer', 'hitTimer', 'graceTimer']) {
      if (Number.isFinite(Number(input[key]))) simulation[key] = Math.max(0, Number(input[key]));
    }
    simulation.collected = Math.max(0, simulation.initialPellets.size - simulation.pellets.size);
    if (['playing', 'hit', 'won', 'lost'].includes(input.state)) simulation.state = input.state;
    simulation.activeEventId = typeof input.activeEventId === 'string' ? input.activeEventId : '';
    simulation.events = [];
    queuedInputs.length = 0;
    events = [];
    fixedStep.reset();
    return snapshot();
  }
  function snapshot() {
    const current = simulation.snapshot();
    return deepFreeze({
      level: frozenLevel,
      player: clone(current.player),
      cats: clone(current.cats),
      characters: clone(characters),
      pellets: [...current.pellets].sort(),
      powerUps: [...current.powerUps].sort(),
      events: clone(events),
      state: current.state,
      score: current.score,
      lives: current.lives,
      elapsed: normalizedElapsed(current.elapsed),
      previousPositions: previousPositions(current.player, current.cats, characters),
      interpolationAlpha: fixedStep.interpolationAlpha,
      powerTimer: current.powerTimer,
      graceTimer: current.graceTimer,
      hitTimer: current.hitTimer,
      collected: current.collected,
      unlockedEvents: [...current.unlockedEvents].sort(),
      activeEventId: current.activeEventId,
      initialPelletCount: pellets.length,
    });
  }

  return Object.freeze({ queueInput, restore, step, snapshot });
}
