import {
  frequencyForDegree,
  soundscapeMix,
  soundscapeProfile,
} from './level-soundscapes.js';

const CROSSFADE_SECONDS = 0.62;
const SCHEDULE_AHEAD_SECONDS = 0.18;
const SCHEDULER_INTERVAL_MS = 45;
const VALID_MODES = new Set(['preview', 'transition', 'intro', 'cutscene', 'playing', 'paused', 'won', 'over']);

function setGain(gainNode, value, time, duration = 0.24) {
  const parameter = gainNode.gain;
  parameter.cancelScheduledValues(time);
  parameter.setValueAtTime(Math.max(0.0001, parameter.value || 0.0001), time);
  parameter.linearRampToValueAtTime(Math.max(0.0001, value), time + duration);
}

class ProceduralSoundscapeVoice {
  #context;
  #profile;
  #output;
  #music;
  #ambience;
  #mode = 'preview';
  #mix = soundscapeMix('preview');
  #timer = null;
  #nextStepTime = 0;
  #step = 0;
  #sources = new Set();

  constructor(context, profile, destination) {
    this.#context = context;
    this.#profile = profile;
    this.#output = context.createGain();
    this.#music = context.createGain();
    this.#ambience = context.createGain();
    this.#output.gain.value = 0.0001;
    this.#music.gain.value = 0.0001;
    this.#ambience.gain.value = 0.0001;
    this.#music.connect(this.#output);
    this.#ambience.connect(this.#output);
    this.#output.connect(destination);
    this.#createAmbience();
  }

