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
const studioRenderModule = await import('../src/render/studio-render-session.svelte.js');
const { createStudioRenderSession } = studioRenderModule;
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
test('paused preview edits produce one static frame for nested pixels, palette, keyframes and effects', () => {
  assert.equal(typeof studioRenderModule.thumbnailRenderRevision, 'function');
  const appearance = {
    width: 2,
    height: 2,
    palette: ['transparent', '#55d9dd'],
    pixels: ['10', '01'],
    animations: [{ id: 'idle', duration: 1, loop: false, keyframes: [{ id: 'a', time: 0, pixels: ['10', '01'] }] }],
    stateAnimations: { idle: 'idle' },
  };
  const actor = { appearance, effects: [{ id: 'neon', type: 'neon', color: '#55d9dd', intensity: 0.5 }] };
  const revision = () => studioRenderModule.thumbnailRenderRevision({ actor, appearance, animationId: 'idle', elapsed: 0 });
  const clock = createFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  const frames = [];
  const session = createStudioRenderSession({ coordinator, id: 'paused-preview', profile: 'thumbnail-static', render: (frame) => frames.push(frame) });
  let lastRevision = '';
  function flushEdit(timestamp) {
    const nextRevision = revision();
    if (nextRevision !== lastRevision) session.invalidate('thumbnail:edit');
    lastRevision = nextRevision;
    clock.present(timestamp);
    clock.present(timestamp + 1300);
  }

  flushEdit(0);
  assert.equal(frames.length, 1);
  appearance.pixels[0] = '11';
  flushEdit(2000);
  assert.equal(frames.length, 2, 'pixel edit presents exactly once');
  appearance.palette[1] = '#ff4f87';
  flushEdit(4000);
  assert.equal(frames.length, 3, 'palette edit presents exactly once');
  appearance.animations[0].keyframes[0].pixels[1] = '11';
  flushEdit(6000);
  assert.equal(frames.length, 4, 'keyframe edit presents exactly once');
  actor.effects[0].intensity = 0.8;
  flushEdit(8000);
  assert.equal(frames.length, 5, 'effect edit presents exactly once');
  flushEdit(10000);
  assert.equal(frames.length, 5, 'unchanged static preview remains asleep');
  session.destroy();
});

test('actor and object thumbnail activity distinguishes non-loop deadlines, loops and one-frame content', () => {
  assert.equal(typeof studioRenderModule.getActorThumbnailAnimationActivity, 'function');
  assert.equal(typeof studioRenderModule.getObjectThumbnailAnimationActivity, 'function');
  const frames = [{ pixels: ['0'] }, { pixels: ['1'] }];
  const appearance = {
    animations: [
      { id: 'once', duration: 1, loop: false, keyframes: [{ time: 0, pixels: ['0'] }, { time: 0.75, pixels: ['1'] }] },
      { id: 'loop', duration: 1, loop: true, keyframes: [{ time: 0, pixels: ['0'] }, { time: 0.5, pixels: ['1'] }] },
      { id: 'still', fps: 4, loop: true, frames: [frames[0]] },
    ],
    stateAnimations: { idle: 'once' },
  };
  assert.deepEqual(studioRenderModule.getActorThumbnailAnimationActivity({ appearance, animationId: 'once' }), { continuous: false, duration: 1 });
  assert.deepEqual(studioRenderModule.getActorThumbnailAnimationActivity({ appearance, animationId: 'loop' }), { continuous: true, duration: 0 });
  assert.deepEqual(studioRenderModule.getActorThumbnailAnimationActivity({ appearance, animationId: 'still' }), { continuous: false, duration: 0 });
  assert.deepEqual(studioRenderModule.getActorThumbnailAnimationActivity({ appearance, animationId: 'once', elapsed: 0.4 }), { continuous: false, duration: 0 });
  assert.deepEqual(studioRenderModule.getActorThumbnailAnimationActivity({ actor: { effects: [{ type: 'glitch' }] }, appearance, animationId: 'still' }), { continuous: true, duration: 0 });
  assert.deepEqual(studioRenderModule.getObjectThumbnailAnimationActivity({ appearance, spriteAnimation: 'once', animation: { type: 'none' }, effects: [] }), { continuous: false, duration: 1 });
  assert.deepEqual(studioRenderModule.getObjectThumbnailAnimationActivity({ appearance, spriteAnimation: 'loop', animation: { type: 'none' }, effects: [] }), { continuous: true, duration: 0 });
  assert.deepEqual(studioRenderModule.getObjectThumbnailAnimationActivity({ appearance: null, animation: { type: 'keyframes', duration: 0.75, loop: false, keyframes: [{ time: 0 }, { time: 0.75 }] }, effects: [] }), { continuous: false, duration: 0.75 });
});

