import { DIRECTIONS, createGameSession } from '@franz-lola/game-core';

export { DIRECTIONS };

export function createPlaytestPresentation(snapshot, {
  cameraEnabled = true,
  zoom = 1.12,
  reducedMotion = false,
} = {}) {
  if (!snapshot || typeof snapshot !== 'object') throw new TypeError('playtest snapshot is required');
  return Object.freeze({
    snapshot,
    options: Object.freeze({
      cameraEnabled: Boolean(cameraEnabled),
      zoom,
      alpha: snapshot.interpolationAlpha,
      presentationTime: snapshot.elapsed,
      reducedMotion: Boolean(reducedMotion),
    }),
  });
}

export class PlaytestEngine {
  constructor(level, difficulty = 'easy', options = {}) {
    this.session = createGameSession({
      level,
      difficulty,
      seed: options.seed ?? level?.gameplay?.pelletSeed ?? 0,
    });
  }

  queueInput(input) { return this.session.queueInput(input); }
  setDirection(input) { return this.queueInput(input); }
  step(dt) { return this.session.step(dt); }
  snapshot() { return this.session.snapshot(); }

  get player() { return this.snapshot().player; }
  get cats() { return this.snapshot().cats; }
  get pellets() { return this.snapshot().pellets; }
  get powerUps() { return this.snapshot().powerUps; }
  get collected() { return this.snapshot().collected; }
  get score() { return this.snapshot().score; }
  get lives() { return this.snapshot().lives; }
  get state() { return this.snapshot().state; }
  get initialPellets() { return Object.freeze({ size: this.snapshot().initialPelletCount }); }
}
