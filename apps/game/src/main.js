import './style.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import { mount } from 'svelte';
import { compileWallGrid, createLevelDocument, reachableTileKeys } from '@franz-lola/content-model';
import {
  DIRECTIONS,
  DirectionalSwipeInput,
  FixedStepLoop,
  PassauPixelRenderer,
  PresentationFramePacer,
  chooseCatDirection as chooseSharedCatDirection,
  moveCatActor,
  movePlayerActor,
  queuePlayerDirection,
  recommendedPresentationRate,
} from '@franz-lola/pixel-renderer';
import { aggregateProgress } from './game/progress-system.js';
import { BrowserAudioService } from './audio/browser-audio-service.js';
import { soundscapeProfile } from './audio/level-soundscapes.js';
import { ONBOARDING_GUIDE, TEXT } from './content/game-copy.js';
import { LevelCutscenePlayer } from './game/level-cutscene-player.js';
import { DIFFICULTIES } from './game/difficulty-config.js';
import { PASSAU_LEVELS, publishedEventStorageKeys, publishedLevel } from './game/level-catalog.js';
import { respawnCat } from './game/actor-respawn.js';
import { BrowserSaveStore } from './platform/browser-save-store.js';
import { migrateSave } from './platform/save-migrations.js';
import { registerGameServiceWorker } from './platform/register-service-worker.js';
import UiApp from './ui/App.svelte';
import { createMapGeometry } from './ui/map-geometry.js';
import {
  ENDGAME_BOOT_LINES,
  endgameBootView,
  endgamePageView,
} from './ui/endgame-sequence.js';
import { mountUiSurfaces } from './ui/mount-ui-surfaces.js';
import { createUiSession } from './ui/ui-session.js';
import {
  resolveReducedMotionPreference,
  settingsContextForState,
} from './ui/ui-preferences.js';
import { renderPolicyForState } from './render/render-policy.js';
import { createRenderScheduler } from './render/render-scheduler.js';
import {
  createGameplayLayout,
  highestVisibleBlockerBottom,
  resolveObservedDevicePixelRatio,
} from './render/gameplay-layout.js';

const canvas = document.querySelector('#game');
const rendererBackendParameter = new URLSearchParams(location.search).get('renderer');
const requestedRendererBackend = ['auto', 'canvas2d', 'webgl2', 'webgpu'].includes(rendererBackendParameter) ? rendererBackendParameter : 'auto';
let pixelRenderer = null;
const pixelRendererReady = PassauPixelRenderer.create(canvas, {
  zoom: 1.12,
  backend: requestedRendererBackend,
  preferWebGPU: true,
  fallback: true,
  quality: 'auto',
  powerPreference: 'high-performance',
});
const simulationLoop = new FixedStepLoop({ updatesPerSecond: 120 });
const presentationPacer = new PresentationFramePacer({ framesPerSecond: 60 });
const renderScheduler = createRenderScheduler({
  render: (_reason, timestamp) => render(timestamp),
  pacer: presentationPacer,
});
const gameplayLayout = createGameplayLayout();
const levelCutscenePlayer = new LevelCutscenePlayer();
const saveStore = new BrowserSaveStore();

const COLS = 25;
const ROWS = 25;
const TILE = 24;
const BOARD_SIZE = COLS * TILE;
const TUNNEL_ROW = 12;
const SAVE_KEY = 'gassi-runde-hals-save';
const LEGACY_BEST_KEY = 'gassi-runde-best';
const MIN_SAVE_VERSION = Number(document.body.dataset.minSaveVersion);
const SAVE_VERSION = Number(document.body.dataset.saveVersion);
const PUBLISHED_EVENT_KEYS = publishedEventStorageKeys();
const EASTER_EGG_COUNT = PUBLISHED_EVENT_KEYS.length;
const SWIPE_ACTIVATION_DISTANCE = 4;
const CAMERA_ZOOM = 1.12;

const MAP_GEOMETRY = createMapGeometry(PASSAU_LEVELS);
const MAP_LABEL_LIFTS = {
  hals: 8,
  home: 14,
  bschuett: 28,
  oberhaus: 8,
  dom: 30,
  dreifluesseeck: 8,
  uni: 8,
  zauberberg: 24,
  tabakfabrik: 8,
};

const PLAYER_START = { x: 12, y: 20 };
const POWER_PELLET_POSITIONS = [[1, 1], [23, 1], [1, 23], [23, 23]];
const CAT_STARTS = [
  { x: 11, y: 12, color: '#ff6b5f', accent: '#9e302e' },
  { x: 12, y: 12, color: '#f2a65a', accent: '#a6532c' },
  { x: 13, y: 12, color: '#b792e8', accent: '#66509d' },
];

const ui = {
  appShell: document.querySelector('.app-shell'),
  boardColumn: document.querySelector('.board-column'),
  boardFrame: document.querySelector('.board-frame'),
  catRadar: document.querySelector('#cat-radar'),
  announcement: document.querySelector('#announcement'),
};

const storedGame = loadGame();
const onboardingParams = new URLSearchParams(window.location.search);
const forceOnboarding = onboardingParams.get('onboarding') === '1'
  || (import.meta.env.DEV && onboardingParams.has('onboarding'));
const onboardingPreview = Boolean(storedGame && forceOnboarding);
const requiresOnboarding = !storedGame || forceOnboarding;
let grid = [];
let pellets = new Set();
let powerPellets = new Set();
let player;
let cats = [];
let state = 'ready';
let score = 0;
let best = storedGame?.best ?? loadLegacyBest();
let level = 1;
let difficulty = DIFFICULTIES[storedGame?.difficulty] ? storedGame.difficulty : 'easy';
let lives = DIFFICULTIES[difficulty].lives;
let powerTimer = 0;
let hitTimer = 0;
let graceTimer = 0;
let soundEnabled = storedGame ? Boolean(storedGame.soundEnabled) : true;
let reducedMotion = resolveReducedMotionPreference(
  storedGame?.reducedMotion,
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false,
);
let runStarted = false;
let language = storedGame?.language === 'standard' ? 'standard' : 'dialect';
let levelTreatTotal = 0;
let selectedLevelId = PASSAU_LEVELS.some((item) => item.id === storedGame?.selectedLevelId)
  ? storedGame.selectedLevelId
  : 'home';
let mapSelectionId = selectedLevelId;
let mapSelectionOpen = false;
let completedLevelIds = new Set(
  Array.isArray(storedGame?.completedLevelIds)
    ? storedGame.completedLevelIds.filter((id) => PASSAU_LEVELS.some((item) => item.id === id))
    : [],
);
let concertUnlocked = Boolean(storedGame?.concertUnlocked)
  || completedLevelIds.size === PASSAU_LEVELS.length;
let concertRevealSeen = Boolean(storedGame?.concertRevealSeen);
let levelStats = normalizeLevelStats(storedGame?.levelStats);
let levelRunScore = Math.max(0, Math.floor(Number(storedGame?.levelRunScore) || 0));
let unlockedEggs = new Set();
let activeEasterEgg = null;
let currentOverlay = null;
let endgamePage = 0;
let mapEndgameActive = false;
let mapEndgamePhase = 'boot';
let mapEndgameBootStep = 0;
let mapEndgameTimers = [];
let sceneTransitionToken = 0;
let sceneTransitionActive = false;
let directionHistory = [];
let savePulseTimer;
let savePulse = false;
let elapsed = 0;
let levelEventElapsed = 0;
let autoSaveElapsed = 0;
const swipeInput = new DirectionalSwipeInput({ activationDistance: SWIPE_ACTIVATION_DISTANCE, dominanceRatio: 1.08 });
let mobileScrollPosition = 0;
const uiSession = createUiSession();
let settingsOpen = false;
let settingsReturnState = null;
let settingsReturnFocus = null;
let confettiTimer = null;
let cutsceneUiRevealTimer = null;
let appliedGameplayLayoutRevision = -1;
let lastRadarPaint = Number.NEGATIVE_INFINITY;
let onboardingComplete = !requiresOnboarding;
let onboardingLanguage = language;
let onboardingDifficulty = difficulty;
let onboardingLoginAttempts = 0;
let onboardingGuidePage = 0;
let activeLevelDocument = null;
let staticWorldRevision = 0;
const audioService = new BrowserAudioService(() => soundEnabled);

function requestRender(reason) {
  renderScheduler.request(reason);
}

function invalidateStaticWorld(reason) {
  staticWorldRevision += 1;
  requestRender(`world:${reason}`);
}

function currentRenderPolicy() {
  return renderPolicyForState(state, settingsReturnState, uiSession.snapshot().onboarding.open);
}

