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
    const frameSeconds = Math.min(this.maxFrameSeconds, Math.max(0, (timestamp - this.lastTimestamp) / 1000));
    this.lastTimestamp = timestamp;
    this.accumulator += frameSeconds;
    let updates = 0;
    while (this.accumulator + Number.EPSILON >= this.stepSeconds && updates < this.maxUpdatesPerFrame) {
      update(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      updates += 1;
    }
    if (updates === this.maxUpdatesPerFrame) this.accumulator = Math.min(this.accumulator, this.stepSeconds);
    return updates;
  }

  get interpolationAlpha() {
    return Math.min(1, Math.max(0, this.accumulator / this.stepSeconds));
  }
}
