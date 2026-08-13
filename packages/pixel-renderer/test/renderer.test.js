import test from 'node:test';
import assert from 'node:assert/strict';
import { PassauPixelRenderer, createLevelDocument, drawActorPreview } from '../src/index.js';

function fakeCanvas({ width = 0, height = 0, onLayoutRead, onClientSizeRead } = {}) {
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; },
  });
  const scene = { width: 0, height: 0, getContext: (kind) => kind === '2d' ? context : null };
  return {
    width: 0, height: 0,
    get clientWidth() { onClientSizeRead?.(); return width; },
    get clientHeight() { onClientSizeRead?.(); return height; },
    getContext: (kind) => kind === '2d' ? context : null,
    ownerDocument: { createElement: () => scene },
    getBoundingClientRect() { onLayoutRead?.(); return { width, height }; },
  };
}

function fakePresentationBackend() {
  return {
    kind: 'canvas2d', resizeCalls: 0,
    resizeArguments: [],
    resize(width, height) { this.resizeCalls += 1; this.resizeArguments.push([width, height]); },
    present() {},
    snapshot: () => ({ backend: 'canvas2d' }),
  };
}

function sampleLevel() {
  return { id: 'resize-sample', board: { columns: 9, rows: 9, walls: [] }, actors: { cats: [] }, theme: { edgeEffects: [] } };
}

function sampleSnapshot() {
  return { level: sampleLevel() };
}

function createTestRenderer(presentationBackend = fakePresentationBackend()) {
  return new PassauPixelRenderer(fakeCanvas({ width: 320, height: 240 }), { pixelRatio: 1, presentationBackend });
}

function recordingRenderCanvas() {
  const gradient = { addColorStop() {} };
  const createContext = () => new Proxy({ texts: [], operations: [] }, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'measureText') return () => ({ width: 0 });
      if (property === 'fillText') return (value) => { target.texts.push(value); target.operations.push(['text', value]); };
      if (property === 'fillRect') return (...args) => { target.operations.push(['rect', target.fillStyle, ...args]); };
      if (property === 'translate') return (...args) => { target.operations.push(['translate', ...args]); };
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; },
  });
  return {
    width: 0,
    height: 0,
    clientWidth: 320,
    clientHeight: 240,
    getContext: () => createContext(),
    ownerDocument: {
      createElement: () => {
        const context = createContext();
        return { width: 0, height: 0, getContext: () => context };
      },
    },
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
  };
}

test('rebuilds a same-id level when the immutable input document changes', () => {
  const renderer = new PassauPixelRenderer(fakeCanvas(), { pixelRatio: 1 });
  const first = createLevelDocument({ id: 'same-id', board: { columns: 9, rows: 9, walls: [] }, actors: { cats: [] } });
  const second = createLevelDocument({ ...first, board: { ...first.board, walls: [{ x: 3, y: 3, width: 1, height: 1 }] } });
  renderer.setLevel(first);
  renderer.setLevelIfChanged(second);
  assert.equal(renderer.grid[3][3], true);
  assert.equal(renderer.level.board.walls.length, 1);
});

test('reuses externally measured display metrics without reading layout during render', () => {
  let layoutReads = 0;
  const canvas = fakeCanvas({ width: 412, height: 712, onLayoutRead: () => { layoutReads += 1; } });
  const renderer = new PassauPixelRenderer(canvas, { quality: 'quality', presentationBackend: fakePresentationBackend() });
  renderer.resize({ width: 412, height: 712, devicePixelRatio: 2.625, reason: 'observer' });
  const readsAfterResize = layoutReads;
  renderer.setLevel(sampleLevel());
  renderer.render(sampleSnapshot(), { cameraEnabled: true });
  assert.equal(layoutReads, readsAfterResize);
  assert.deepEqual(renderer.rendererInfo().display, {
    width: 412, height: 712, actualPixelRatio: 2.625, pixelRatio: 2,
    bufferWidth: 824, bufferHeight: 1424, reason: 'observer',
  });
});

