import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const componentFiles = [
  'ActorThumbnail.svelte',
  'ObjectThumbnail.svelte',
  'CutscenePreview.svelte',
  'MotionTimelineEditor.svelte',
  'SpriteSheetEditor.svelte',
  'PlaytestWorkspace.svelte',
].map((file) => new URL(`../src/components/${file}`, import.meta.url));

test('studio components do not own requestAnimationFrame loops', async () => {
  for (const file of componentFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /requestAnimationFrame\s*\(/, file);
    assert.doesNotMatch(source, /cancelAnimationFrame\s*\(/, file);
  }
});

test('coordinated studio surfaces compile without Svelte warnings', async () => {
  const { compile } = await import('svelte/compiler');
  for (const file of componentFiles) {
    const source = await readFile(file, 'utf8');
    const result = compile(source, { filename: file.pathname, generate: 'client' });
    assert.deepEqual(result.warnings, [], file);
  }
});
const { createLevelDocument } = await import('@franz-lola/content-model');
const { createGameSession } = await import('@franz-lola/game-core');
const { createRenderCoordinator } = await import('@franz-lola/render-coordinator');
const playtestEngineModule = await import('../src/playtest-engine.js');
const { createStudioRenderSession } = await import('../src/render/studio-render-session.svelte.js');
const { createRenderSurfaceLifecycle } = await import('../src/render/use-render-surface.svelte.js');

function createFrameClock() {
  let pending = null;
  let nextHandle = 1;
  return {
    adapter: {
      requestFrame(callback) {
        assert.equal(pending, null, 'one coordinator owns one queued browser frame');
        pending = { callback, handle: nextHandle++ };
        return pending.handle;
      },
      cancelFrame(handle) {
        if (pending?.handle === handle) pending = null;
      },
      now: () => 0,
    },
    present(timestamp) {
      const frame = pending;
      pending = null;
      frame?.callback(timestamp);
    },
    pendingCount: () => pending ? 1 : 0,
  };
}

function createLifecycleHarness({ profile = 'editor', documentVisible = true } = {}) {
  const clock = createFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  const frames = [];
  const observers = {};
  let visibilityListenerRemoved = false;
  const environment = {
    devicePixelRatio: () => 2,
    documentVisible: () => documentVisible,
    subscribeDocumentVisibility(callback) {
      observers.documentVisibility = callback;
      return () => { visibilityListenerRemoved = true; };
    },
    createResizeObserver(callback) {
      observers.resize = callback;
      return { observe() {}, disconnect() {} };
    },
    createIntersectionObserver(callback) {
      observers.intersection = callback;
      return { observe() {}, disconnect() {} };
    },
    reducedMotionQuery: () => null,
  };
  const surface = createRenderSurfaceLifecycle({
    coordinator,
    id: 'behavior-surface',
    profile,
    render: (frame) => frames.push(frame),
    environment,
  });
  const node = { getBoundingClientRect: () => ({ width: 320, height: 180 }) };
  return {
    clock,
    coordinator,
    frames,
    observers,
    surface,
    node,
    setDocumentVisible(value) { documentVisible = value; observers.documentVisibility?.(); },
    visibilityListenerRemoved: () => visibilityListenerRemoved,
  };
}

test('a surface can move between exact static, playback and paused profiles without a second coordinator', () => {
  const harness = createLifecycleHarness({ profile: 'thumbnail-static' });
  const mounted = harness.surface.action(harness.node);
  harness.clock.present(0);
  assert.equal(harness.coordinator.snapshot().surfaces['behavior-surface'].profile, 'thumbnail-static');

  harness.surface.setProfile('thumbnail-animated');
  harness.surface.setActive(true);
  const beforePlayback = harness.frames.length;
  for (let timestamp = 1000 / 60; timestamp <= 1000; timestamp += 1000 / 60) harness.clock.present(timestamp);
  const playbackPresentations = harness.frames.length - beforePlayback;
  assert.ok(playbackPresentations >= 25 && playbackPresentations <= 31, `expected 25-31 presentations, received ${playbackPresentations}`);
  assert.equal(harness.coordinator.snapshot().surfaces['behavior-surface'].profile, 'thumbnail-animated');

  harness.surface.setActive(false);
  assert.equal(harness.clock.pendingCount(), 0);
  harness.surface.setProfile('editor');
  assert.equal(harness.coordinator.snapshot().surfaces['behavior-surface'].profile, 'editor');
  assert.equal(Object.keys(harness.coordinator.snapshot().surfaces).length, 1);
  mounted.destroy();
});

test('offscreen animated playback sleeps, resumes without hidden work and pauses cleanly', () => {
  const harness = createLifecycleHarness({ profile: 'thumbnail-animated' });
  const mounted = harness.surface.action(harness.node);
  harness.clock.present(0);
  harness.surface.setActive(true);
  harness.clock.present(1000 / 30);
  const visibleCount = harness.frames.length;

  harness.observers.intersection([{ isIntersecting: false }]);
  assert.equal(harness.clock.pendingCount(), 0);
  for (let timestamp = 100; timestamp <= 500; timestamp += 100) harness.clock.present(timestamp);
  assert.equal(harness.frames.length, visibleCount);

  harness.observers.intersection([{ isIntersecting: true }]);
  harness.clock.present(600);
  assert.equal(harness.frames.length, visibleCount + 1);
  harness.surface.setActive(false);
  assert.equal(harness.clock.pendingCount(), 0);
  mounted.destroy();
});

test('document-hidden playback sleeps and cleanup removes visibility ownership before remount', () => {
  const harness = createLifecycleHarness({ profile: 'playtest' });
  const firstMount = harness.surface.action(harness.node);
  harness.clock.present(0);
  harness.surface.setActive(true);
  harness.clock.present(1000 / 60);
  const visibleCount = harness.frames.length;

  harness.setDocumentVisible(false);
  assert.equal(harness.clock.pendingCount(), 0);
  harness.clock.present(1000);
  assert.equal(harness.frames.length, visibleCount);
  firstMount.destroy();
  assert.equal(harness.visibilityListenerRemoved(), true);
  assert.deepEqual(harness.coordinator.snapshot().surfaces, {});

  harness.setDocumentVisible(true);
  const secondMount = harness.surface.action(harness.node);
  harness.clock.present(1100);
  assert.equal(Object.keys(harness.coordinator.snapshot().surfaces).length, 1);
  secondMount.destroy();
});

test('reduced motion retires continuous playtest work after its final presentation', () => {
  const clock = createFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  const frames = [];
  const session = createStudioRenderSession({ coordinator, id: 'reduced-playtest', profile: 'playtest', active: true, render: (frame) => frames.push(frame) });
  clock.present(0);
  session.setReducedMotion(true);
  clock.present(1000 / 60);
  clock.present(2000 / 60);
  assert.equal(clock.pendingCount(), 0);
  assert.equal(coordinator.snapshot().surfaces['reduced-playtest'].active, false);
  assert.ok(frames.length <= 3, `reduced playtest kept presenting ${frames.length} frames`);
  session.destroy();
});
function parityLevel() {
  return createLevelDocument({
    id: 'playtest-parity',
    board: { columns: 7, rows: 7, tileSize: 24, tunnelRows: [3], walls: [] },
    actors: {
      player: { x: 3, y: 3 },
      cats: [{ id: 'parity-cat', x: 5, y: 5, behavior: { strategy: 'stationary', respawnDelay: 0 } }],
    },
    collectibles: { powerUps: [] },
    gameplay: { pelletSeed: 73, treatTargets: { easy: 10, normal: 10, hard: 10 } },
  });
}

test('playtest snapshots and presentation input preserve the game-core fixed-step contract', () => {
  const level = parityLevel();
  const engine = new playtestEngineModule.PlaytestEngine(level, 'normal');
  const game = createGameSession({ level, difficulty: 'normal', seed: level.gameplay.pelletSeed });
  for (const [input, dt] of [['right', 0.1], ['up', 1 / 60], ['left', 0.075]]) {
    engine.queueInput(input);
    game.queueInput(input);
    assert.deepEqual(engine.step(dt), game.step(dt));
  }

  assert.equal(typeof playtestEngineModule.createPlaytestPresentation, 'function');
  const snapshot = engine.snapshot();
  const presentation = playtestEngineModule.createPlaytestPresentation(snapshot, {
    cameraEnabled: false,
    zoom: 1.25,
    reducedMotion: true,
  });
  assert.equal(presentation.snapshot, snapshot);
  assert.deepEqual(presentation.options, {
    cameraEnabled: false,
    zoom: 1.25,
    alpha: snapshot.interpolationAlpha,
    presentationTime: snapshot.elapsed,
    reducedMotion: true,
  });
  assert.equal(Object.hasOwn(presentation.snapshot, 'editor'), false, 'editor overlays do not fork simulation snapshots');
});