function t(key, values = {}) {
  const template = TEXT[language][key] ?? TEXT.standard[key] ?? key;
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

function playUiSound(kind = 'press') {
  audioService.playUi(kind);
}

function syncLevelAudioForState(targetState = state) {
  const effectiveState = targetState === 'menu' ? settingsReturnState : targetState;
  if (effectiveState === 'map') {
    if (mapSelectionOpen) audioService.previewLevel(mapSelectionId);
    else audioService.stopLevelSoundscape();
    return;
  }
  if (effectiveState === 'intro') audioService.playLevel(selectedLevelId, 'intro');
  else if (effectiveState === 'cutscene') audioService.playLevel(selectedLevelId, 'cutscene');
  else if (effectiveState === 'playing' || effectiveState === 'hit') audioService.playLevel(selectedLevelId, 'playing');
  else if (effectiveState === 'paused') audioService.playLevel(selectedLevelId, 'paused');
  else if (effectiveState === 'won') audioService.playLevel(selectedLevelId, 'won');
  else if (effectiveState === 'over') audioService.playLevel(selectedLevelId, 'over');
  else audioService.stopLevelSoundscape();
}

function syncReducedMotionButton() {
  syncSettingsMenu();
}

function applyReducedMotion() {
  document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  document.documentElement.dataset.reducedMotion = String(reducedMotion);
  syncReducedMotionButton();
}

function toggleReducedMotion() {
  reducedMotion = !reducedMotion;
  applyReducedMotion();
  requestRender('settings:reduced-motion');
  saveGame();
}

function updateOnboardingChoices() {
  uiSession.patch('onboarding', {
    language: onboardingLanguage,
    difficulty: onboardingDifficulty,
  });
}

function showOnboardingStep(step) {
  uiSession.patch('onboarding', { step });
}

function showOnboarding() {
  updateOnboardingChoices();
  uiSession.patch('onboarding', {
    open: true,
    step: 'identity',
    error: '',
    success: false,
    busy: false,
    nameInvalid: false,
    ageInvalid: false,
  });
  ui.appShell.inert = true;
  document.body.classList.add('onboarding-open');
  requestRender('onboarding:open');
}

function hideOnboarding() {
  uiSession.patch('onboarding', { open: false });
  ui.appShell.inert = false;
  document.body.classList.remove('onboarding-open');
  requestRender('onboarding:close');
}

function validateOnboardingLogin(nameValue, ageValue) {
  const enteredName = String(nameValue ?? '').trim().toLocaleLowerCase('de-DE');
  const enteredAge = Number(ageValue);
  const nameMatches = enteredName === 'franz';
  const ageMatches = String(ageValue ?? '') !== '' && enteredAge === 60;

  if (nameMatches && ageMatches) {
    playUiSound('success');
    uiSession.patch('onboarding', {
      error: 'Treffer. Personalakte F-60 bestätigt. Der versiegelte Umschlag wird aus dem Archiv geholt …',
      success: true,
      busy: true,
      nameInvalid: false,
      ageInvalid: false,
    });
    setTimeout(() => {
      uiSession.patch('onboarding', { error: '', success: false, busy: false, nameInvalid: false, ageInvalid: false });
      showOnboardingStep('setup');
    }, 650);
    return;
  }

  onboardingLoginAttempts += 1;
  playUiSound('error');
  let error;
  if (!enteredName && String(ageValue ?? '') === '') {
    error = 'Ganz ohne Angaben wird selbst eine Fake-Behörde misstrauisch. Name und Alter bitte!';
  } else if (!nameMatches && !ageMatches) {
    error = 'Kein Treffer im Sonderregister. Hinterlegt sind Franz und die Kennzahl 60.';
  } else if (!nameMatches) {
    error = 'Die Kennzahl passt, der Personenschlüssel nicht. Zuständig ist ausschließlich Franz.';
  } else if (enteredAge < 60) {
    error = 'Fast! Aber unter 60 fehlt noch die amtliche Geburtstagsreife.';
  } else {
    error = 'Die Akte sagt 60. Komplimente über zusätzliche Lebenserfahrung zählen leider nicht.';
  }
  if (onboardingLoginAttempts >= 3) {
    error += ' Inoffizieller Amtshinweis: F… wie Franz und sechzig ohne Formulargebühr.';
  }
  uiSession.patch('onboarding', {
    error,
    success: false,
    busy: false,
    nameInvalid: !nameMatches,
    ageInvalid: !ageMatches,
  });
}

function renderOnboardingGuidePage() {
  const pages = ONBOARDING_GUIDE[language] ?? ONBOARDING_GUIDE.standard;
  const page = pages[onboardingGuidePage];
  uiSession.patch('onboarding', {
    language,
    difficulty,
    guidePage: onboardingGuidePage,
    guidePages: pages.length,
    guide: page,
  });
}

function moveOnboardingGuide(direction) {
  const pages = ONBOARDING_GUIDE[language] ?? ONBOARDING_GUIDE.standard;
  onboardingGuidePage = Math.max(0, Math.min(pages.length - 1, onboardingGuidePage + direction));
  renderOnboardingGuidePage();
}

function prepareOnboardingGuide() {
  const languageChanged = language !== onboardingLanguage;
  language = onboardingLanguage;
  difficulty = onboardingDifficulty;
  lives = difficultyConfig().lives;
  graceTimer = difficultyConfig().grace;
  levelRunScore = 0;
  rebaseLevelStatsForDifficulty();
  buildLevel();
  if (languageChanged) invalidateStaticWorld('language');
  runStarted = false;
  applyLanguage();
  updateLocationUi();
  updateHud();
  renderPassauMap();
  onboardingGuidePage = 0;
  renderOnboardingGuidePage();
  showOnboardingStep('guide');
}

function finishOnboarding() {
  playUiSound('success');
  if (onboardingPreview) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('onboarding');
    window.history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    window.location.reload();
    return;
  }
  onboardingComplete = true;
  hideOnboarding();
  saveGame();
  ui.announcement.textContent = language === 'dialect'
    ? "Servus Franz, d'Passau-Kartn is freigschoit!"
    : 'Willkommen Franz, die Passau-Karte ist freigeschaltet!';
  requestAnimationFrame(() => document.querySelector('#settings-open-button')?.focus());
}

function currentLocation() {
  return PASSAU_LEVELS.find((item) => item.id === selectedLevelId) ?? PASSAU_LEVELS[0];
}

function currentPublishedLevel() {
  return publishedLevel(selectedLevelId);
}

function localized(field) {
  return field[language] ?? field.standard;
}

function difficultyConfig(levelDocument = activeLevelDocument ?? currentPublishedLevel()) {
  const defaults = DIFFICULTIES[difficulty] ?? DIFFICULTIES.easy;
  const profile = levelDocument?.gameplay?.difficulties?.[difficulty] ?? {};
  return {
    ...defaults,
    ...profile,
    treatTarget: levelDocument?.gameplay?.treatTargets?.[difficulty] ?? defaults.treatTarget,
  };
}

function globalProgressPercent() {
  return Math.round((completedLevelIds.size / PASSAU_LEVELS.length) * 100);
}

function aggregateMapProgress() {
  return aggregateProgress(
    PASSAU_LEVELS.map((item) => item.id),
    completedLevelIds,
    levelStats,
  );
}

function normalizeLevelStats(rawStats = {}) {
  return Object.fromEntries(PASSAU_LEVELS.map((item) => {
    const raw = rawStats && typeof rawStats[item.id] === 'object' ? rawStats[item.id] : {};
    const completed = completedLevelIds.has(item.id) || Boolean(raw.completed);
    const inferredTotal = completed ? difficultyConfig(publishedLevel(item.id)).treatTarget : 0;
    const treatsTotal = Math.max(inferredTotal, Math.max(0, Math.floor(Number(raw.treatsTotal) || 0)));
    const bestTreats = completed ? treatsTotal : Math.min(
      treatsTotal || Number.MAX_SAFE_INTEGER,
      Math.max(0, Math.floor(Number(raw.bestTreats) || 0)),
    );
    return [item.id, {
      attempts: Math.max(completed ? 1 : 0, Math.floor(Number(raw.attempts) || 0)),
      bestTreats,
      treatsTotal,
      bestScore: Math.max(0, Math.floor(Number(raw.bestScore) || 0)),
      completed,
    }];
  }));
}

function statsForLevel(id) {
  if (!levelStats[id]) levelStats[id] = normalizeLevelStats()[id];
  return levelStats[id];
}

function updateCurrentLevelStatsSnapshot(forceCompleted = false) {
  const stats = statsForLevel(selectedLevelId);
  const remainingTreats = pellets.size;
  const collectedTreats = Math.max(0, levelTreatTotal - remainingTreats);
  stats.treatsTotal = Math.max(stats.treatsTotal, levelTreatTotal);
  stats.bestTreats = Math.max(stats.bestTreats, collectedTreats);
  stats.bestScore = Math.max(stats.bestScore, levelRunScore);
  stats.completed = stats.completed || forceCompleted || completedLevelIds.has(selectedLevelId);
  if (stats.completed && stats.treatsTotal > 0) stats.bestTreats = stats.treatsTotal;
}

function recordLevelAttempt() {
  const stats = statsForLevel(selectedLevelId);
  stats.attempts += 1;
  stats.treatsTotal = Math.max(stats.treatsTotal, levelTreatTotal);
}

function applyDifficultyUi() {
  syncSettingsMenu();
}

function createCat(index) {
  const cat = activeLevelDocument?.actors.cats[index] ?? CAT_STARTS[index];
  return {
    ...cat,
    index,
    x: cat.x,
    y: cat.y,
    previousX: cat.x,
    previousY: cat.y,
    dir: index === 0 ? DIRECTIONS.left : index === 1 ? DIRECTIONS.up : DIRECTIONS.right,
    lastDecision: '',
    respawnTimer: cat.behavior?.respawnDelay ?? index * 0.9,
  };
}

function rebaseLevelStatsForDifficulty() {
  PASSAU_LEVELS.forEach((item) => {
    const treatsTotal = difficultyConfig(publishedLevel(item.id)).treatTarget;
    const stats = statsForLevel(item.id);
    const complete = completedLevelIds.has(item.id) || stats.completed;
    stats.treatsTotal = stats.attempts > 0 || complete ? treatsTotal : 0;
    stats.bestTreats = complete ? treatsTotal : Math.min(treatsTotal, stats.bestTreats);
    stats.completed = complete;
  });
}

function setDifficulty(nextDifficulty) {
  if (!DIFFICULTIES[nextDifficulty] || nextDifficulty === difficulty) return;
  const effectiveState = state === 'menu' ? settingsReturnState : state;
  const activeRound = runStarted && ['playing', 'hit', 'paused'].includes(effectiveState);
  if (runStarted) updateCurrentLevelStatsSnapshot(state === 'won');
  difficulty = nextDifficulty;
  rebaseLevelStatsForDifficulty();
  lives = difficultyConfig().lives;
  graceTimer = difficultyConfig().grace;
  levelRunScore = 0;
  buildLevel();
  runStarted = activeRound;
  if (activeRound) {
    recordLevelAttempt();
    hitTimer = 0;
    if (state === 'menu' && settingsReturnState === 'hit') settingsReturnState = 'playing';
    else if (state === 'hit') state = 'playing';
    requestRender('state:playing');
  }
  applyDifficultyUi();
  updateLocationUi();
  updateHud();
  renderPassauMap();
  saveGame();
}

function currentMapSelectionView() {
  const item = PASSAU_LEVELS.find((entry) => entry.id === mapSelectionId) ?? PASSAU_LEVELS[0];
  const index = PASSAU_LEVELS.indexOf(item) + 1;
  const complete = completedLevelIds.has(item.id);
  const resumable = item.id === selectedLevelId && runStarted && lives > 0 && pellets.size > 0;
  if (item.id === selectedLevelId && runStarted) updateCurrentLevelStatsSnapshot(complete);
  const stats = statsForLevel(item.id);
  const treatsTotal = stats.treatsTotal || difficultyConfig(publishedLevel(item.id)).treatTarget;
  return {
    id: item.id,
    kicker: `${complete ? t('mapCompleted') : t('mapSelected')} · LEVEL ${String(index).padStart(2, '0')}`,
    name: localized(item.name),
    description: localized(item.description),
    bestTreats: stats.bestTreats,
    treatsTotal,
    attempts: stats.attempts.toLocaleString('de-DE'),
    bestScore: stats.bestScore.toLocaleString('de-DE'),
    status: complete ? t('mapStatsDone') : resumable ? t('mapStatsActive') : t('mapStatsOpen'),
    startLabel: resumable ? t('mapResume') : t('mapStart'),
    soundscape: soundscapeProfile(item.id)?.name ?? '',
  };
}

function currentMapEndgameView() {
  if (!mapEndgameActive) return null;
  if (mapEndgamePhase === 'boot') {
    return endgameBootView(mapEndgameBootStep, (key) => t(key));
  }
  return endgamePageView(endgamePage, (key) => t(key));
}

function renderPassauMap() {
  const points = Object.fromEntries(MAP_GEOMETRY.markers.map((marker) => [marker.id, marker]));
  uiSession.patch('map', {
    open: state === 'map',
    selectionOpen: mapSelectionOpen,
    selectedId: mapSelectionId,
    geometry: MAP_GEOMETRY,
    markers: PASSAU_LEVELS.map((item) => ({
      ...points[item.id],
      id: item.id,
      name: localized(item.name),
      icon: item.icon,
      home: Boolean(item.home),
      markerClass: item.markerClass ?? '',
      labelLift: MAP_LABEL_LIFTS[item.id] ?? 9,
      completed: completedLevelIds.has(item.id),
    })),
    selection: mapSelectionOpen ? currentMapSelectionView() : null,
    concertUnlocked: concertUnlocked && concertRevealSeen,
    endgameEvent: currentMapEndgameView(),
    copy: {
      kicker: t('mapKicker'),
      title: t('mapTitle'),
      copy: t('mapCopy'),
      settingsLabel: t('settingsLabel'),
      mapA11yLabel: language === 'dialect'
        ? 'Maßstäbliche Kartn von Passau mit auswählbaren Gassi-Orten'
        : 'Maßstäbliche Karte von Passau mit auswählbaren Gassi-Orten',
      closeLabel: t('mapDetailsClose'),
      statsLabel: language === 'dialect' ? 'Level-Statistik' : 'Levelstatistik',
      treatsLabel: t('mapStatsTreats'),
      attemptsLabel: t('mapStatsAttempts'),
      scoreLabel: t('mapStatsScore'),
      statusLabel: t('mapStatsStatus'),
      soundscapeLabel: language === 'dialect' ? 'KLANG VOM PLATZERL' : 'KLANG DES ORTES',
      concertUnlocked: t('concertMapBadge'),
    },
  });
}

