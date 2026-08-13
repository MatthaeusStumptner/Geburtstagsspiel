import { cutsceneById, sampleCutscene } from './cutscene.js';

export class LevelCutscenePlayer {
  constructor() { this.reset(); }

  reset() {
    this.level = null;
    this.cutscene = null;
    this.language = 'standard';
    this.time = 0;
    this.running = false;
  }

  start(level, { id = 'intro', language = 'standard' } = {}) {
    const cutscene = cutsceneById(level, id) ?? level?.cutscenes?.find((entry) => entry.kind === 'intro') ?? null;
    if (!cutscene) { this.reset(); return false; }
    this.level = level;
    this.cutscene = cutscene;
    this.language = language === 'dialect' ? 'dialect' : 'standard';
    this.time = 0;
    this.running = true;
    return true;
  }

  setLanguage(language) { this.language = language === 'dialect' ? 'dialect' : 'standard'; }

  advance(seconds) {
    if (!this.running || !this.cutscene) return false;
    const delta = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const nextTime = this.time + delta;
    this.time = nextTime >= this.cutscene.duration - 1e-9 ? this.cutscene.duration : nextTime;
    if (this.time >= this.cutscene.duration) this.running = false;
    return !this.running;
  }

  skip() {
    if (!this.cutscene?.skippable) return false;
    this.time = this.cutscene.duration;
    this.running = false;
    return true;
  }

  snapshot() {
    return this.level && this.cutscene
      ? sampleCutscene(this.level, this.cutscene, this.time, this.language)
      : null;
  }
}