test('returns one immutable fixed-contract presentation frame per render', () => {
  const renderer = createTestRenderer();
  const level = sampleLevel();
  renderer.resize({ width: 320, height: 240, devicePixelRatio: 1, reason: 'observer' });
  const snapshot = {
    level,
    elapsed: 3,
    player: { id: 'player', x: 2, y: 3, previousX: 0, previousY: 1 },
    cats: [{ id: 'cat-1', x: 5, y: 2, previousX: 3, previousY: 2, color: '#ff00ff', respawnTimer: 4 }],
    characters: [{ id: 'character-1', x: 4, y: 3, previousX: 2, previousY: 1, color: '#00ffff' }],
  };

  const first = renderer.render(snapshot, { alpha: 0.5, cameraEnabled: false, presentationTime: 12.5 });
  const second = renderer.render(snapshot, { alpha: 0.5, cameraEnabled: false });

  assert.equal(first.kind, 'franz-lola-presentation-frame');
  assert.equal(first.frameId, 1);
  assert.equal(second.frameId, 2);
  assert.equal(first.presentationTime, 12.5);
  assert.equal(second.presentationTime, 3);
  assert.equal(first.player.world.x, renderer.level.board.tileSize * 1.5);
  assert.equal(first.cats[0].world.x, renderer.level.board.tileSize * 4.5);
  assert.equal(first.cats[0].onScreen, true);
  assert.equal(first.cats[0].distance, 3);
  assert.equal(first.cats[0].color, '#ff00ff');
  assert.equal(first.cats[0].respawnTimer, 4);
  assert.deepEqual(Object.keys(first), ['kind', 'frameId', 'presentationTime', 'camera', 'player', 'cats', 'characters', 'display', 'renderer', 'playerScreen', 'entities', 'characterEntities']);
  assert.throws(() => { first.cats[0].world.x = 1; }, TypeError);
});

test('keeps frame IDs private and independent from public writes', () => {
  const firstRenderer = createTestRenderer();
  const secondRenderer = createTestRenderer();
  const firstSnapshot = { level: sampleLevel() };
  const secondSnapshot = { level: sampleLevel() };
  firstRenderer.resize({ width: 320, height: 240, devicePixelRatio: 1, reason: 'observer' });
  secondRenderer.resize({ width: 320, height: 240, devicePixelRatio: 1, reason: 'observer' });

  assert.equal(Object.hasOwn(firstRenderer, 'frameId'), false);
  firstRenderer.frameId = 100;
  assert.equal(firstRenderer.render(firstSnapshot).frameId, 1);
  assert.equal(secondRenderer.render(secondSnapshot).frameId, 1);
  assert.equal(firstRenderer.render(firstSnapshot).frameId, 2);
});
test('skips backend resize for unchanged externally measured display metrics', () => {
  const backend = fakePresentationBackend();
  const renderer = new PassauPixelRenderer(fakeCanvas({ width: 412, height: 712 }), { presentationBackend: backend });
  renderer.resize({ width: 412, height: 712, devicePixelRatio: 2.625, reason: 'observer' });
  renderer.resize({ width: 412, height: 712, devicePixelRatio: 2.625, reason: 'observer' });
  assert.equal(backend.resizeCalls, 1);
  renderer.resize({ width: 412, height: 713, devicePixelRatio: 2.625, reason: 'observer' });
  assert.equal(backend.resizeCalls, 2);
});

test('normalizes zero externally measured display metrics without reading client size', () => {
  let clientSizeReads = 0;
  const canvas = fakeCanvas({ width: 412, height: 712, onClientSizeRead: () => { clientSizeReads += 1; } });
  const renderer = new PassauPixelRenderer(canvas, { quality: 'quality', presentationBackend: fakePresentationBackend() });
  assert.deepEqual(renderer.resize({ width: 0, height: 0, devicePixelRatio: 2, reason: 'hidden' }), {
    width: 1, height: 1, pixelRatio: 2, bufferWidth: 2, bufferHeight: 2, changed: true, reason: 'hidden',
  });
  assert.equal(clientSizeReads, 0);
});