function updateMapSelection() {
  renderPassauMap();
}

function showMapSelection() {
  mapSelectionOpen = true;
  renderPassauMap();
}

function closeMapSelection(returnFocus = false, keepAudio = false) {
  const focusId = mapSelectionId;
  mapSelectionOpen = false;
  if (!keepAudio && state === 'map') audioService.stopLevelSoundscape();
  renderPassauMap();
  if (returnFocus) requestAnimationFrame(() => {
    document.querySelector(`[data-level-id="${focusId}"] .map-marker`)?.focus();
  });
}

function selectMapLocation(id) {
  if (!PASSAU_LEVELS.some((item) => item.id === id)) return;
  playUiSound('select');
  mapSelectionId = id;
  audioService.previewLevel(id);
  showMapSelection();
}

function updateLocationUi() {
  const item = currentLocation();
  canvas.setAttribute('aria-label', `${localized(item.name)}: Gassi-Runde mit Franz und Lola`);
  syncHudView();
}

function applyLanguage() {
  levelCutscenePlayer.setLanguage(language);
  document.documentElement.lang = language === 'dialect' ? 'bar' : 'de';
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  applyDifficultyUi();
  updateLocationUi();
  setPauseButtons((state === 'menu' ? settingsReturnState : state) === 'paused');
  syncSoundButtons();
  applyReducedMotion();
  syncSettingsMenu();
  renderPassauMap();
  syncHudView();
  syncLevelCutsceneUi();
  if (currentOverlay) refreshOverlay();
}

function setLanguage(nextLanguage) {
  if (!TEXT[nextLanguage] || nextLanguage === language) return;
  language = nextLanguage;
  invalidateStaticWorld('language');
  applyLanguage();
  saveGame();
}

function isMobileGameLayout() {
  return window.matchMedia(
    '(pointer: coarse), (max-width: 740px), (max-width: 900px) and (max-height: 600px) and (orientation: landscape)',
  ).matches;
}

function enterMobileGameMode() {
  document.body.classList.remove('map-active');
  const alreadyActive = document.body.classList.contains('mobile-game-active');
  if (!alreadyActive) {
    mobileScrollPosition = window.scrollY;
    document.body.style.top = `-${mobileScrollPosition}px`;
    document.body.classList.add('mobile-game-active');
  }
  measureGameplayLayout('mobile-enter');
  return !alreadyActive;
}

function leaveMobileGameMode(returnToBoard = false) {
  const wasActive = document.body.classList.contains('mobile-game-active');
  document.body.classList.remove('mobile-game-active');
  document.body.style.top = '';
  measureGameplayLayout('mobile-leave');

  if (wasActive) {
    requestAnimationFrame(() => {
      window.scrollTo(0, mobileScrollPosition);
      if (returnToBoard) ui.boardColumn.scrollIntoView({ block: 'start' });
    });
  }
  return wasActive;
}

function waitForUi(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function clearMapEndgameTimers() {
  mapEndgameTimers.forEach((timer) => clearTimeout(timer));
  mapEndgameTimers = [];
}

function startMapEndgameSequence() {
  if (state !== 'map' || !concertUnlocked || concertRevealSeen || mapEndgameActive) return;
  clearMapEndgameTimers();
  closeMapSelection(false);
  mapEndgameActive = true;
  mapEndgamePhase = 'boot';
  mapEndgameBootStep = 0;
  endgamePage = 0;
  ui.announcement.textContent = t('mapEventBootAnnouncement');
  renderPassauMap();

  const stepDuration = reducedMotion ? 45 : 620;
  for (let step = 1; step < ENDGAME_BOOT_LINES.length; step += 1) {
    mapEndgameTimers.push(setTimeout(() => {
      mapEndgameBootStep = step;
      playUiSound('select');
      renderPassauMap();
    }, step * stepDuration));
  }
  mapEndgameTimers.push(setTimeout(() => {
    mapEndgamePhase = 'reveal';
    endgamePage = 0;
    playUiSound('success');
    beep(523, 0.1, 0.035, 'square');
    renderPassauMap();
  }, ENDGAME_BOOT_LINES.length * stepDuration + (reducedMotion ? 30 : 480)));
}

async function transitionFromMapToLevel() {
  if (sceneTransitionActive || mapEndgameActive) return;
  sceneTransitionActive = true;
  audioService.setLevelMode('transition');
  const token = ++sceneTransitionToken;
  const place = localized(PASSAU_LEVELS.find((item) => item.id === mapSelectionId)?.name ?? currentLocation().name);
  uiSession.patch('sceneTransition', {
    active: true,
    phase: 'covering',
    label: t('levelTransitionLoading'),
    place: place.toUpperCase(),
  });

  await waitForUi(reducedMotion ? 30 : 400);
  if (token !== sceneTransitionToken) return;
  commitMapSelectionStart();
  uiSession.patch('sceneTransition', { phase: 'revealing' });

  await waitForUi(reducedMotion ? 30 : 480);
  if (token !== sceneTransitionToken) return;
  sceneTransitionActive = false;
  uiSession.patch('sceneTransition', { active: false, phase: 'idle' });
}

function openMap() {
  clearCutscenePresentation();
  audioService.stopLevelSoundscape();
  levelCutscenePlayer.reset();
  hideLevelCutsceneUi();
  leaveMobileGameMode(true);
  closeSettings(false);
  closeMapSelection(false);
  if (state === 'playing' || state === 'hit') setPauseButtons(true);
  state = 'map';
  requestRender('state:map');
  document.body.classList.add('map-active');
  mapSelectionId = selectedLevelId;
  hideOverlay();
  renderPassauMap();
  updateHud();
  saveGame();
  if (concertUnlocked && !concertRevealSeen && !mapEndgameActive) {
    requestAnimationFrame(() => requestAnimationFrame(startMapEndgameSequence));
  }
}

function commitMapSelectionStart() {
  closeMapSelection(false, true);
  document.body.classList.remove('map-active');
  enterMobileGameMode();
  const resumable = mapSelectionId === selectedLevelId && runStarted && lives > 0 && pellets.size > 0;
  if (!resumable) {
    selectedLevelId = mapSelectionId;
    level = PASSAU_LEVELS.findIndex((item) => item.id === selectedLevelId) + 1;
    lives = difficultyConfig().lives;
    hitTimer = 0;
    buildLevel();
    levelRunScore = 0;
    recordLevelAttempt();
  }
  runStarted = true;
  state = 'intro';
  requestRender('state:intro');
  audioService.playLevel(selectedLevelId, 'intro');
  renderPassauMap();
  setPauseButtons(false);
  updateLocationUi();
  updateHud();
  showLevelIntro(resumable);
  saveGame();
}

function startMapSelection() {
  transitionFromMapToLevel();
}

function showLevelIntro(resumable = false) {
  const item = currentLocation();
  showOverlay(
    'levelIntroKicker',
    'levelIntroTitle',
    'levelIntroCopy',
    resumable ? 'resumeButton' : 'startButton',
    () => {
      hideOverlay();
      if (!resumable && startLevelCutscene()) return;
      enterLevelPlay();
    },
    () => ({ place: localized(item.name), description: localized(item.description) }),
    { variant: 'level-intro', showControls: true },
  );
}

function hideLevelCutsceneUi() {
  uiSession.patch('levelOverlays', { cutscene: null });
}

function clearCutscenePresentation() {
  clearTimeout(cutsceneUiRevealTimer);
  cutsceneUiRevealTimer = null;
  document.body.classList.remove('cutscene-active', 'cutscene-ui-reveal');
}

function beginCutscenePresentation() {
  clearCutscenePresentation();
  document.body.classList.add('cutscene-active');
}

function revealGameUiAfterCutscene() {
  document.body.classList.remove('cutscene-active', 'cutscene-ui-reveal');
  document.body.classList.add('cutscene-ui-reveal');
  requestAnimationFrame(() => measureGameplayLayout('cutscene-ui-reveal'));
  cutsceneUiRevealTimer = setTimeout(() => {
    document.body.classList.remove('cutscene-ui-reveal');
    cutsceneUiRevealTimer = null;
  }, reducedMotion ? 30 : 760);
}

function syncLevelCutsceneUi(snapshot = levelCutscenePlayer.snapshot()) {
  if (!snapshot || !levelCutscenePlayer.cutscene) { hideLevelCutsceneUi(); return; }
  uiSession.patch('levelOverlays', {
    cutscene: {
      title: localized(levelCutscenePlayer.cutscene.name).toUpperCase(),
      skippable: Boolean(levelCutscenePlayer.cutscene.skippable),
      skipLabel: t('cutsceneSkip'),
      dialogue: snapshot.dialogue ? {
        speaker: snapshot.dialogue.speaker,
        text: snapshot.dialogue.text,
      } : null,
    },
  });
}

function startLevelCutscene() {
  if (!levelCutscenePlayer.start(activeLevelDocument, { id: 'intro', language })) return false;
  state = 'cutscene';
  requestRender('state:cutscene');
  audioService.playLevel(selectedLevelId, 'cutscene');
  beginCutscenePresentation();
  setPauseButtons(false);
  swipeInput.cancel();
  syncLevelCutsceneUi();
  ui.announcement.textContent = localized(levelCutscenePlayer.cutscene.name);
  return true;
}

function enterLevelPlay() {
  const leavingCutscene = document.body.classList.contains('cutscene-active');
  levelCutscenePlayer.reset();
  hideLevelCutsceneUi();
  state = 'playing';
  setPauseButtons(false);
  hideOverlay();
  requestRender('state:playing');
  if (leavingCutscene) revealGameUiAfterCutscene();
  else clearCutscenePresentation();
  ui.announcement.textContent = `${t('playAnnouncement')}: ${localized(currentLocation().name)}`;
  saveGame();
}

function updateLevelCutscene(dt) {
  if (levelCutscenePlayer.advance(dt)) enterLevelPlay();
  else syncLevelCutsceneUi();
}

function resetGameProgress() {
  clearCutscenePresentation();
  audioService.stopLevelSoundscape();
  levelCutscenePlayer.reset();
  hideLevelCutsceneUi();
  leaveMobileGameMode(true);
  document.body.classList.add('map-active');
  state = 'map';
  requestRender('state:map');
  score = 0;
  best = 0;
  level = 1;
  lives = difficultyConfig().lives;
  powerTimer = 0;
  hitTimer = 0;
  graceTimer = difficultyConfig().grace;
  runStarted = false;
  levelTreatTotal = 0;
  levelRunScore = 0;
  selectedLevelId = 'home';
  mapSelectionId = 'home';
  completedLevelIds.clear();
  levelStats = normalizeLevelStats();
  unlockedEggs.clear();
  activeEasterEgg = null;
  directionHistory = [];
  concertUnlocked = false;
  concertRevealSeen = false;
  clearMapEndgameTimers();
  mapEndgameActive = false;
  sceneTransitionToken += 1;
  sceneTransitionActive = false;
  uiSession.patch('sceneTransition', { active: false, phase: 'idle' });
  uiSession.patch('levelOverlays', { easterToast: null, confetti: [], confettiActive: false });
  buildLevel();
  hideOverlay();
  renderPassauMap();
  setPauseButtons(false);
  updateLocationUi();
  updateHud();
  renderPassauMap();
  saveGame();
}

function showNewGameConfirmation() {
  const previous = {
    state,
    overlay: currentOverlay ? { ...currentOverlay } : null,
  };
  if (state === 'playing' || state === 'hit') {
    state = 'paused';
    setPauseButtons(true);
    requestRender('state:paused');
  }
  const cancel = () => {
    state = previous.state === 'hit' ? 'playing' : previous.state;
    if (previous.overlay) {
      currentOverlay = previous.overlay;
      refreshOverlay();
    } else {
      hideOverlay();
    }
    setPauseButtons(state === 'paused');
    requestRender(`state:${state}`);
  };
  showOverlay(
    'newGameKicker',
    'newGameTitle',
    'newGameCopy',
    'newGameConfirm',
    resetGameProgress,
    {},
    { variant: 'confirmation', secondaryKey: 'cancelButton', secondaryHandler: cancel },
  );
}

function deleteStoredBrowserData() {
  try {
    saveStore.remove(SAVE_KEY, LEGACY_BEST_KEY);
  } catch {
    showOverlay(
      'deleteDataErrorKicker',
      'deleteDataErrorTitle',
      'deleteDataErrorCopy',
      'deleteDataErrorButton',
      hideOverlay,
    );
    return;
  }

  onboardingComplete = false;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = '';
  window.location.replace(`${cleanUrl.pathname}${cleanUrl.hash}`);
}

function showDeleteBrowserDataConfirmation() {
  const previous = {
    state,
    overlay: currentOverlay ? { ...currentOverlay } : null,
  };
  if (state === 'playing' || state === 'hit') {
    state = 'paused';
    setPauseButtons(true);
    requestRender('state:paused');
  }
  const cancel = () => {
    state = previous.state === 'hit' ? 'playing' : previous.state;
    if (previous.overlay) {
      currentOverlay = previous.overlay;
      refreshOverlay();
    } else {
      hideOverlay();
    }
    setPauseButtons(state === 'paused');
    requestRender(`state:${state}`);
  };
  showOverlay(
    'deleteDataKicker',
    'deleteDataTitle',
    'deleteDataCopy',
    'deleteDataConfirm',
    deleteStoredBrowserData,
    {},
    { variant: 'confirmation', secondaryKey: 'cancelButton', secondaryHandler: cancel },
  );
}

function loadLegacyBest() {
  return saveStore.readNumber(LEGACY_BEST_KEY, 0);
}

function migrateLegacySave(parsed) {
  return migrateSave(parsed, {
    saveVersion: SAVE_VERSION,
    difficulties: DIFFICULTIES,
    levels: PASSAU_LEVELS,
    powerUpCount: POWER_PELLET_POSITIONS.length,
  });
}

function loadGame() {
  const parsed = saveStore.readJson(SAVE_KEY);
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.version === SAVE_VERSION) return parsed;
  if (
    Number.isInteger(parsed.version)
    && parsed.version >= MIN_SAVE_VERSION
    && parsed.version < SAVE_VERSION
  ) return migrateLegacySave(parsed);
  return null;
}