test('non-loop activity uses a visible local epoch, settles, pauses offscreen and restarts by revision', () => {
  const clock = createFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  const frames = [];
  const session = createStudioRenderSession({ coordinator, id: 'thumbnail-deadline', profile: 'thumbnail-animated', render: (frame) => frames.push(frame) });
  session.setAnimationActivity({ continuous: false, duration: 1, restartKey: 'actor-v1' });
  clock.present(5000);
  clock.present(5600);
  session.setVisible(false);
  clock.present(15600);
  session.setVisible(true);
  clock.present(16000);
  clock.present(16400);
  assert.deepEqual(frames.map((frame) => frame.animationElapsed), [0, 0.6, 0.6, 1]);
  assert.equal(frames.at(-1).animationSettled, true);
  assert.equal(clock.pendingCount(), 0);
  assert.equal(coordinator.snapshot().surfaces['thumbnail-deadline'].active, false);

  session.setAnimationActivity({ continuous: false, duration: 1, restartKey: 'actor-v1' });
  assert.equal(clock.pendingCount(), 0, 'same revision does not restart settled playback');
  session.setAnimationActivity({ continuous: false, duration: 1, restartKey: 'actor-v2' });
  assert.equal(clock.pendingCount(), 1);
  clock.present(20000);
  assert.equal(frames.at(-1).animationElapsed, 0);
  session.setAnimationActivity({ continuous: true, duration: 0, restartKey: 'loop-v1' });
  clock.present(21000);
  assert.equal(clock.pendingCount(), 1, 'looping playback keeps its cadence');
  session.setAnimationActivity({ continuous: false, duration: 0, restartKey: 'still-v1' });
  assert.equal(clock.pendingCount(), 0, 'one-frame content sleeps');
  session.destroy();
});

test('combined actor and object activity preserves finite duration alongside effects', () => {
  const appearance = {
    animations: [{
      id: 'once',
      duration: 1,
      loop: false,
      keyframes: [{ time: 0, pixels: ['0'] }, { time: 0.75, pixels: ['1'] }],
    }],
    stateAnimations: { idle: 'once' },
  };
  const actorActivity = studioRenderModule.getActorThumbnailAnimationActivity({
    actor: { appearance, effects: [{ type: 'glitch' }] },
    appearance,
    animationId: 'once',
  });
  const objectActivity = studioRenderModule.getObjectThumbnailAnimationActivity({
    appearance,
    spriteAnimation: 'once',
    animation: { type: 'keyframes', duration: 0.75, loop: false, keyframes: [{ time: 0 }, { time: 0.75 }] },
    effects: [{ type: 'neon' }],
  });
  assert.deepEqual(actorActivity, { continuous: true, duration: 1 });
  assert.deepEqual(objectActivity, { continuous: true, duration: 1 });
});

test('continuous ambient presentation advances finite thumbnail sources from a local epoch', () => {
  const clock = createFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  const frames = [];
  const session = createStudioRenderSession({ coordinator, id: 'combined-activity', profile: 'thumbnail-animated', render: (frame) => frames.push(frame) });
  session.setAnimationActivity({ continuous: true, duration: 1, restartKey: 'object-v1' });
  clock.present(5500);
  clock.present(5534);
  clock.present(6500);
  clock.present(6534);
  assert.deepEqual(frames.map(({ animationElapsed }) => animationElapsed), [0, 0.034, 1, 1.034]);
  assert.deepEqual(frames.map(({ animationSettled }) => animationSettled), [false, false, true, true]);
  assert.equal(clock.pendingCount(), 1, 'the effect remains ambient after the finite sources settle');

  session.setVisible(false);
  session.setVisible(true);
  clock.present(16534);
  assert.equal(frames.at(-1).animationElapsed, 1.034, 'offscreen time is not integrated');
  session.setAnimationActivity({ continuous: true, duration: 1, restartKey: 'actor-v2' });
  clock.present(18000);
  assert.equal(frames.at(-1).animationElapsed, 0, 'a new revision owns a fresh epoch');
  session.setProfile('editor');
  session.setReducedMotion(true);
  clock.present(18034);
  clock.present(19000);
  assert.equal(clock.pendingCount(), 0, 'reduced motion retires continuous effects after its final frame');
  session.destroy();
});
test('visible playtest deltas clamp like Game while explicit resumes discard hidden time', () => {
  assert.equal(typeof playtestEngineModule.playtestFrameDelta, 'function');
  assert.equal(playtestEngineModule.playtestFrameDelta(null, 16), 0);
  assert.equal(playtestEngineModule.playtestFrameDelta(0, 16), 0.016);
  assert.equal(playtestEngineModule.playtestFrameDelta(16, 116), 0.1);
  assert.equal(playtestEngineModule.playtestFrameDelta(116, 616), 0.1);
  assert.equal(playtestEngineModule.playtestFrameDelta(616, 600), 0);
  assert.equal(playtestEngineModule.playtestFrameDelta(616, Number.NaN), 0);
  assert.equal(playtestEngineModule.playtestFrameDelta(616, 5000, { resume: true }), 0);
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
  let previousTimestamp = null;
  for (const [input, timestamp, resume] of [['right', 16, false], ['up', 116, false], ['left', 616, false], ['down', 5000, true], ['right', 5016, false]]) {
    const dt = playtestEngineModule.playtestFrameDelta(previousTimestamp, timestamp, { resume });
    previousTimestamp = timestamp;
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
