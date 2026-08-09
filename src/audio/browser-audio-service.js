import { LevelAudioDirector } from './level-audio-director.js';
import { resolveAudioOutputProfile } from './audio-output-profiles.js';

const UI_CUES = {
  press: [[330, 0.035, 0.018, 'square']],
  select: [[430, 0.045, 0.022, 'square']],
  open: [[390, 0.045, 0.02, 'sine'], [520, 0.055, 0.018, 'sine', 45]],
  close: [[440, 0.045, 0.018, 'sine'], [320, 0.05, 0.016, 'sine', 40]],
  confirm: [[520, 0.05, 0.023, 'square'], [660, 0.07, 0.02, 'square', 55]],
  success: [[520, 0.06, 0.026, 'square'], [660, 0.07, 0.024, 'square', 65], [790, 0.09, 0.021, 'square', 135]],
  error: [[170, 0.075, 0.028, 'sawtooth'], [130, 0.09, 0.025, 'sawtooth', 75]],
};

export class BrowserAudioService {
  #context = null;
  #isEnabled;
  #levelDirector;
  #outputProfile;
  #masterInput = null;
  #lowShelf = null;
  #presence = null;
  #compressor = null;
  #masterGain = null;

  constructor(isEnabled, outputProfile = 'speaker') {
    this.#isEnabled = isEnabled;
    this.#outputProfile = resolveAudioOutputProfile(outputProfile);
    this.#levelDirector = new LevelAudioDirector({
      isEnabled,
      acquireContext: () => this.#getContext(),
      acquireDestination: (context) => this.#getOutputDestination(context),
    });
    this.lastUiCue = null;
  }

  previewLevel(levelId) { return this.#levelDirector.preview(levelId); }
  playMap() { return this.#levelDirector.play('map', 'map'); }
  playLevel(levelId, mode = 'playing') { return this.#levelDirector.play(levelId, mode); }
  setLevelMode(mode) { this.#levelDirector.setMode(mode); }
  stopLevelSoundscape(options) { this.#levelDirector.stop(options); }
  setEnabled(enabled) { this.#levelDirector.setEnabled(enabled); }
  setOutputProfile(profileId) {
    this.#outputProfile = resolveAudioOutputProfile(profileId);
    if (this.#context && this.#masterGain) this.#applyOutputProfile(this.#context.currentTime);
    return this.#outputProfile.id;
  }
  soundscapeSnapshot() {
    return {
      ...this.#levelDirector.snapshot(),
      contextState: this.#context?.state ?? 'not-created',
      outputProfile: this.#outputProfile.id,
    };
  }
  destroy() { this.#levelDirector.destroy(); }

  playUi(kind = 'press') {
    if (!this.#isEnabled()) return;
    this.lastUiCue = kind;
    const cue = UI_CUES[kind] ?? UI_CUES.press;
    cue.forEach(([frequency, duration, volume, type, delay = 0]) => {
      if (delay) setTimeout(() => this.beep(frequency, duration, volume, type), delay);
      else this.beep(frequency, duration, volume, type);
    });
  }

  beep(frequency, duration, volume, type = 'sine') {
    if (!this.#isEnabled()) return;
    try {
      const context = this.#getContext();
      if (!context) return;
      const playTone = () => {
        if (!this.#isEnabled()) return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(volume, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
        oscillator.connect(gain).connect(this.#getOutputDestination(context));
        oscillator.start();
        oscillator.stop(context.currentTime + duration);
      };
      if (context.state === 'suspended') {
        context.resume().then(() => {
          // A map scene can be requested before the browser grants audio. The
          // first real interaction unlocks both this UI cue and that remembered
          // scene, even in browsers that rejected the earlier resume attempt.
          this.#levelDirector.setEnabled(this.#isEnabled());
          playTone();
        }).catch(() => {});
      }
      else playTone();
    } catch {
      // Audio feedback is optional and can be blocked by the browser.
    }
  }

  #getContext() {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return null;
    this.#context ??= new AudioContextClass();
    return this.#context;
  }

  #getOutputDestination(context) {
    if (this.#masterInput) return this.#masterInput;
    this.#masterInput = context.createGain();
    this.#lowShelf = context.createBiquadFilter();
    this.#lowShelf.type = 'lowshelf';
    this.#lowShelf.frequency.value = 240;
    this.#presence = context.createBiquadFilter();
    this.#presence.type = 'peaking';
    this.#presence.frequency.value = 1800;
    this.#presence.Q.value = 0.72;
    this.#compressor = context.createDynamicsCompressor();
    this.#masterGain = context.createGain();
    this.#masterInput
      .connect(this.#lowShelf)
      .connect(this.#presence)
      .connect(this.#compressor)
      .connect(this.#masterGain)
      .connect(context.destination);
    this.#applyOutputProfile(context.currentTime, true);
    return this.#masterInput;
  }

  #applyOutputProfile(time, immediate = false) {
    const profile = this.#outputProfile;
    const duration = immediate ? 0 : 0.16;
    const setParameter = (parameter, value) => {
      parameter.cancelScheduledValues(time);
      if (duration) {
        parameter.setValueAtTime(parameter.value, time);
        parameter.linearRampToValueAtTime(value, time + duration);
      } else parameter.setValueAtTime(value, time);
    };
    setParameter(this.#masterGain.gain, profile.masterGain);
    setParameter(this.#lowShelf.gain, profile.lowShelfGain);
    setParameter(this.#presence.gain, profile.presenceGain);
    Object.entries(profile.compressor).forEach(([name, value]) => setParameter(this.#compressor[name], value));
  }
}