  get id() { return this.#profile.id; }
  get mode() { return this.#mode; }
  get step() { return this.#step; }

  start(mode) {
    this.#mode = mode;
    this.#mix = soundscapeMix(mode);
    const now = this.#context.currentTime;
    this.#nextStepTime = now + 0.06;
    this.#applyMode(now, 0.32);
    this.fadeTo(this.#mix.output, CROSSFADE_SECONDS);
    this.#timer = globalThis.setInterval(() => this.#schedule(), SCHEDULER_INTERVAL_MS);
    this.#schedule();
  }

  setMode(mode) {
    if (mode === this.#mode) return;
    this.#mode = mode;
    this.#mix = soundscapeMix(mode);
    this.#applyMode(this.#context.currentTime, 0.42);
    this.fadeTo(this.#mix.output, 0.42);
  }

  fadeTo(value, duration = CROSSFADE_SECONDS) {
    setGain(this.#output, value, this.#context.currentTime, duration);
  }

  stop() {
    if (this.#timer) globalThis.clearInterval(this.#timer);
    this.#timer = null;
    this.#sources.forEach((source) => {
      try { source.stop(); } catch { /* A source that already ended needs no cleanup. */ }
    });
    this.#sources.clear();
    try { this.#output.disconnect(); } catch { /* Already disconnected. */ }
  }

  #applyMode(now, duration) {
    setGain(this.#music, this.#mix.music, now, duration);
    setGain(this.#ambience, this.#mix.ambience, now, duration);
  }

  #track(source) {
    this.#sources.add(source);
    const previous = source.onended;
    source.onended = (...args) => {
      this.#sources.delete(source);
      previous?.(...args);
    };
    return source;
  }

  #createAmbience() {
    const { ambience } = this.#profile;
    const frameCount = Math.max(1, Math.floor(this.#context.sampleRate * 2));
    const buffer = this.#context.createBuffer(1, frameCount, this.#context.sampleRate);
    const channel = buffer.getChannelData(0);
    let smoothed = 0;
    for (let index = 0; index < channel.length; index += 1) {
      smoothed = smoothed * 0.82 + (Math.random() * 2 - 1) * 0.18;
      channel[index] = smoothed;
    }

    const noise = this.#track(this.#context.createBufferSource());
    const filter = this.#context.createBiquadFilter();
    const noiseGain = this.#context.createGain();
    noise.buffer = buffer;
    noise.loop = true;
    filter.type = ambience.filter;
    filter.frequency.value = ambience.frequency;
    filter.Q.value = ambience.q;
    noiseGain.gain.value = ambience.noise;
    noise.connect(filter).connect(noiseGain).connect(this.#ambience);

    const lfo = this.#track(this.#context.createOscillator());
    const lfoGain = this.#context.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = ambience.lfoRate;
    lfoGain.gain.value = ambience.lfoDepth;
    lfo.connect(lfoGain).connect(noiseGain.gain);

    const drone = this.#track(this.#context.createOscillator());
    const droneGain = this.#context.createGain();
    const droneFilter = this.#context.createBiquadFilter();
    drone.type = this.#profile.waveform === 'sawtooth' ? 'triangle' : 'sine';
    drone.frequency.value = frequencyForDegree(this.#profile, 0, -2);
    droneGain.gain.value = ambience.drone;
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = Math.min(900, this.#profile.filterFrequency);
    drone.connect(droneFilter).connect(droneGain).connect(this.#ambience);

    const now = this.#context.currentTime;
    noise.start(now);
    lfo.start(now);
    drone.start(now);
  }

  #schedule() {
    const horizon = this.#context.currentTime + SCHEDULE_AHEAD_SECONDS;
    const stepDuration = 60 / this.#profile.bpm / 2;
    while (this.#nextStepTime < horizon) {
      this.#scheduleStep(this.#step, this.#nextStepTime, stepDuration);
      this.#step += 1;
      this.#nextStepTime += stepDuration;
    }
  }

  #scheduleStep(step, time, stepDuration) {
    const density = this.#mix.density;
    const melodyDegree = this.#profile.melody[step % this.#profile.melody.length];
    const deterministicGate = ((step * 37 + this.#profile.rootMidi) % 100) / 100;
    if (Number.isFinite(melodyDegree) && deterministicGate <= density) {
      this.#playNote(frequencyForDegree(this.#profile, melodyDegree, 1), time, stepDuration * 0.82, 0.025, this.#profile.waveform);
    }

    if (step % 4 === 0 && density >= 0.3) {
      const bassDegree = this.#profile.bass[Math.floor(step / 4) % this.#profile.bass.length];
      this.#playNote(frequencyForDegree(this.#profile, bassDegree, -1), time, stepDuration * 1.65, 0.022, 'triangle', 0.7);
    }

    if (step % 8 === 6 && density >= 0.78) {
      this.#playNote(frequencyForDegree(this.#profile, this.#profile.accent, 1), time, stepDuration * 1.5, 0.013, 'sine', 1.35);
    }

    if (density >= 0.72 && step % 4 === 2) this.#playPulse(time, stepDuration * 0.32);
  }

  #playNote(frequency, time, duration, volume, waveform, brightness = 1) {
    const oscillator = this.#track(this.#context.createOscillator());
    const filter = this.#context.createBiquadFilter();
    const envelope = this.#context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.#profile.filterFrequency * brightness, time);
    filter.Q.value = waveform === 'square' || waveform === 'sawtooth' ? 0.9 : 0.45;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(volume, time + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.06, duration));
    oscillator.connect(filter).connect(envelope).connect(this.#music);
    oscillator.start(time);
    oscillator.stop(time + Math.max(0.08, duration) + 0.02);
  }

  #playPulse(time, duration) {
    const oscillator = this.#track(this.#context.createOscillator());
    const envelope = this.#context.createGain();
    oscillator.type = this.#profile.id === 'tabakfabrik' ? 'square' : 'sine';
    oscillator.frequency.setValueAtTime(this.#profile.id === 'zauberberg' ? 95 : 72, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + duration);
    envelope.gain.setValueAtTime(0.018, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope).connect(this.#music);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }
}

export class LevelAudioDirector {
  #isEnabled;
  #acquireContext;
  #audible = true;
  #requestedLevelId = null;
  #requestedMode = 'preview';
  #voice = null;
  #activationToken = 0;
  #cleanupTimers = new Set();

  constructor({ isEnabled, acquireContext }) {
    this.#isEnabled = isEnabled;
    this.#acquireContext = acquireContext;
  }

  preview(levelId) { this.setScene(levelId, 'preview'); }
  play(levelId, mode = 'playing') { this.setScene(levelId, mode); }

  setScene(levelId, mode = 'preview') {
    const profile = soundscapeProfile(levelId);
    if (!profile) return false;
    this.#requestedLevelId = levelId;
    this.#requestedMode = VALID_MODES.has(mode) ? mode : 'preview';
    if (!this.#canPlay()) return true;
    this.#activate(profile, this.#requestedMode);
    return true;
  }

  setMode(mode) {
    if (!this.#requestedLevelId) return;
    this.#requestedMode = mode;
    if (this.#canPlay() && this.#voice) this.#voice.setMode(mode);
  }

  stop({ remember = false } = {}) {
    this.#activationToken += 1;
    if (!remember) this.#requestedLevelId = null;
    this.#fadeOutVoice();
  }

  setEnabled(enabled) {
    this.#audible = Boolean(enabled);
    if (!this.#canPlay()) {
      this.#fadeOutVoice(0.12);
      return;
    }
    if (this.#requestedLevelId) {
      const profile = soundscapeProfile(this.#requestedLevelId);
      if (profile) this.#activate(profile, this.#requestedMode);
    }
  }

  snapshot() {
    return {
      requestedLevelId: this.#requestedLevelId,
      activeLevelId: this.#voice?.id ?? null,
      mode: this.#voice?.mode ?? this.#requestedMode,
      running: Boolean(this.#voice),
      enabled: this.#canPlay(),
      scheduledSteps: this.#voice?.step ?? 0,
    };
  }

  destroy() {
    this.#activationToken += 1;
    this.#cleanupTimers.forEach((timer) => globalThis.clearTimeout(timer));
    this.#cleanupTimers.clear();
    this.#voice?.stop();
    this.#voice = null;
  }

  #canPlay() { return this.#audible && Boolean(this.#isEnabled?.()); }

  #activate(profile, mode) {
    const token = ++this.#activationToken;
    let context;
    try { context = this.#acquireContext?.(); } catch { return; }
    if (!context) return;
    const start = () => {
      if (token !== this.#activationToken || !this.#canPlay()) return;
      if (this.#voice?.id === profile.id) {
        this.#voice.setMode(mode);
        return;
      }
      const nextVoice = new ProceduralSoundscapeVoice(context, profile, context.destination);
      const previousVoice = this.#voice;
      this.#voice = nextVoice;
      nextVoice.start(mode);
      if (previousVoice) {
        previousVoice.fadeTo(0.0001, CROSSFADE_SECONDS);
        this.#queueCleanup(previousVoice, CROSSFADE_SECONDS * 1000 + 90);
      }
    };
    if (context.state === 'suspended') context.resume().then(start).catch(() => {});
    else start();
  }

  #fadeOutVoice(duration = CROSSFADE_SECONDS) {
    const previousVoice = this.#voice;
    this.#voice = null;
    if (!previousVoice) return;
    previousVoice.fadeTo(0.0001, duration);
    this.#queueCleanup(previousVoice, duration * 1000 + 90);
  }

  #queueCleanup(voice, delay) {
    const timer = globalThis.setTimeout(() => {
      this.#cleanupTimers.delete(timer);
      voice.stop();
    }, delay);
    this.#cleanupTimers.add(timer);
  }
}