test('normalizes non-finite externally measured dimensions before backend resize', () => {
  const backend = fakePresentationBackend();
  const renderer = new PassauPixelRenderer(fakeCanvas(), { quality: 'quality', presentationBackend: backend });
  assert.deepEqual(renderer.resize({ width: Infinity, height: -Infinity, devicePixelRatio: 2, reason: 'observer' }), {
    width: 1, height: 1, pixelRatio: 2, bufferWidth: 2, bufferHeight: 2, changed: true, reason: 'observer',
  });
  assert.deepEqual(backend.resizeArguments, [[2, 2]]);
});

test('reports the requested backend, selected backend, and fallback reason', async () => {
  const canvas = fakeCanvas();
  const renderer = await PassauPixelRenderer.create(canvas, { backend: 'webgl2', quality: 'quality' });

  assert.deepEqual(renderer.rendererInfo(), {
    requestedBackend: 'webgl2',
    backend: 'canvas2d',
    fallbackReason: 'WebGL 2 ist auf diesem Gerät nicht verfügbar.',
    frameCount: 0,
    gpuAccelerated: false,
    contextLost: false,
    resourceMetrics: { applicability: 'not-applicable', reason: 'canvas2d-cpu-compositor' },
    backingStoreResizes: 0,
    quality: 'quality',
    pixelRatio: 1,
    display: null,
    staticWorldBuilds: 0,
    postProcess: null,
  });
});

test('reuses the retained static world until its revision changes', () => {
  const renderer = createTestRenderer();
  const level = sampleLevel();
  const snapshot = { level, pellets: new Set(['1,1']) };
  renderer.setLevel(level);
  renderer.render(snapshot, { staticRevision: 4 });
  snapshot.pellets.add('2,2');
  renderer.render(snapshot, { staticRevision: 4 });
  assert.equal(renderer.rendererInfo().staticWorldBuilds, 1);
  renderer.render(snapshot, { staticRevision: 5 });
  assert.equal(renderer.rendererInfo().staticWorldBuilds, 2);
});

test('isolates Canvas2D environment cadence animation from retained static geometry', () => {
  const level = {
    ...sampleLevel(),
    board: {
      ...sampleLevel().board,
      walls: [
        { id: 'retained-wall', x: 4, y: 4, width: 1, height: 1, useThemeColor: false, color: '#553322', accent: '#f5c451', pattern: 'solid' },
        {
          id: 'animated-wall', x: 5, y: 4, width: 1, height: 1, useThemeColor: false, color: '#aa00ff', accent: '#f5c451', pattern: 'solid',
          effects: [{ id: 'wall-echo', type: 'echo', intensity: 0.5, speed: 1, color: '#55d9dd' }],
        },
      ],
    },
    theme: {
      landmark: 'zauberberg',
      elements: [{ id: 'stage-lights', animation: { type: 'bob', speed: 1, amplitude: 0.5 } }],
      edgeEffects: [{ id: 'river', type: 'water-flow', side: 'left', speed: 1, intensity: 1, count: 1, color: '#2379a3', accent: '#f5c451' }],
    },
  };
  const renderer = new PassauPixelRenderer(recordingRenderCanvas(), { pixelRatio: 1, quality: 'quality', presentationBackend: fakePresentationBackend() });
  const snapshot = { level, pellets: new Set(['2,2']) };

  renderer.render({ ...snapshot, elapsed: 0 }, { staticRevision: 7 });
  renderer.environmentContext.operations.length = 0;
  renderer.staticWorldContext.operations.length = 0;
  renderer.render({ ...snapshot, elapsed: 0.049 }, { staticRevision: 7 });
  assert.equal(renderer.environmentContext.operations.length, 0);
  assert.equal(renderer.staticWorldContext.operations.length, 0);
  assert.equal(renderer.rendererInfo().staticWorldBuilds, 1);

  renderer.render({ ...snapshot, elapsed: 0.05 }, { staticRevision: 7 });
  const waterRects = renderer.environmentContext.operations
    .filter(([type, color]) => type === 'rect' && color === '#2379a3')
    .map(([, , left, top]) => [left, top]);
  assert.deepEqual(waterRects[0], [3, -16]);
  assert.equal(renderer.environmentContext.operations.some(([type, color]) => type === 'rect' && color === '#aa00ff'), true);
  assert.equal(renderer.environmentContext.operations.some(([type, x, y]) => type === 'translate' && x === 0 && y > 3 && y < 4), true);
  assert.equal(renderer.environmentContext.operations.some(([type, color]) => type === 'rect' && color === '#0b0810'), false);
  assert.equal(renderer.environmentContext.operations.some(([type, color]) => type === 'rect' && color === '#131018'), false);
  assert.equal(renderer.environmentContext.operations.some(([type, color]) => type === 'rect' && color === '#0b1620'), false);
  assert.equal(renderer.environmentContext.operations.some(([type, color]) => type === 'rect' && color === '#553322'), false);
  assert.equal(renderer.staticWorldContext.operations.length, 0);
  assert.equal(renderer.rendererInfo().staticWorldBuilds, 1);
});

