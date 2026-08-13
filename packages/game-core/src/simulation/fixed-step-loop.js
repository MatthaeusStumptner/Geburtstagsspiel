export class FixedStepLoop {
  constructor({ updatesPerSecond = 120, maxFrameSeconds = 0.1, maxUpdatesPerFrame = 24 } = {}) {
    this.stepSeconds = 1 / updatesPerSecond;
    this.maxFrameSeconds = maxFrameSeconds;
    this.maxUpdatesPerFrame = maxUpdatesPerFrame;
    this.accumulator = 0;
    this.lastTimestamp = null;
  }

  reset(timestamp = null) {
    this.accumulator = 0;
    this.lastTimestamp = timestamp;
  }

  advance(timestamp, update) {
    if (this.lastTimestamp === null) { this.lastTimestamp = timestamp; return 0; }
    const frameSeconds = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    return this.advanceSeconds(frameSeconds, update);
  }

  advanceSeconds(frameSeconds, update) {
    const numericFrameSeconds = Number(frameSeconds);
    const normalizedFrameSeconds = Number.isFinite(numericFrameSeconds) ? numericFrameSeconds : 0;
    this.accumulator += Math.min(this.maxFrameSeconds, Math.max(0, normalizedFrameSeconds));
    let updates = 0;
    while (this.accumulator + Number.EPSILON >= this.stepSeconds && updates < this.maxUpdatesPerFrame) {
      update(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      updates += 1;
    }
    if (updates === this.maxUpdatesPerFrame) this.accumulator = Math.min(this.accumulator, this.stepSeconds);
    return updates;
  }

  snapshot() {
    return Object.freeze({ accumulator: this.accumulator });
  }

  restore(state = {}) {
    const accumulator = state?.accumulator;
    const isReachable = typeof accumulator === 'number'
      && Number.isFinite(accumulator)
      && accumulator >= -Number.EPSILON
      && accumulator <= this.stepSeconds;
    this.accumulator = isReachable ? accumulator : 0;
    this.lastTimestamp = null;
    return this.snapshot();
  }

  get interpolationAlpha() {
    return Math.min(1, Math.max(0, this.accumulator / this.stepSeconds));
  }
}
