import { get, writable } from 'svelte/store';

const EMPTY_SETTINGS = {
  open: false,
  context: 'map',
  canPause: false,
  paused: false,
  soundEnabled: true,
  audioOutputProfile: 'speaker',
  reducedMotion: false,
  language: 'dialect',
  difficulty: 'easy',
  copy: {},
};

const EMPTY_ONBOARDING = {
  open: false,
  step: 'identity',
  language: 'dialect',
  difficulty: 'easy',
  error: '',
  success: false,
  busy: false,
  nameInvalid: false,
  ageInvalid: false,
  guidePage: 0,
  guidePages: 3,
  guide: null,
};

const EMPTY_HUD = {
  score: '000000',
  best: '000000',
  level: '01',
  lives: 0,
  globalProgress: 0,
  mapProgress: { completedLevels: 0, totalLevels: 0, treatsFound: 0, treatsTotal: 0 },
  levelStatus: { score: '000000', collected: 0, total: 0, remaining: 0, lives: 0 },
  location: { level: '01', name: '', river: '', coordinates: '', mission: '', missionLabel: '' },
  collected: 0,
  treatTotal: 0,
  eggs: 0,
  eggTotal: 0,
  paused: false,
  soundEnabled: true,
  saveStatus: '',
  savePulse: false,
  copy: {},
};

const EMPTY_MAP = {
  open: false,
  selectionOpen: false,
  selectedId: '',
  geometry: null,
  markers: [],
  selection: null,
  concertUnlocked: false,
  endgameEvent: null,
  startupBoot: null,
  copy: {},
};

const EMPTY_SCENE_TRANSITION = {
  active: false,
  phase: 'idle',
  label: '',
  place: '',
};

const EMPTY_OVERLAY = {
  open: false,
  kicker: '',
  title: '',
  copy: '',
  button: '',
  secondaryButton: '',
  variant: '',
  showControls: false,
  controlHint: '',
  keyHint: '',
};

const EMPTY_LEVEL_OVERLAYS = {
  cutscene: null,
  easterToast: null,
  confetti: [],
  confettiActive: false,
};

export function createUiSession(initial = {}) {
  const store = writable({
    settings: { ...EMPTY_SETTINGS, ...initial.settings },
    onboarding: { ...EMPTY_ONBOARDING, ...initial.onboarding },
    hud: { ...EMPTY_HUD, ...initial.hud },
    map: { ...EMPTY_MAP, ...initial.map },
    overlay: { ...EMPTY_OVERLAY, ...initial.overlay },
    levelOverlays: { ...EMPTY_LEVEL_OVERLAYS, ...initial.levelOverlays },
    sceneTransition: { ...EMPTY_SCENE_TRANSITION, ...initial.sceneTransition },
  });
  let commands = {};

  return {
    subscribe: store.subscribe,
    snapshot() {
      return get(store);
    },
    patch(section, values) {
      store.update((current) => ({
        ...current,
        [section]: { ...current[section], ...values },
      }));
    },
    registerCommands(nextCommands) {
      commands = { ...commands, ...nextCommands };
    },
    command(name, ...args) {
      const handler = commands[name];
      if (typeof handler !== 'function') throw new Error(`Unknown UI command: ${name}`);
      return handler(...args);
    },
  };
}