function saveGame(quiet = false) {
  if (!onboardingComplete) return;
  best = Math.max(best, score);
  if (runStarted) updateCurrentLevelStatsSnapshot(state === 'won');
  const payload = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    mode: state === 'menu' ? settingsReturnState : state,
    runStarted,
    score,
    best,
    level,
    lives,
    powerTimer,
    hitTimer,
    graceTimer,
    soundEnabled,
    reducedMotion,
    language,
    difficulty,
    levelTreatTotal,
    levelRunScore,
    levelEventElapsed,
    levelStats,
    selectedLevelId,
    completedLevelIds: [...completedLevelIds],
    concertUnlocked,
    concertRevealSeen,
    unlockedEggs: [...unlockedEggs],
    pellets: [...pellets],
    powerPellets: [...powerPellets],
    player: {
      x: player.x,
      y: player.y,
      direction: player.dir.name,
      nextDirection: player.nextDir.name,
    },
    cats: cats.map((cat) => ({
      x: cat.x,
      y: cat.y,
      direction: cat.dir.name,
      lastDecision: cat.lastDecision,
      respawnTimer: cat.respawnTimer,
    })),
  };

  try {
    saveStore.writeJson(SAVE_KEY, payload);
    saveStore.remove(LEGACY_BEST_KEY);
    savePulse = !quiet;
    syncHudView(t('saveSuccess'));
    if (!quiet) {
      clearTimeout(savePulseTimer);
      savePulseTimer = setTimeout(() => {
        savePulse = false;
        syncHudView();
      }, 550);
    }
  } catch {
    savePulse = false;
    syncHudView(t('saveBlocked'));
  }
}

function buildLevel() {
  activeLevelDocument = createLevelDocument(currentPublishedLevel());
  grid = compileWallGrid(activeLevelDocument);
  pixelRenderer.setLevel(activeLevelDocument);
  const reachable = reachableTileKeys(activeLevelDocument);
  powerPellets = new Set();
  for (const { x, y } of activeLevelDocument.collectibles.powerUps) {
    const key = toKey(x, y);
    if (reachable.has(key)) powerPellets.add(key);
  }

  const playerStart = activeLevelDocument.actors.player;
  const catStarts = activeLevelDocument.actors.cats;
  const { columns, rows } = activeLevelDocument.board;
  const candidates = [...reachable]
    .map((key) => ({ key, coordinates: key.split(',').map(Number) }))
    .filter(({ key, coordinates: [x, y] }) => {
      const nearCatStart = catStarts.some((cat) => Math.abs(x - cat.x) <= 2 && Math.abs(y - cat.y) <= 1);
      const atPlayerStart = x === playerStart.x && y === playerStart.y;
      const insideBoard = x > 0 && x < columns - 1 && y > 0 && y < rows - 1;
      return insideBoard && !nearCatStart && !atPlayerStart && !powerPellets.has(key);
    })
    .sort((a, b) => {
      const [ax, ay] = a.coordinates;
      const [bx, by] = b.coordinates;
      const seed = activeLevelDocument.gameplay.pelletSeed;
      return ((ax * 137 + ay * 71 + seed) % 997) - ((bx * 137 + by * 71 + seed) % 997);
    });

  const pelletLimit = difficultyConfig().treatTarget;
  pellets = new Set(candidates.slice(0, pelletLimit).map(({ key }) => key));
  levelTreatTotal = pellets.size;
  levelEventElapsed = 0;

  resetActors();
  invalidateStaticWorld('build-level');
}

function reachableOpenKeys() {
  const start = activeLevelDocument?.actors.player ?? PLAYER_START;
  const columns = activeLevelDocument?.board.columns ?? COLS;
  const rows = activeLevelDocument?.board.rows ?? ROWS;
  const visited = new Set([toKey(start.x, start.y)]);
  const queue = [{ x: start.x, y: start.y }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const direction of [DIRECTIONS.up, DIRECTIONS.down, DIRECTIONS.left, DIRECTIONS.right]) {
      let x = current.x + direction.x;
      const y = current.y + direction.y;
      if (y < 0 || y >= rows) continue;
      if (x < 0) x = columns - 1;
      if (x >= columns) x = 0;
      const key = toKey(x, y);
      if (visited.has(key) || isWall(x, y)) continue;
      visited.add(key);
      queue.push({ x, y });
    }
  }
  return visited;
}

