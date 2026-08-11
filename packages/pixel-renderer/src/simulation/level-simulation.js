import { compileWallGrid, createLevelDocument, tileKey } from '../level-format.js';
import { DEFAULT_DIFFICULTY_PROFILES } from './profiles.js';
import { DIRECTIONS, canMoveOnGrid, chooseCatDirection, directionByName, moveCatActor, movePlayerActor, queuePlayerDirection, wrapGridActor } from './actor-motion.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function nearestDirection(actor, targets, canMove) {
  if (!targets.size) return DIRECTIONS.none;
  const points = [...targets].map((key) => key.split(',').map(Number));
  return Object.values(DIRECTIONS).filter((direction) => direction.name !== 'none' && canMove(actor.x, actor.y, direction))
    .map((direction) => {
      const x = Math.round(actor.x) + direction.x; const y = Math.round(actor.y) + direction.y;
      return { direction, distance: Math.min(...points.map(([tx, ty]) => Math.abs(tx - x) + Math.abs(ty - y))) };
    }).sort((a, b) => a.distance - b.distance)[0]?.direction ?? DIRECTIONS.none;
}

export class LevelSimulation {
  constructor(levelInput, { difficulty = 'normal', pellets = [], powerUps, random = Math.random, unlockedEvents = [] } = {}) {
    this.level = createLevelDocument(levelInput);
    this.grid = compileWallGrid(this.level);
    this.difficultyName = DEFAULT_DIFFICULTY_PROFILES[difficulty] ? difficulty : 'normal';
    this.config = { ...DEFAULT_DIFFICULTY_PROFILES[this.difficultyName], ...this.level.gameplay.difficulties[this.difficultyName] };
    this.random = random;
    this.initialUnlockedEvents = new Set(unlockedEvents);
    this.initialPellets = new Set(pellets);
    this.initialPowerUps = new Set(powerUps ?? this.level.collectibles.powerUps.map((point) => tileKey(point.x, point.y)));
    this.reset();
  }

  reset() {
    this.elapsed = 0; this.powerTimer = 0; this.hitTimer = 0; this.graceTimer = this.config.grace; this.state = 'playing'; this.collected = 0; this.score = 0;
    this.lives = this.config.lives; this.pellets = new Set(this.initialPellets); this.powerUps = new Set(this.initialPowerUps); this.events = [];
    this.unlockedEvents = new Set(this.initialUnlockedEvents); this.activeEventId = ''; this.activeEventTimer = 0; this.directionHistory = [];
    const playerSource = this.level.actors.player;
    this.player = { ...clone(playerSource), x: playerSource.x, y: playerSource.y, previousX: playerSource.x, previousY: playerSource.y, dir: DIRECTIONS.left, nextDir: DIRECTIONS.left };
    this.cats = this.level.actors.cats.slice(0, this.config.catCount).map((source, index) => ({
      ...clone(source), index, x: source.x, y: source.y, previousX: source.x, previousY: source.y,
      dir: index === 0 ? DIRECTIONS.left : index === 1 ? DIRECTIONS.up : DIRECTIONS.right,
      lastDecision: '', respawnTimer: source.behavior?.respawnDelay ?? index * 0.9,
    }));
    return this.snapshot();
  }

  setDirection(name) {
    if (DIRECTIONS[name]) {
      queuePlayerDirection(this.player, DIRECTIONS[name]); this.directionHistory.push(name);
      const maximum = Math.max(1, ...this.level.events.map((event) => event.trigger.sequence.length)); this.directionHistory = this.directionHistory.slice(-maximum);
    }
  }

  canMove(x, y, direction) { return canMoveOnGrid(this.level, this.grid, x, y, direction); }
  wrap(actor) { wrapGridActor(actor, this.level.board.columns); }

  updateAutopilot() {
    const controller = this.player.behavior?.controller ?? 'user';
    if (controller === 'autopilot') this.player.nextDir = nearestDirection(this.player, this.pellets, this.canMove.bind(this));
    if (controller === 'patrol' && !this.canMove(this.player.x, this.player.y, this.player.dir)) {
      const order = ['left', 'up', 'right', 'down'];
      const index = Math.max(0, order.indexOf(this.player.dir.name));
      for (let step = 1; step <= order.length; step += 1) {
        const direction = directionByName(order[(index + step) % order.length]);
        if (this.canMove(this.player.x, this.player.y, direction)) { this.player.nextDir = direction; break; }
      }
    }
  }

