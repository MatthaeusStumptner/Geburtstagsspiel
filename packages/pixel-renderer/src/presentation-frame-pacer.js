const clampRate = (value) => Math.max(1, Math.min(240, Number(value) || 60));

export function recommendedPresentationRate(quality = 'balanced') {
  return quality === 'performance' ? 30 : 60;
}

export class PresentationFramePacer {
  constructor({ framesPerSecond = 60, toleranceMs = 0.35 } = {}) {
    this.toleranceMs = Math.max(0, Number(toleranceMs) || 0);
    this.setFramesPerSecond(framesPerSecond);
    this.reset();
  }

  setFramesPerSecond(framesPerSecond) {
    this.framesPerSecond = clampRate(framesPerSecond);
    this.intervalMs = 1000 / this.framesPerSecond;
    return this.framesPerSecond;
  }

  reset(timestamp) {
    this.lastPresentation = Number.isFinite(timestamp) ? Number(timestamp) : null;
  }

  shouldPresent(timestamp) {
    const now = Number(timestamp);
    if (!Number.isFinite(now)) return true;
    if (this.lastPresentation === null || now < this.lastPresentation) {
      this.lastPresentation = now;
      return true;
    }
    const elapsed = now - this.lastPresentation;
    if (elapsed + this.toleranceMs < this.intervalMs) return false;
    const intervals = Math.max(1, Math.floor((elapsed + this.toleranceMs) / this.intervalMs));
    this.lastPresentation += intervals * this.intervalMs;
    if (now - this.lastPresentation > this.intervalMs) this.lastPresentation = now;
    return true;
  }
}