function resetActors() {
  const playerSource = activeLevelDocument?.actors.player ?? PLAYER_START;
  player = {
    ...playerSource,
    x: playerSource.x,
    y: playerSource.y,
    dir: DIRECTIONS.left,
    nextDir: DIRECTIONS.left,
  };

  const catCount = Math.min(difficultyConfig().catCount, activeLevelDocument.actors.cats.length);
  cats = Array.from({ length: catCount }, (_, index) => createCat(index));
  powerTimer = 0;
  graceTimer = difficultyConfig().grace;
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function restoreDirection(name, fallback = DIRECTIONS.none) {
  return DIRECTIONS[name] ?? fallback;
}

function validOpenKey(key) {
  if (typeof key !== 'string' || !/^\d+,\d+$/.test(key)) return false;
  const [x, y] = key.split(',').map(Number);
  const columns = activeLevelDocument?.board.columns ?? COLS;
  const rows = activeLevelDocument?.board.rows ?? ROWS;
  return x >= 0 && x < columns && y >= 0 && y < rows && !grid[y][x];
}

function restoreGame(save) {
  best = Math.max(0, Number(save.best) || 0);
  score = Math.max(0, Number(save.score) || 0);
  language = save.language === 'standard' ? 'standard' : 'dialect';
  difficulty = DIFFICULTIES[save.difficulty] ? save.difficulty : 'normal';
  selectedLevelId = PASSAU_LEVELS.some((item) => item.id === save.selectedLevelId) ? save.selectedLevelId : 'hals';
  mapSelectionId = selectedLevelId;
  level = PASSAU_LEVELS.findIndex((item) => item.id === selectedLevelId) + 1;
  completedLevelIds = new Set(
    Array.isArray(save.completedLevelIds)
      ? save.completedLevelIds.filter((id) => PASSAU_LEVELS.some((item) => item.id === id))
      : [],
  );
  levelStats = normalizeLevelStats(save.levelStats);
  levelRunScore = Math.max(0, Math.floor(Number(save.levelRunScore) || 0));
  const savedLives = Number(save.lives);
  lives = Number.isFinite(savedLives)
    ? Math.max(0, Math.min(difficultyConfig().lives, Math.floor(savedLives)))
    : difficultyConfig().lives;
  soundEnabled = Boolean(save.soundEnabled);
  reducedMotion = resolveReducedMotionPreference(
    save.reducedMotion,
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false,
  );
  concertUnlocked = Boolean(save.concertUnlocked)
    || completedLevelIds.size === PASSAU_LEVELS.length;
  concertRevealSeen = Boolean(save.concertRevealSeen);
  runStarted = Boolean(save.runStarted);
  unlockedEggs = new Set(
    Array.isArray(save.unlockedEggs)
      ? save.unlockedEggs.filter((id) => PUBLISHED_EVENT_KEYS.includes(id))
      : [],
  );

  buildLevel();
  const generatedTreatTotal = levelTreatTotal;
  if (save.rebalanceTreats) {
    const migratedCollected = Math.min(
      pellets.size,
      Math.max(0, Math.floor(Number(save.migratedTreatsCollected) || 0)),
    );
    pellets = new Set([...pellets].slice(migratedCollected));
  }
  if (!save.rebalanceTreats && Array.isArray(save.pellets)) pellets = new Set(save.pellets.filter(validOpenKey));
  if (Array.isArray(save.powerPellets)) powerPellets = new Set(save.powerPellets.filter(validOpenKey));
  const remainingTreats = pellets.size;
  levelTreatTotal = save.rebalanceTreats
    ? Math.max(generatedTreatTotal, Math.floor(Number(save.levelTreatTotal) || generatedTreatTotal))
    : Math.max(remainingTreats, Math.floor(Number(save.levelTreatTotal) || remainingTreats));
  if (runStarted) updateCurrentLevelStatsSnapshot(save.mode === 'won');

  const restoreActors = save.mode !== 'hit';
  if (restoreActors && save.player) {
    const start = activeLevelDocument.actors.player;
    player.x = clampNumber(save.player.x, -0.55, activeLevelDocument.board.columns - 0.45, start.x);
    player.y = clampNumber(save.player.y, 0, activeLevelDocument.board.rows - 1, start.y);
    player.dir = restoreDirection(save.player.direction, DIRECTIONS.left);
    player.nextDir = restoreDirection(save.player.nextDirection, player.dir);
  }

  if (restoreActors && Array.isArray(save.cats)) {
    cats.forEach((cat, index) => {
      const savedCat = save.cats[index];
      if (!savedCat) return;
      const start = activeLevelDocument.actors.cats[index] ?? CAT_STARTS[index % CAT_STARTS.length];
      cat.x = clampNumber(savedCat.x, -0.55, activeLevelDocument.board.columns - 0.45, start.x);
      cat.y = clampNumber(savedCat.y, 0, activeLevelDocument.board.rows - 1, start.y);
      cat.previousX = cat.x;
      cat.previousY = cat.y;
      cat.dir = restoreDirection(savedCat.direction, cat.dir);
      cat.lastDecision = typeof savedCat.lastDecision === 'string' ? savedCat.lastDecision : '';
      cat.respawnTimer = clampNumber(savedCat.respawnTimer, 0, 3, 0);
    });
  }

  powerTimer = clampNumber(save.powerTimer, 0, difficultyConfig().powerDuration, 0);
  graceTimer = clampNumber(save.graceTimer, 0, difficultyConfig().grace, 0);
  levelEventElapsed = clampNumber(save.levelEventElapsed, 0, 3600, 0);
  hitTimer = 0;
  applyLanguage();
  updateHud();

  if (save.mode !== 'map') enterMobileGameMode();

  if (save.mode === 'map') {
    openMap();
  } else if (save.mode === 'intro' || save.mode === 'cutscene') {
    state = 'intro';
    showLevelIntro(false);
  } else if (!runStarted) {
    state = 'ready';
    showStartOverlay();
  } else if (save.mode === 'won') {
    state = 'won';
    if (globalProgressPercent() === 100) showGrandFinaleOverlay();
    else showLevelCompleteOverlay();
  } else if (save.mode === 'over' || lives <= 0) {
    state = 'over';
    showGameOverOverlay();
  } else {
    state = 'paused';
    setPauseButtons(true);
    showOverlay(
      'resumeKicker',
      'resumeTitle',
      'resumeCopy',
      'resumeButton',
      () => {
        state = 'playing';
        audioService.setLevelMode('playing');
        setPauseButtons(false);
        hideOverlay();
        requestRender('state:playing');
        saveGame();
      },
      () => ({
        level,
        score: score.toLocaleString('de-DE'),
        lives,
        leash: lives === 1 ? t('leashOne') : t('leashMany'),
      }),
    );
  }
  syncLevelAudioForState();
  requestRender(`state:${state}`);
}

function toKey(x, y) {
  return `${x},${y}`;
}

function isWall(x, y) {
  const board = activeLevelDocument?.board;
  const columns = board?.columns ?? COLS;
  const rows = board?.rows ?? ROWS;
  if (y < 0 || y >= rows) return true;
  if (x < 0 || x >= columns) return !board?.tunnelRows.includes(y);
  return grid[y][x];
}

function canMove(x, y, direction) {
  if (direction.name === 'none') return false;
  return !isWall(x + direction.x, y + direction.y);
}

function setDirection(name) {
  if (state === 'cutscene') return;
  if (!DIRECTIONS[name]) return;
  const direction = DIRECTIONS[name];
  queuePlayerDirection(player, direction);
  directionHistory.push(name);
  const sequenceEvents = activeLevelDocument?.events.filter((event) => event.trigger.type === 'direction-sequence') ?? [];
  const maximumSequence = Math.max(1, ...sequenceEvents.map((event) => event.trigger.sequence.length));
  directionHistory = directionHistory.slice(-maximumSequence);
  sequenceEvents.forEach((event) => {
    const sequence = event.trigger.sequence;
    if (directionHistory.slice(-sequence.length).join(',') === sequence.join(',')) unlockLevelEvent(event);
  });
  if (state === 'ready') startGame();
}

function startGame(reset = false) {
  enterMobileGameMode();
  const startsNewAttempt = reset || !runStarted;
  if (reset) {
    score = 0;
    level = PASSAU_LEVELS.findIndex((item) => item.id === selectedLevelId) + 1;
    lives = difficultyConfig().lives;
    buildLevel();
  }
  if (startsNewAttempt) {
    levelRunScore = 0;
    recordLevelAttempt();
  }
  runStarted = true;
  state = 'playing';
  audioService.playLevel(selectedLevelId, 'playing');
  audioService.playLevel(selectedLevelId, 'playing');
  renderPassauMap();
  setPauseButtons(false);
  hideOverlay();
  updateHud();
  requestRender('state:playing');
  ui.announcement.textContent = t('playAnnouncement');
  saveGame();
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    audioService.setLevelMode('paused');
    setPauseButtons(true);
    showOverlay('pauseKicker', 'pauseTitle', 'pauseCopy', 'pauseButton', () => {
      state = 'playing';
      audioService.setLevelMode('playing');
      setPauseButtons(false);
      hideOverlay();
      requestRender('state:playing');
      saveGame();
    });
    requestRender('state:paused');
    saveGame();
  } else if (state === 'paused') {
    state = 'playing';
    audioService.setLevelMode('playing');
    setPauseButtons(false);
    hideOverlay();
    requestRender('state:playing');
    saveGame();
  }
}

function setPauseButtons(paused) {
  syncHudView();
  syncSettingsMenu();
}

function syncSoundButtons() {
  syncHudView();
  syncSettingsMenu();
}

function syncSettingsMenu() {
  const effectiveState = state === 'menu' ? settingsReturnState : state;
  const context = settingsContextForState(state, settingsReturnState);
  const canPause = ['playing', 'hit', 'paused'].includes(effectiveState);
  const paused = effectiveState === 'paused';
  const config = difficultyConfig();
  uiSession.patch('settings', {
    open: settingsOpen,
    context,
    canPause,
    paused,
    soundEnabled,
    reducedMotion,
    language,
    difficulty,
    copy: {
      kicker: t('settingsKicker'),
      title: t('settingsTitle'),
      closeLabel: t('settingsCloseLabel'),
      contextLabel: t(context === 'map' ? 'settingsMapContext' : 'settingsGameContext'),
      contextCopy: t(context === 'map' ? 'settingsMapContextCopy' : 'settingsGameContextCopy'),
      difficultyLabel: t('difficultyLabel'),
      difficulties: [
        { id: 'easy', label: t('difficultyEasy') },
        { id: 'normal', label: t('difficultyNormal') },
        { id: 'hard', label: t('difficultyHard') },
      ],
      difficultyHint: t(config.hintKey),
      languageLabel: t('languageLabel'),
      languages: [
        { id: 'standard', label: t('standardButton') },
        { id: 'dialect', label: t('dialectButton') },
      ],
      languageJoke: t('languageJoke'),
      controlsLabel: t('controlsLabel'),
      controlHint: t('controlMenuHint'),
      comfortLabel: t('settingsComfortLabel'),
      soundLabel: soundEnabled ? t('soundOn') : t('soundOff'),
      reducedMotionLabel: reducedMotion ? t('reducedMotionOn') : t('reducedMotionOff'),
      reducedMotionCopy: t('reducedMotionCopy'),
      roundLabel: t('settingsRoundLabel'),
      pauseLabel: paused ? t('continue') : t('pause'),
      mapLabel: t('mapButton'),
      dataLabel: t('settingsDataLabel'),
      newGameLabel: t('newGameButton'),
      deleteDataLabel: t('deleteBrowserDataButton'),
    },
  });
}

function openSettings() {
  if (settingsOpen) return;
  playUiSound('open');
  settingsReturnFocus = document.activeElement;
  if (state !== 'map') {
    settingsReturnState = state;
    state = 'menu';
  }
  settingsOpen = true;
  syncSettingsMenu();
  document.body.classList.add('settings-open');
  requestRender('settings:open');
}

function closeSettings(returnFocus = true) {
  if (!settingsOpen) return;
  playUiSound('close');
  settingsOpen = false;
  document.body.classList.remove('settings-open');
  if (state === 'menu' && settingsReturnState) state = settingsReturnState;
  settingsReturnState = null;
  syncSettingsMenu();
  if (returnFocus) {
    const focusTarget = settingsReturnFocus?.isConnected
      ? settingsReturnFocus
      : document.querySelector('#settings-open-button, #mobile-game-menu-button');
    focusTarget?.focus();
  }
  settingsReturnFocus = null;
  requestRender('settings:close');
}

function toggleSettingsPause() {
  if (state !== 'menu' || !['playing', 'hit', 'paused'].includes(settingsReturnState)) return;
  settingsReturnState = settingsReturnState === 'paused' ? 'playing' : 'paused';
  audioService.setLevelMode(settingsReturnState === 'paused' ? 'paused' : 'playing');
  syncSettingsMenu();
  requestRender(`state:${settingsReturnState}`);
  saveGame();
}

function toggleSound() {
  if (soundEnabled) playUiSound('close');
  soundEnabled = !soundEnabled;
  audioService.setEnabled(soundEnabled);
  syncSoundButtons();
  if (soundEnabled) playUiSound('confirm');
  saveGame();
}

function showStartOverlay() {
  setPauseButtons(false);
  showOverlay(
    'startKicker',
    'startTitle',
    'startCopy',
    'startButton',
    () => startGame(),
  );
}

function showOverlay(kickerKey, titleKey, copyKey, buttonKey, handler, values = {}, options = {}) {
  currentOverlay = { kickerKey, titleKey, copyKey, buttonKey, handler, values, options };
  refreshOverlay();
}

function refreshOverlay() {
  if (!currentOverlay) return;
  const { kickerKey, titleKey, copyKey, buttonKey, values, options = {} } = currentOverlay;
  const resolvedValues = typeof values === 'function' ? values() : values;
  uiSession.patch('overlay', {
    open: true,
    kicker: t(kickerKey, resolvedValues),
    title: t(titleKey, resolvedValues),
    copy: t(copyKey, resolvedValues),
    button: t(buttonKey, resolvedValues),
    secondaryButton: options.secondaryKey ? t(options.secondaryKey, resolvedValues) : '',
    variant: options.variant ?? '',
    showControls: Boolean(options.showControls),
    controlHint: isMobileGameLayout() ? t('controlIntroHint') : t('controlMenuHint'),
    keyHint: t('keyHint'),
  });
  requestRender('overlay:show');
}

function hideOverlay() {
  currentOverlay = null;
  uiSession.patch('overlay', { open: false });
  requestRender('overlay:hide');
}

function activateOverlayPrimary() {
  currentOverlay?.handler?.();
}

function activateOverlaySecondary() {
  currentOverlay?.options?.secondaryHandler?.();
}

