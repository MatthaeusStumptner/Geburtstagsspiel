import { LevelAudioDirector } from './level-audio-director.js';

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

  constructor(isEnabled) {
    this.#isEnabled = isEnabled;
    this.#levelDirector = new LevelAudioDirector({
      isEnabled,
      acquireContext: () => this.#getContext(),
    });
    this.lastUiCue = null;
  }

  previewLevel(levelId) { return this.#levelDirector.preview(levelId); }
  playLevel(levelId, mode = 'playing') { return this.#levelDirector.play(levelId, mode); }
  setLevelMode(mode) { this.#levelDirector.setMode(mode); }
  stopLevelSoundscape(options) { this.#levelDirector.stop(options); }
  setEnabled(enabled) { this.#levelDirector.setEnabled(enabled); }
  soundscapeSnapshot() {
    return {
      ...this.#levelDirector.snapshot(),
      contextState: this.#context?.state ?? 'not-created',
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
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + duration);
      };
      if (context.state === 'suspended') context.resume().then(playTone).catch(() => {});
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
}