  step(dt) {
    this.events = [];
    const seconds = Math.max(0, Number(dt) || 0);
    this.elapsed += seconds;
    if (this.activeEventTimer > 0) { this.activeEventTimer = Math.max(0, this.activeEventTimer - seconds); if (this.activeEventTimer === 0) this.activeEventId = ''; }
    if (this.graceTimer > 0) this.graceTimer = Math.max(0, this.graceTimer - seconds);
    if (this.state === 'hit') {
      this.hitTimer -= seconds;
      if (this.hitTimer <= 0) {
        if (this.lives <= 0) this.state = 'lost';
        else { this.resetActors(); this.state = 'playing'; }
      }
      return this.events;
    }
    if (this.state !== 'playing') return this.events;

    this.updateAutopilot();
    movePlayerActor(this.player, this.config.playerSpeed * seconds, { canMove: this.canMove.bind(this), wrap: this.wrap.bind(this) });
    this.cats.forEach((cat) => {
      if (cat.respawnTimer > 0) { cat.respawnTimer = Math.max(0, cat.respawnTimer - seconds); return; }
      const speed = this.powerTimer > 0 ? this.config.frightenedSpeed : this.config.catSpeed;
      moveCatActor(cat, speed * seconds, {
        canMove: this.canMove.bind(this), wrap: this.wrap.bind(this),
        chooseDirection: (actor, x, y) => chooseCatDirection({ cat: actor, x, y, player: this.player, elapsed: this.elapsed, powerActive: this.powerTimer > 0, canMove: this.canMove.bind(this), wander: this.config.wander, random: this.random }),
      });
    });
    this.collect();
    this.checkLevelEvents();
    if (this.powerTimer > 0) this.powerTimer = Math.max(0, this.powerTimer - seconds);
    this.collide();
    return this.events;
  }

  checkLevelEvents() {
    const x = Math.round(this.player.x); const y = Math.round(this.player.y);
    this.level.events.forEach((event) => {
      if (this.unlockedEvents.has(event.id)) return;
      const trigger = event.trigger;
      const matches = trigger.type === 'zone'
        ? trigger.zones.some((zone) => x >= zone.x && x < zone.x + zone.width && y >= zone.y && y < zone.y + zone.height)
        : trigger.type === 'direction-sequence'
          ? trigger.sequence.length > 0 && this.directionHistory.slice(-trigger.sequence.length).join(',') === trigger.sequence.join(',')
          : this.elapsed >= trigger.seconds;
      if (!matches) return;
      this.unlockedEvents.add(event.id); this.activeEventId = event.id; this.activeEventTimer = 4.5; this.score += event.reward;
      this.events.push({ type: 'level-event', id: event.id, event: clone(event), reward: event.reward });
    });
  }

  collect() {
    const x = Math.round(this.player.x); const y = Math.round(this.player.y); const key = tileKey(x, y);
    if (Math.hypot(this.player.x - x, this.player.y - y) > 0.42) return;
    if (this.pellets.delete(key)) { this.collected += 1; this.score += 10; this.events.push({ type: 'gutti', key }); }
    if (this.powerUps.delete(key)) { this.score += 50; this.powerTimer = this.config.powerDuration; this.events.push({ type: 'power', key }); }
    if (this.pellets.size === 0 && this.initialPellets.size > 0) { this.state = 'won'; this.events.push({ type: 'won' }); }
  }

  collide() {
    if (this.graceTimer > 0 || this.state !== 'playing') return;
    for (const cat of this.cats) {
      if (cat.respawnTimer > 0 || Math.hypot(this.player.x - cat.x, this.player.y - cat.y) > 0.72) continue;
      if (this.powerTimer > 0) {
        const start = this.level.actors.cats[cat.index]; cat.x = start.x; cat.y = start.y; cat.previousX = start.x; cat.previousY = start.y; cat.respawnTimer = 1.6; cat.lastDecision = '';
        this.score += 200; this.events.push({ type: 'cat-eaten', index: cat.index });
      } else {
        this.lives -= 1; this.state = 'hit'; this.hitTimer = 1.1; this.events.push({ type: 'hit', lives: this.lives }); break;
      }
    }
  }

  resetActors() {
    const playerStart = this.level.actors.player;
    Object.assign(this.player, { x: playerStart.x, y: playerStart.y, previousX: playerStart.x, previousY: playerStart.y, dir: DIRECTIONS.left, nextDir: DIRECTIONS.left });
    this.cats.forEach((cat, index) => {
      const start = this.level.actors.cats[index]; Object.assign(cat, { x: start.x, y: start.y, previousX: start.x, previousY: start.y, lastDecision: '', respawnTimer: start.behavior?.respawnDelay ?? index * 0.9 });
    });
    this.graceTimer = this.config.grace;
  }

  snapshot() {
    return { level: this.level, player: this.player, cats: this.cats, pellets: this.pellets, powerUps: this.powerUps, elapsed: this.elapsed, powerTimer: this.powerTimer, hitTimer: this.state === 'hit' ? this.hitTimer : 0, state: this.state, lives: this.lives, score: this.score, collected: this.collected, unlockedEvents: this.unlockedEvents, activeEventId: this.activeEventId };
  }
}