function syncHudView(saveStatus = null) {
  const remainingTreats = pellets.size;
  const collectedTreats = Math.max(0, levelTreatTotal - remainingTreats);
  const globalProgress = globalProgressPercent();
  const mapProgress = aggregateMapProgress();
  const item = currentLocation();
  const locationLevel = PASSAU_LEVELS.indexOf(item) + 1;
  const effectiveState = state === 'menu' ? settingsReturnState : state;
  uiSession.patch('hud', {
    score: String(score).padStart(6, '0'),
    best: String(Math.max(score, best)).padStart(6, '0'),
    level: String(level).padStart(2, '0'),
    lives,
    globalProgress,
    mapProgress,
    levelStatus: {
      score: String(levelRunScore).padStart(6, '0'),
      collected: collectedTreats,
      total: levelTreatTotal,
      remaining: remainingTreats,
      lives,
    },
    location: {
      level: String(locationLevel).padStart(2, '0'),
      name: localized(item.name).toUpperCase(),
      river: item.river,
      coordinates: `${item.lat.toFixed(3)}° N · ${item.lon.toFixed(3)}° E`,
      mission: localized(item.mission),
      missionLabel: `${t('missionPrefix')} · ${String(locationLevel).padStart(2, '0')} · ${t(difficultyConfig().nameKey).toUpperCase()}`,
    },
    collected: collectedTreats,
    treatTotal: levelTreatTotal,
    eggs: unlockedEggs.size,
    eggTotal: EASTER_EGG_COUNT,
    paused: effectiveState === 'paused',
    soundEnabled,
    saveStatus: saveStatus ?? (uiSession.snapshot().hud.saveStatus || t('saveSuccess')),
    savePulse,
    copy: {
      hudLabel: language === 'dialect' ? 'Gesamter Spielstand' : 'Gesamtspielstand',
      scoreLabel: t('scoreLabel'), bestLabel: t('bestLabel'), roundLabel: t('roundLabel'),
      livesLabel: t('livesLabel'), livesA11y: language === 'dialect' ? 'Leinen' : 'Leben',
      globalProgressLabel: t('globalProgressLabel'), menuLabel: t('menuLabel'),
      mapAggregateLabel: language === 'dialect' ? 'Gesamtfortschritt auf da Kartn' : 'Gesamtfortschritt auf der Karte',
      mapAggregateLevels: t('mapAggregateLevels'), mapAggregateTreats: t('mapAggregateTreats'),
      levelStatusLabel: language === 'dialect' ? 'Status vom aktuellen Level' : 'Status des aktuellen Levels',
      levelScoreLabel: t('levelScoreLabel'), mapStatsTreats: t('mapStatsTreats'),
      levelRemainingLabel: t('levelRemainingLabel'), routeOne: t('routeOne'), routeTwo: t('routeTwo'), routeThree: t('routeThree'),
      treatProgressLabel: t('treatProgressLabel'), secretsLabel: t('secretsLabel'), guideLabel: t('guideLabel'),
      treatTitle: t('treatTitle'), treatCopy: t('treatCopy'), powerTitle: t('powerTitle'), powerCopy: t('powerCopy'),
      catTitle: t('catTitle'), catCopy: t('catCopy'), controlsLabel: t('controlsLabel'), orLabel: t('orLabel'),
      pauseLabel: effectiveState === 'paused' ? t('continue') : t('pause'),
      soundLabel: soundEnabled ? t('soundOn') : t('soundOff'), mapButton: t('mapButton'),
      flavourQuote: t('flavourQuote'), flavourByline: t('flavourByline'),
    },
  });
}

function updateHud() {
  if (runStarted) updateCurrentLevelStatsSnapshot(state === 'won');
  syncHudView();
  if (state === 'map') renderPassauMap();
}

function eventStorageKey(event) {
  return event.scope === 'level' ? `${selectedLevelId}:${event.id}` : event.id;
}

function activeUnlockedEventIds() {
  return new Set((activeLevelDocument?.events ?? [])
    .filter((event) => unlockedEggs.has(eventStorageKey(event)))
    .map((event) => event.id));
}

function unlockLevelEvent(event) {
  const storageKey = eventStorageKey(event);
  if (unlockedEggs.has(storageKey)) return;
  const message = localized(event.message);
  unlockedEggs.add(storageKey);
  activeEasterEgg = { id: event.id, message, timer: 4.5 };
  invalidateStaticWorld('event-unlock');
  score += event.reward;
  levelRunScore += event.reward;
  uiSession.patch('levelOverlays', { easterToast: `${message} +${event.reward}` });
  ui.announcement.textContent = t('secretFound', { message });
  beep(820, 0.12, 0.045, 'square');
  setTimeout(() => beep(1040, 0.12, 0.04, 'square'), 120);
  vibrate([20, 25, 35]);
  updateHud();
  saveGame();
}

function checkLocationEasterEggs() {
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  (activeLevelDocument?.events ?? []).forEach((event) => {
    if (event.trigger.type === 'zone' && event.trigger.zones.some((zone) => (
      x >= zone.x && x < zone.x + zone.width && y >= zone.y && y < zone.y + zone.height
    ))) unlockLevelEvent(event);
    if (event.trigger.type === 'timer' && levelEventElapsed >= event.trigger.seconds) unlockLevelEvent(event);
  });
}

function update(dt) {
  elapsed += dt;
  levelEventElapsed += dt;
  if (graceTimer > 0) graceTimer = Math.max(0, graceTimer - dt);
  if (activeEasterEgg) {
    activeEasterEgg.timer -= dt;
    if (activeEasterEgg.timer <= 0) {
      activeEasterEgg = null;
      invalidateStaticWorld('event-deactivate');
      uiSession.patch('levelOverlays', { easterToast: null });
    }
  }
  if (state === 'hit') {
    hitTimer -= dt;
    if (hitTimer <= 0) {
      if (lives <= 0) finishGame();
      else {
        resetActors();
        state = 'playing';
        requestRender('state:playing');
      }
    }
    return;
  }

  movePlayer(dt);
  for (const cat of cats) moveCat(cat, dt);
  collectTreats();
  if (state !== 'playing') return;
  checkLocationEasterEggs();

  if (powerTimer > 0) powerTimer = Math.max(0, powerTimer - dt);
  checkCollisions();
}

function nearestPlayerDirection() {
  if (!pellets.size) return DIRECTIONS.none;
  const points = [...pellets].map((key) => key.split(',').map(Number));
  return Object.values(DIRECTIONS)
    .filter((direction) => direction.name !== 'none' && canMove(player.x, player.y, direction))
    .map((direction) => {
      const x = Math.round(player.x) + direction.x;
      const y = Math.round(player.y) + direction.y;
      return { direction, distance: Math.min(...points.map(([targetX, targetY]) => Math.abs(targetX - x) + Math.abs(targetY - y))) };
    })
    .sort((left, right) => left.distance - right.distance)[0]?.direction ?? DIRECTIONS.none;
}

function updatePlayerController() {
  const controller = player.behavior?.controller ?? 'user';
  if (controller === 'autopilot') player.nextDir = nearestPlayerDirection();
  if (controller === 'patrol' && !canMove(player.x, player.y, player.dir)) {
    const order = ['left', 'up', 'right', 'down'];
    const startIndex = Math.max(0, order.indexOf(player.dir.name));
    for (let step = 1; step <= order.length; step += 1) {
      const direction = DIRECTIONS[order[(startIndex + step) % order.length]];
      if (canMove(player.x, player.y, direction)) { player.nextDir = direction; break; }
    }
  }
}

function movePlayer(dt) {
  if (player.behavior?.controller === 'stationary') return;
  updatePlayerController();
  const speed = difficultyConfig().playerSpeed;
  movePlayerActor(player, speed * dt, { canMove, wrap: wrapActor });
}

function moveCat(cat, dt) {
  if (cat.respawnTimer > 0) {
    cat.respawnTimer -= dt;
    return;
  }

  const config = difficultyConfig();
  const speed = powerTimer > 0 ? config.frightenedSpeed : config.catSpeed;
  moveCatActor(cat, speed * dt, { canMove, wrap: wrapActor, chooseDirection: (actor, x, y) => chooseCatDirection(actor, x, y) });
}

function chooseCatDirection(cat, x, y) {
  return chooseSharedCatDirection({ cat, x, y, player, elapsed, powerActive: powerTimer > 0, canMove, wander: difficultyConfig().wander });
}

function wrapActor(actor) {
  const columns = activeLevelDocument?.board.columns ?? COLS;
  if (actor.x < -0.5) actor.x = columns - 0.5;
  if (actor.x > columns - 0.5) actor.x = -0.5;
}

function collectTreats() {
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  const key = toKey(x, y);
  const distance = Math.hypot(player.x - x, player.y - y);
  if (distance > 0.42) return;
  let collected = false;

  if (pellets.delete(key)) {
    invalidateStaticWorld('pellet-collected');
    score += 10;
    levelRunScore += 10;
    collected = true;
    beep(520, 0.025, 0.018);
    updateHud();
  }

  if (powerPellets.delete(key)) {
    score += 50;
    levelRunScore += 50;
    collected = true;
    powerTimer = difficultyConfig().powerDuration;
    beep(250, 0.15, 0.05, 'square');
    vibrate([20, 25, 20]);
    ui.announcement.textContent = t('powerAnnouncement');
    updateHud();
  }

  if (collected) saveGame(true);
  if (pellets.size === 0 && state === 'playing') completeLevel();
}

function checkCollisions() {
  if (graceTimer > 0) return;
  for (const cat of cats) {
    if (cat.respawnTimer > 0 || Math.hypot(player.x - cat.x, player.y - cat.y) > 0.72) continue;
    if (powerTimer > 0) {
      score += 200;
      levelRunScore += 200;
      const start = activeLevelDocument.actors.cats[cat.index] ?? CAT_STARTS[cat.index % CAT_STARTS.length];
      respawnCat(cat, start);
      beep(740, 0.1, 0.045, 'square');
      updateHud();
      saveGame(true);
    } else {
      lives -= 1;
      state = 'hit';
      requestRender('state:hit');
      hitTimer = 1.1;
      beep(95, 0.32, 0.08, 'sawtooth');
      vibrate([70, 35, 100]);
      updateHud();
      saveGame();
      break;
    }
  }
}

function completeLevel() {
  state = 'won';
  requestRender('state:won');
  audioService.setLevelMode('won');
  completedLevelIds.add(selectedLevelId);
  concertUnlocked = completedLevelIds.size === PASSAU_LEVELS.length;
  score += 500;
  levelRunScore += 500;
  updateCurrentLevelStatsSnapshot(true);
  best = Math.max(best, score);
  updateHud();
  beep(660, 0.12, 0.055, 'square');
  setTimeout(() => beep(880, 0.18, 0.05, 'square'), 140);
  launchLevelConfetti();
  if (globalProgressPercent() === 100) showGrandFinaleOverlay();
  else showLevelCompleteOverlay();
  saveGame();
}

function showLevelCompleteOverlay() {
  showOverlay(
    'winKicker',
    'winTitle',
    'winCopy',
    'winButton',
    () => {
      openMap();
    },
  );
}

function showGrandFinaleOverlay() {
  showOverlay(
    'finaleKicker',
    'finaleTitle',
    'finaleCopy',
    'winButton',
    openMap,
    {},
    { variant: 'grand-finale' },
  );
}

function advanceMapEndgame() {
  if (!mapEndgameActive || mapEndgamePhase !== 'reveal') return;
  if (endgamePage < 2) {
    endgamePage += 1;
    playUiSound(endgamePage === 2 ? 'success' : 'confirm');
    renderPassauMap();
    if (endgamePage === 2) {
      beep(523, 0.12, 0.04, 'square');
      setTimeout(() => beep(659, 0.12, 0.04, 'square'), 130);
      setTimeout(() => beep(784, 0.2, 0.045, 'square'), 260);
    }
    return;
  }
  concertRevealSeen = true;
  mapEndgameActive = false;
  clearMapEndgameTimers();
  playUiSound('success');
  ui.announcement.textContent = t('concertUnlockedAnnouncement');
  renderPassauMap();
  saveGame();
}