test('legacy callers rebuild retained pellets and decorations when their inputs change', () => {
  const renderer = createTestRenderer();
  const level = sampleLevel();
  const pellets = new Set(['1,1']);
  renderer.render({ level, pellets });
  renderer.render({ level, pellets });
  assert.equal(renderer.rendererInfo().staticWorldBuilds, 1);
  pellets.add('2,2');
  renderer.render({ level, pellets });
  assert.equal(renderer.rendererInfo().staticWorldBuilds, 2);
  const replacementPellets = new Set(pellets);
  const replacementDecorations = [];
  renderer.render({ level, pellets: replacementPellets, decorations: replacementDecorations });
  assert.equal(renderer.rendererInfo().staticWorldBuilds, 3);
  renderer.render({ level, pellets: replacementPellets, decorations: replacementDecorations }, { language: 'dialect' });
  assert.equal(renderer.rendererInfo().staticWorldBuilds, 4);
});

test('forwards explicit clean scene markers while preserving the legacy dirty default', () => {
  const presented = [];
  const backend = { ...fakePresentationBackend(), present(frame) { presented.push(frame); } };
  const renderer = createTestRenderer(backend);
  const level = sampleLevel();
  renderer.render({ level }, { staticRevision: 1, sceneChanged: false });
  renderer.render({ level }, { staticRevision: 1 });
  assert.equal(presented[0].sceneChanged, false);
  assert.equal(presented[1].sceneChanged, true);
});

test('advances appearance animation frames while reusing the static world', () => {
  const level = {
    ...sampleLevel(),
    decorations: [{
      id: 'animated-sprite', type: 'custom', x: 1, y: 1, width: 1, height: 1, color: '#ffffff',
      appearance: {
        width: 1, height: 1, palette: ['transparent', '#ff0000', '#0000ff'], pixels: ['1'],
        animations: [{ id: 'blink', fps: 1, loop: true, frames: [{ pixels: ['1'] }, { pixels: ['2'] }] }],
      },
      spriteAnimation: 'blink',
    }],
  };
  const renderer = new PassauPixelRenderer(recordingRenderCanvas(), { pixelRatio: 1, presentationBackend: fakePresentationBackend() });
  renderer.render({ level, elapsed: 0 }, { staticRevision: 1 });
  renderer.sceneContext.operations.length = 0;
  renderer.render({ level, elapsed: 1 }, { staticRevision: 1 });
  assert.ok(renderer.sceneContext.operations.some(([type, color]) => type === 'rect' && color === '#0000ff'));
});

test('draws snapshot-controlled decorations at their current position without rebuilding the static world', () => {
  const level = createLevelDocument({
    ...sampleLevel(),
    decorations: [{ id: 'moving-rock', type: 'rock', x: 1, y: 1, width: 1, height: 1, color: '#123abc' }],
  });
  const renderer = new PassauPixelRenderer(recordingRenderCanvas(), { pixelRatio: 1, presentationBackend: fakePresentationBackend() });
  renderer.render({ level, decorations: level.decorations }, { staticRevision: 1 });
  renderer.sceneContext.operations.length = 0;
  renderer.render({ level, decorations: [{ ...level.decorations[0], x: 4 }] }, { staticRevision: 1 });
  assert.equal(renderer.rendererInfo().staticWorldBuilds, 1);
  assert.ok(renderer.sceneContext.operations.some(([type, color, left]) => type === 'rect' && color === '#123abc' && left > 96));
});

test('draws active and inactive event visuals after reusing the static world', () => {
  const level = {
    ...sampleLevel(),
    events: [{
      id: 'inactive-event',
      name: { standard: 'Inactive' },
      message: { standard: 'Inactive' },
      trigger: { type: 'time', seconds: 1 },
      visual: { type: 'custom', x: 2, y: 2, label: 'I', visibility: 'always' },
    }, {
      id: 'active-event',
      name: { standard: 'Active' },
      message: { standard: 'Active' },
      trigger: { type: 'time', seconds: 1 },
      visual: { type: 'custom', x: 3, y: 3, label: 'A', visibility: 'after-trigger' },
    }],
  };
  const renderer = new PassauPixelRenderer(recordingRenderCanvas(), { pixelRatio: 1, presentationBackend: fakePresentationBackend() });
  const snapshot = { level, levelEvents: { active: 'active-event' } };
  renderer.render(snapshot, { staticRevision: 1 });
  renderer.sceneContext.texts.length = 0;
  renderer.render(snapshot, { staticRevision: 1 });
  assert.deepEqual(renderer.sceneContext.texts.sort(), ['A', 'I']);
});

test('draws power-ups before event visuals on retained frames', () => {
  const level = {
    ...sampleLevel(),
    events: [{
      id: 'always-event',
      name: { standard: 'Always' },
      message: { standard: 'Always' },
      trigger: { type: 'time', seconds: 1 },
      visual: { type: 'custom', x: 2, y: 2, label: 'E', visibility: 'always' },
    }],
  };
  const renderer = new PassauPixelRenderer(recordingRenderCanvas(), { pixelRatio: 1, presentationBackend: fakePresentationBackend() });
  const snapshot = { level, powerUps: new Set(['1,1']) };
  renderer.render(snapshot, { staticRevision: 1 });
  renderer.sceneContext.operations.length = 0;
  renderer.render(snapshot, { staticRevision: 1 });
  const powerUpIndex = renderer.sceneContext.operations.findIndex(([type]) => type === 'rect');
  const eventIndex = renderer.sceneContext.operations.findIndex(([type, value]) => type === 'text' && value === 'E');
  assert.ok(powerUpIndex >= 0);
  assert.ok(eventIndex >= 0);
  assert.ok(powerUpIndex < eventIndex);
});

function previewContext() {
  const fills = [];
  return {
    fills,
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {},
    fillRect(...args) { fills.push(args); },
    strokeRect() {}, moveTo() {}, lineTo() {}, stroke() {},
    set fillStyle(value) {}, set strokeStyle(value) {}, set lineWidth(value) {},
  };
}

test('actor previews use the same custom appearance painter as the game', () => {
  const context = previewContext();
  const actor = { appearance: {
    width: 2, height: 2, palette: ['transparent', '#ffffff'], pixels: ['11', '11'],
    animations: [{ id: 'right', fps: 2, loop: true, frames: [{ pixels: ['11', '11'] }] }],
    stateAnimations: { right: 'right' },
  } };
  assert.equal(drawActorPreview(context, actor, { left: 0, top: 0, width: 80, height: 50 }, { state: 'right', elapsed: 0.25 }), true);
  assert.equal(context.fills.length, 2);
  assert.deepEqual(context.fills.map((fill) => fill.slice(2)), [[56, 28], [56, 28]]);
});

test('actor previews render the gameplay fallback for cats without custom sprites', () => {
  const context = previewContext();
  drawActorPreview(context, { color: '#ff6b5f', accent: '#6fdb9e' }, { width: 48, height: 48 }, { kind: 'cat', state: 'left' });
  assert.ok(context.fills.length >= 10);
});