function finishGame() {
  state = 'over';
  requestRender('state:over');
  audioService.setLevelMode('over');
  best = Math.max(best, score);
  updateHud();
  showGameOverOverlay();
  saveGame();
}

function showGameOverOverlay() {
  showOverlay(
    'overKicker',
    'overTitle',
    'overCopy',
    'overButton',
    () => startGame(true),
    () => ({ score: score.toLocaleString('de-DE') }),
  );
}

function beep(frequency, duration, volume, type = 'sine') {
  audioService.beep(frequency, duration, volume, type);
}

function vibrate(pattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function render(frameTimestamp) {
  if (!pixelRenderer || !activeLevelDocument || !player) return;
  const forceRadarPaint = !Number.isFinite(frameTimestamp);
  const paintTimestamp = forceRadarPaint ? performance.now() : frameTimestamp;
  const { viewport: playViewport } = gameplayLayout.snapshot();
  const cutsceneSnapshot = state === 'cutscene' ? levelCutscenePlayer.snapshot() : null;
  const renderState = pixelRenderer.render(cutsceneSnapshot ? {
    level: activeLevelDocument,
    player: cutsceneSnapshot.player,
    cats: cutsceneSnapshot.cats,
    characters: cutsceneSnapshot.characters,
    decorations: cutsceneSnapshot.decorations,
    pellets: new Set(),
    powerUps: powerPellets,
    elapsed: levelCutscenePlayer.time,
    powerTimer: 0,
    hitTimer: 0,
    unlockedEvents: activeUnlockedEventIds(),
    activeEventId: null,
  } : {
    level: activeLevelDocument,
    player,
    cats,
    pellets,
    powerUps: powerPellets,
    elapsed,
    powerTimer,
    hitTimer: state === 'hit' ? hitTimer : 0,
    unlockedEvents: activeUnlockedEventIds(),
    activeEventId: activeEasterEgg?.id,
  }, {
    alpha: simulationLoop.interpolationAlpha,
    viewport: playViewport,
    cameraEnabled: cutsceneSnapshot ? true : isCameraGameView(),
    language,
    cameraTarget: cutsceneSnapshot?.camera ? {
      x: cutsceneSnapshot.camera.x * activeLevelDocument.board.tileSize + activeLevelDocument.board.tileSize / 2,
      y: cutsceneSnapshot.camera.y * activeLevelDocument.board.tileSize + activeLevelDocument.board.tileSize / 2,
    } : undefined,
    zoom: cutsceneSnapshot?.camera?.zoom ?? CAMERA_ZOOM,
    reducedMotion,
    staticRevision: staticWorldRevision,
    sceneChanged: ['playing', 'hit', 'cutscene'].includes(state),
  });
  canvas.dataset.rendererBackend = renderState.renderer.backend;
  canvas.dataset.rendererQuality = renderState.renderer.quality;
  canvas.dataset.playerScreenX = renderState.playerScreen.x.toFixed(1);
  canvas.dataset.playerScreenY = renderState.playerScreen.y.toFixed(1);
  canvas.dataset.playerX = (cutsceneSnapshot?.player.x ?? player.x).toFixed(3);
  canvas.dataset.playerY = (cutsceneSnapshot?.player.y ?? player.y).toFixed(3);
  canvas.dataset.playerDirection = cutsceneSnapshot?.player.direction?.name ?? player.dir.name;
  canvas.dataset.playerNextDirection = cutsceneSnapshot ? '' : player.nextDir.name;
  canvas.dataset.cutscene = state === 'cutscene' ? levelCutscenePlayer.cutscene.id : '';
  canvas.dataset.cutsceneTime = state === 'cutscene' ? levelCutscenePlayer.time.toFixed(3) : '';
  canvas.dataset.gameplayTop = playViewport.y.toFixed(1);
  canvas.dataset.gameplayBottom = (playViewport.y + playViewport.height).toFixed(1);
  if (forceRadarPaint || paintTimestamp - lastRadarPaint >= 50) {
    updateCatRadar(
      renderState.camera.source.x,
      renderState.camera.source.y,
      renderState.camera.source.width,
      renderState.camera.source.height,
      playViewport,
    );
    lastRadarPaint = paintTimestamp;
  }
}

function launchLevelConfetti() {
  clearTimeout(confettiTimer);
  if (reducedMotion) {
    uiSession.patch('levelOverlays', { confetti: [], confettiActive: false });
    return;
  }

  const colors = ['#4ce0b3', '#f5c451', '#ff6b5f', '#55d9dd', '#f4eee0'];
  const confetti = Array.from({ length: 72 }, (_, index) => ({
    x: `${(index * 37) % 101}%`,
    drift: `${((index * 29) % 170) - 85}px`,
    delay: `${(index % 12) * 36}ms`,
    duration: `${1500 + (index % 9) * 95}ms`,
    color: colors[index % colors.length],
    turn: `${360 + (index % 5) * 180}deg`,
  }));
  uiSession.patch('levelOverlays', { confetti, confettiActive: true });
  confettiTimer = setTimeout(() => {
    uiSession.patch('levelOverlays', { confetti: [], confettiActive: false });
  }, 2800);
}

function isCameraGameView() {
  return state !== 'map';
}

function isBoardFullscreen() {
  return document.fullscreenElement === ui.boardColumn
    || document.webkitFullscreenElement === ui.boardColumn;
}

function observedDevicePixelRatio(entries, cssWidth) {
  const canvasEntry = entries.find((entry) => entry.target === canvas);
  const devicePixelSize = canvasEntry?.devicePixelContentBoxSize;
  const box = Array.isArray(devicePixelSize) ? devicePixelSize[0] : devicePixelSize;
  const contentWidth = Number(canvasEntry?.contentRect?.width) || cssWidth;
  const deviceWidth = Number(box?.inlineSize);
  return resolveObservedDevicePixelRatio({
    deviceWidth,
    contentWidth,
    browserPixelRatio: window.devicePixelRatio || 1,
  });
}

function measureGameplayLayout(reason, entries = []) {
  const mobile = isMobileGameLayout() || isBoardFullscreen();
  const boardRect = ui.boardColumn.getBoundingClientRect();
  const blockerMeasurements = mobile
    ? [...document.querySelectorAll('[data-gameplay-blocker]')].map((element) => {
      if (element.hidden) return null;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return { visible: false };
      }
      return {
        bottom: boardRect.top + element.offsetTop + element.offsetHeight,
        visible: element.offsetWidth > 0 && element.offsetHeight > 0,
      };
    })
    : [];
  const headerBottom = highestVisibleBlockerBottom(blockerMeasurements, boardRect.top);
  const headerHeight = mobile ? Math.max(0, headerBottom - boardRect.top) : 0;
  ui.boardColumn.style.setProperty('--mobile-game-header-height', `${Math.round(headerHeight)}px`);

  const canvasRect = canvas.getBoundingClientRect();
  const hudBottom = highestVisibleBlockerBottom(blockerMeasurements, canvasRect.top);
  const layout = gameplayLayout.update({
    canvasWidth: canvasRect.width,
    canvasHeight: canvasRect.height,
    hudBottom,
    canvasTop: canvasRect.top,
    devicePixelRatio: observedDevicePixelRatio(entries, canvasRect.width),
    safeTop: 0,
    safeBottom: 0,
    mobile,
  });

  if (!pixelRenderer || layout.revision === appliedGameplayLayoutRevision) return layout;
  pixelRenderer.resize({
    width: layout.cssWidth,
    height: layout.cssHeight,
    devicePixelRatio: layout.devicePixelRatio,
    reason,
  });
  appliedGameplayLayoutRevision = layout.revision;
  requestRender(`layout:${reason}`);
  return layout;
}

function ensureCatRadarIndicators() {
  while (ui.catRadar.children.length < cats.length) {
    const indicator = document.createElement('div');
    indicator.className = 'cat-indicator';
    indicator.innerHTML = '<span class="cat-indicator-arrow" aria-hidden="true">▲</span><small></small>';
    ui.catRadar.append(indicator);
  }
  while (ui.catRadar.children.length > cats.length) ui.catRadar.lastElementChild.remove();
  return [...ui.catRadar.children];
}

function updateCatRadar(sourceX, sourceY, sourceWidth, sourceHeight, playViewport) {
  const active = isCameraGameView() && ['playing', 'hit'].includes(state);
  ui.catRadar.hidden = !active;
  if (!active) return;

  const indicators = ensureCatRadarIndicators();
  const centerX = playViewport.x + playViewport.width / 2;
  const centerY = playViewport.y + playViewport.height / 2;
  const horizontalInset = Math.min(28, playViewport.width * 0.08);
  const verticalInset = Math.min(26, playViewport.height * 0.1);
  const safeLeft = playViewport.x + horizontalInset;
  const safeRight = playViewport.x + playViewport.width - horizontalInset;
  const safeTop = playViewport.y + verticalInset;
  const safeBottom = playViewport.y + playViewport.height - verticalInset;
  let visibleIndicators = 0;

  cats.forEach((cat, index) => {
    const indicator = indicators[index];
    const catX = playViewport.x
      + ((cat.x * TILE + TILE / 2 - sourceX) / sourceWidth) * playViewport.width;
    const catY = playViewport.y
      + ((cat.y * TILE + TILE / 2 - sourceY) / sourceHeight) * playViewport.height;
    const onScreen = catX >= playViewport.x
      && catX <= playViewport.x + playViewport.width
      && catY >= playViewport.y
      && catY <= playViewport.y + playViewport.height;
    const hidden = onScreen || cat.respawnTimer > 0;
    indicator.hidden = hidden;
    if (hidden) return;

    const dx = catX - centerX;
    const dy = catY - centerY;
    const intersections = [];
    if (dx > 0) intersections.push((safeRight - centerX) / dx);
    if (dx < 0) intersections.push((safeLeft - centerX) / dx);
    if (dy > 0) intersections.push((safeBottom - centerY) / dy);
    if (dy < 0) intersections.push((safeTop - centerY) / dy);
    const factor = Math.min(...intersections.filter((value) => value >= 0));
    const distance = Math.max(1, Math.round(Math.hypot(player.x - cat.x, player.y - cat.y)));

    indicator.style.left = `${centerX + dx * factor}px`;
    indicator.style.top = `${centerY + dy * factor}px`;
    indicator.style.setProperty('--cat-color', cat.color);
    indicator.querySelector('.cat-indicator-arrow').style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI + 90}deg)`;
    indicator.querySelector('small').textContent = distance;
    indicator.classList.toggle('danger', distance <= 5);
    visibleIndicators += 1;
  });

  ui.catRadar.hidden = visibleIndicators === 0;
}

function frame(now) {
  simulationLoop.advance(now, (dt) => {
    if (state === 'cutscene') { updateLevelCutscene(dt); return; }
    if (state !== 'playing' && state !== 'hit') return;
    update(dt);
    autoSaveElapsed += dt;
    if (autoSaveElapsed >= 2) { autoSaveElapsed = 0; saveGame(true); }
  });
  renderScheduler.frame(now, currentRenderPolicy());
  requestAnimationFrame(frame);
}


document.addEventListener('keydown', (event) => {
  if (uiSession.snapshot().onboarding.open) return;
  if (settingsOpen) {
    if (event.code === 'Escape') {
      event.preventDefault();
      closeSettings();
    }
    return;
  }
  if (state === 'map' && mapSelectionOpen && event.code === 'Escape') {
    event.preventDefault();
    playUiSound('close');
    closeMapSelection(true);
    return;
  }
  if (import.meta.env.DEV && event.code === 'F7' && ['playing', 'hit', 'paused'].includes(state)) {
    event.preventDefault();
    state = 'paused';
    audioService.setLevelMode('paused');
    setPauseButtons(true);
    hideOverlay();
    requestRender('state:paused');
    return;
  }
  if (import.meta.env.DEV && event.code === 'F6' && ['playing', 'paused'].includes(state)) {
    event.preventDefault();
    const cameraTestPositions = [
      { x: 12, y: 20 }, { x: 1, y: 1 }, { x: 23, y: 1 },
      { x: 1, y: 23 }, { x: 23, y: 23 }, { x: 12, y: 12 },
    ];
    const nextIndex = (Number(canvas.dataset.debugCameraIndex ?? -1) + 1) % cameraTestPositions.length;
    const position = cameraTestPositions[nextIndex];
    canvas.dataset.debugCameraIndex = String(nextIndex);
    player.x = position.x;
    player.y = position.y;
    player.dir = DIRECTIONS.none;
    player.nextDir = DIRECTIONS.none;
    state = 'paused';
    setPauseButtons(true);
    hideOverlay();
    requestRender('debug:camera-position');
    return;
  }
  const debugCompleteLevel = ['F8', 'F9'].includes(event.code) || (event.altKey && event.code === 'KeyL');
  if (import.meta.env.DEV && debugCompleteLevel && ['playing', 'paused'].includes(state)) {
    event.preventDefault();
    if (event.shiftKey || event.code === 'F9') {
      completedLevelIds = new Set(PASSAU_LEVELS
        .filter((item) => item.id !== selectedLevelId)
        .map((item) => item.id));
    }
    if (pellets.size > 0) {
      pellets.clear();
      invalidateStaticWorld('debug-pellets-clear');
    }
    powerPellets.clear();
    completeLevel();
    return;
  }
  const mapping = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  if (mapping[event.code]) {
    event.preventDefault();
    setDirection(mapping[event.code]);
    return;
  }
  if (event.code === 'KeyP' || event.code === 'Space') {
    event.preventDefault();
    if (state === 'ready') startGame();
    else togglePause();
  }
  if (event.code === 'Enter' && uiSession.snapshot().overlay.open) activateOverlayPrimary();
});

canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  swipeInput.begin({ x: event.clientX, y: event.clientY, pointerId: event.pointerId });
  try { canvas.setPointerCapture?.(event.pointerId); } catch { /* Synthetic or already-ended pointers need no capture. */ }
});

function processSwipePointer(event) {
  const coalesced = event.getCoalescedEvents?.() ?? []; const samples = coalesced.length ? coalesced : [event]; let changedDirection = false;
  samples.forEach((point) => { const direction = swipeInput.update({ x: point.clientX, y: point.clientY, pointerId: event.pointerId }); if (!direction) return; setDirection(direction); changedDirection = true; if (state === 'playing') vibrate(4); });
  return changedDirection;
}

canvas.addEventListener('pointermove', (event) => {
  if (swipeInput.pointerId !== event.pointerId) return;
  event.preventDefault();
  processSwipePointer(event);
});

canvas.addEventListener('pointerup', (event) => {
  if (swipeInput.pointerId !== event.pointerId) return;
  event.preventDefault();
  processSwipePointer(event);
  const finalDirection = swipeInput.end({ x: event.clientX, y: event.clientY, pointerId: event.pointerId });
  if (finalDirection) setDirection(finalDirection);
  if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener('pointercancel', (event) => {
  if (swipeInput.pointerId === event.pointerId) swipeInput.cancel();
});

canvas.addEventListener('lostpointercapture', (event) => {
  if (swipeInput.pointerId === event.pointerId) swipeInput.cancel();
});

uiSession.registerCommands({
  openSettings,
  closeSettings,
  toggleSound,
  toggleReducedMotion,
  togglePause: toggleSettingsPause,
  togglePauseFromHud: togglePause,
  openMap,
  selectMapLocation,
  closeMapSelection(returnFocus) {
    playUiSound('close');
    closeMapSelection(Boolean(returnFocus));
  },
  startMapSelection,
  advanceMapEndgame,
  activateOverlayPrimary,
  activateOverlaySecondary,
  skipCutscene() {
    if (state === 'cutscene' && levelCutscenePlayer.skip()) enterLevelPlay();
  },
  setLanguage,
  setDifficulty,
  validateOnboarding: validateOnboardingLogin,
  setOnboardingLanguage(nextLanguage) {
    onboardingLanguage = nextLanguage;
    updateOnboardingChoices();
  },
  setOnboardingDifficulty(nextDifficulty) {
    onboardingDifficulty = nextDifficulty;
    updateOnboardingChoices();
  },
  prepareOnboardingGuide,
  moveOnboardingGuide,
  finishOnboarding,
  newGame() {
    closeSettings(false);
    showNewGameConfirmation();
  },
  deleteData() {
    closeSettings(false);
    showDeleteBrowserDataConfirmation();
  },
});

mount(UiApp, {
  target: document.querySelector('#svelte-ui'),
  props: { session: uiSession },
});
mountUiSurfaces(uiSession);

void registerGameServiceWorker({
  navigator: window.navigator,
  baseUrl: new URL(import.meta.env.BASE_URL, window.location.href),
  production: import.meta.env.PROD,
});
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.matches('#sound-button, #settings-sound-button, #settings-open-button, #mobile-game-menu-button, #settings-close-button, #settings-map-button, #new-game-button, #delete-browser-data-button, #onboarding-finish, .map-marker')) return;
  if (button.dataset.uiSound === 'none') return;
  const cue = button.dataset.uiSound
    ?? (button.matches('#map-selection-close') ? 'close'
      : button.matches('#settings-reduced-motion-button, [data-language], [data-difficulty], [data-onboarding-language], [data-onboarding-difficulty]')
      ? 'select'
      : button.classList.contains('primary-button') ? 'confirm' : 'press');
  playUiSound(cue);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
  if (!document.hidden) {
    simulationLoop.reset();
    renderScheduler.reset();
    requestRender('visibility:return');
  }
});

document.addEventListener('touchmove', (event) => {
  if (document.body.classList.contains('mobile-game-active')) event.preventDefault();
}, { passive: false });

window.addEventListener('resize', () => measureGameplayLayout('window-resize'));
window.addEventListener('orientationchange', () => measureGameplayLayout('orientation-change'));
document.addEventListener('fullscreenchange', () => measureGameplayLayout('fullscreen-change'));
const gameplayLayoutResizeObserver = 'ResizeObserver' in window
  ? new ResizeObserver((entries) => measureGameplayLayout('resize-observer', entries))
  : null;
const gameplayBlockers = [...document.querySelectorAll('[data-gameplay-blocker]')];
gameplayLayoutResizeObserver?.observe(canvas);
gameplayLayoutResizeObserver?.observe(ui.boardFrame);
gameplayBlockers.forEach((element) => gameplayLayoutResizeObserver?.observe(element));
measureGameplayLayout('initial');
canvas.addEventListener('webglcontextrestored', () => requestRender('context:restored'));
window.addEventListener('pagehide', () => {
  saveGame(true);
  audioService.destroy();
  pixelRenderer?.destroy();
});

pixelRendererReady.then((renderer) => {
  pixelRenderer = renderer;
  presentationPacer.setFramesPerSecond(recommendedPresentationRate(renderer.rendererInfo().quality));
  renderScheduler.reset();
  if (storedGame) restoreGame(storedGame);
  else {
    buildLevel();
    applyLanguage();
    updateHud();
    openMap();
  }
  if (requiresOnboarding) showOnboarding();
  measureGameplayLayout('renderer-ready');
  requestAnimationFrame(frame);
}).catch((error) => {
  console.error('Renderer konnte nicht initialisiert werden.', error);
  ui.announcement.textContent = 'Die Grafik konnte nicht initialisiert werden. Bitte die Seite neu laden.';
});

if (import.meta.env.DEV) {
  window.__GASSI_AUDIO_DEBUG__ = () => audioService.soundscapeSnapshot();
  window.__GASSI_RENDERER_DEBUG__ = () => ({
    ...(pixelRenderer?.rendererInfo() ?? { backend: 'initializing' }),
    scheduler: renderScheduler.snapshot(),
    staticWorldRevision,
    renderPolicy: currentRenderPolicy(),
  });
  window.__GASSI_DEBUG__ = () => ({
    state,
    player: { x: player.x, y: player.y, direction: player.dir.name, nextDirection: player.nextDir.name },
    treats: pellets.size,
    powerUps: powerPellets.size,
    score,
    level,
    language,
    selectedLevelId,
    completedLevelIds: [...completedLevelIds],
    globalProgress: globalProgressPercent(),
    lives,
    difficulty,
    soundEnabled,
    reducedMotion,
    settingsContext: settingsContextForState(state, settingsReturnState),
    lastUiSoundCue: audioService.lastUiCue,
    soundscape: audioService.soundscapeSnapshot(),
    directionHistory: [...directionHistory],
    treatsCollected: Math.max(0, levelTreatTotal - pellets.size),
    treatsTotal: levelTreatTotal,
    eggs: [...unlockedEggs],
    saved: loadGame(),
  });
  window.__GASSI_DEBUG_STEP__ = (seconds) => {
    const steps = Math.max(0, Math.round(seconds * 60));
    for (let index = 0; index < steps; index += 1) update(1 / 60);
    requestRender('debug:step');
    return window.__GASSI_DEBUG__();
  };
  window.__GASSI_DEBUG_SET_PLAYER__ = (x, y) => {
    player.x = x;
    player.y = y;
    player.dir = DIRECTIONS.none;
    player.nextDir = DIRECTIONS.none;
    checkLocationEasterEggs();
    requestRender('debug:player-position');
    return window.__GASSI_DEBUG__();
  };
  window.__GASSI_DEBUG_COMPLETE__ = () => {
    if (pellets.size > 0) {
      pellets.clear();
      invalidateStaticWorld('debug-pellets-clear');
    }
    powerPellets.clear();
    completeLevel();
    return window.__GASSI_DEBUG__();
  };
  window.__GASSI_DEBUG_COMPLETE_ALL__ = () => {
    completedLevelIds = new Set(PASSAU_LEVELS
      .filter((item) => item.id !== selectedLevelId)
      .map((item) => item.id));
    if (pellets.size > 0) {
      pellets.clear();
      invalidateStaticWorld('debug-pellets-clear');
    }
    powerPellets.clear();
    completeLevel();
    return window.__GASSI_DEBUG__();
  };
  window.__GASSI_DEBUG_CUTSCENE__ = (cutscene) => {
    activeLevelDocument = createLevelDocument({ ...activeLevelDocument, cutscenes: [cutscene] });
    pixelRenderer.setLevel(activeLevelDocument);
    invalidateStaticWorld('debug-content-import');
    hideOnboarding();
    document.body.classList.remove('map-active');
    enterMobileGameMode();
    renderPassauMap();
    hideOverlay();
    runStarted = true;
    startLevelCutscene();
    requestRender('debug:cutscene');
    return window.__GASSI_DEBUG__();
  };
}
