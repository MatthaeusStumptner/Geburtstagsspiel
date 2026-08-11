# Shared Rendering and Cat Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make game, cat radar, studio canvases, thumbnails, cutscenes, and playtest consume one explicit PresentationFrame and one coordinated presentation scheduler.

**Architecture:** The renderer owns interpolation and world-to-screen projection. A pure `render-coordinator` package owns when visible surfaces present; individual Svelte components no longer run independent RAF loops. Game and studio retain separate UI adapters, but both consume the same frame and game-core snapshot contracts.

**Tech Stack:** JavaScript ES modules, Canvas2D, WebGL2, WebGPU, Svelte 5, Node test runner, Playwright, CSS transforms.

## Global Constraints

- Requires the completed Monorepo Foundation plan and its green root gate.
- `PresentationFrame` is the only source for screen-space entity positions.
- Simulation remains fixed-step and independent of display refresh rate.
- No DOM measurement is allowed in a render callback or cat-radar update.
- Hidden surfaces and static thumbnails must stop presenting.
- Reduced Motion disables decorative animation without disabling direct editing feedback.
- Preserve current Renderer Canvas2D/WebGL2/WebGPU fallback behavior and performance budgets.
- Preserve the game’s existing state-dependent sleep behavior for map, pause, win, over, and hidden tabs.
- Every task uses TDD and ends with a separate reviewable commit.

---

## Planned File Structure

```text
packages/pixel-renderer/src/presentation-frame.js
packages/pixel-renderer/test/presentation-frame.test.js
packages/render-coordinator/package.json
packages/render-coordinator/src/index.js
packages/render-coordinator/src/render-coordinator.js
packages/render-coordinator/src/profiles.js
packages/render-coordinator/test/render-coordinator.test.js
apps/game/src/render/cat-radar-model.js
apps/game/src/render/cat-radar-view.js
apps/game/test/cat-radar-model.test.js
apps/studio/src/render/studio-render-session.svelte.js
apps/studio/src/render/use-render-surface.svelte.js
packages/testkit/test/presentation-parity.test.js
apps/studio/e2e/rendering.spec.js
```

### Task 1: Formalize the immutable PresentationFrame

**Files:**
- Create: `packages/pixel-renderer/src/presentation-frame.js`
- Create: `packages/pixel-renderer/test/presentation-frame.test.js`
- Modify: `packages/pixel-renderer/src/passau-pixel-renderer.js`
- Modify: `packages/pixel-renderer/src/index.js`
- Modify: `packages/pixel-renderer/test/renderer.test.js`

**Interfaces:**
- Consumes: the renderer’s current `{ camera, playerScreen, entities, characterEntities, display, renderer }` return value.
- Produces: `createPresentationFrame(input)` and `isPresentationFrame(value)`, plus renderer return fields `kind`, `frameId`, `presentationTime`, `player`, `cats`, and `characters`.

- [ ] **Step 1: Write the failing immutable-frame test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPresentationFrame, isPresentationFrame } from '../src/presentation-frame.js';

test('creates an immutable presentation frame with world and screen coordinates', () => {
  const frame = createPresentationFrame({
    frameId: 7,
    presentationTime: 12.5,
    camera: { source: { x: 10, y: 20, width: 100, height: 80 }, viewport: { x: 0, y: 40, width: 400, height: 320 } },
    player: { id: 'player', world: { x: 20, y: 30 }, screen: { x: 40, y: 80 } },
    cats: [{ id: 'cat-1', world: { x: 140, y: 30 }, screen: { x: 520, y: 80 }, onScreen: false, distance: 12, color: '#ff00ff', respawnTimer: 0 }],
    characters: [],
    display: { width: 400, height: 360, actualPixelRatio: 2.625, pixelRatio: 2, bufferWidth: 800, bufferHeight: 720 },
    renderer: { requestedBackend: 'auto', backend: 'webgl2', fallbackReason: null, contextLost: false },
  });
  assert.equal(isPresentationFrame(frame), true);
  assert.equal(frame.kind, 'franz-lola-presentation-frame');
  assert.equal(frame.cats[0].screen.x, 520);
  assert.throws(() => { frame.cats[0].screen.x = 1; }, TypeError);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test packages/pixel-renderer/test/presentation-frame.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement frame construction**

```js
const freezePoint = (point) => Object.freeze({ x: Number(point.x), y: Number(point.y) });
const freezeEntity = (entity) => Object.freeze({
  ...entity,
  world: freezePoint(entity.world),
  screen: freezePoint(entity.screen),
});

export function createPresentationFrame(input) {
  if (!Number.isInteger(input.frameId) || input.frameId < 1) throw new TypeError('frameId muss positiv und ganzzahlig sein.');
  if (!Number.isFinite(input.presentationTime)) throw new TypeError('presentationTime muss endlich sein.');
  return Object.freeze({
    kind: 'franz-lola-presentation-frame',
    frameId: input.frameId,
    presentationTime: input.presentationTime,
    camera: Object.freeze({ source: Object.freeze({ ...input.camera.source }), viewport: Object.freeze({ ...input.camera.viewport }) }),
    player: freezeEntity(input.player),
    cats: Object.freeze(input.cats.map(freezeEntity)),
    characters: Object.freeze(input.characters.map(freezeEntity)),
    display: Object.freeze({ ...input.display }),
    renderer: Object.freeze({ ...input.renderer }),
  });
}

export function isPresentationFrame(value) {
  return value?.kind === 'franz-lola-presentation-frame'
    && Number.isInteger(value.frameId)
    && Number.isFinite(value.presentationTime);
}
```

- [ ] **Step 4: Return the contract from `PassauPixelRenderer.render`**

Maintain a private monotonic `frameId`. Accept `options.presentationTime`; use `elapsed` only as the deterministic fallback. Build each cat from the already interpolated actor:

```js
{
  id,
  world,
  screen: projectWorldPoint(camera, world),
  onScreen,
  distance,
  color,
  respawnTimer,
}
```

The player and characters use the same camera and same interpolation alpha. Keep legacy aliases `playerScreen`, `entities`, and `characterEntities` for one migration plan, but assert that they reference the same immutable points/arrays.

- [ ] **Step 5: Verify renderer contracts**

Run:

```bash
node --test packages/pixel-renderer/test/presentation-frame.test.js packages/pixel-renderer/test/renderer.test.js
npm test --workspace @franz-lola/pixel-renderer
npm run build --workspace @franz-lola/pixel-renderer
```

Expected: all pass; frame IDs increase exactly once per `render` call and explicit presentation times are preserved.

- [ ] **Step 6: Commit the PresentationFrame**

```bash
git add packages/pixel-renderer/src packages/pixel-renderer/test
git diff --cached --check
git commit -m "feat: expose immutable presentation frames"
```

### Task 2: Add the shared RenderCoordinator package

**Files:**
- Create: `packages/render-coordinator/package.json`
- Create: `packages/render-coordinator/src/index.js`
- Create: `packages/render-coordinator/src/profiles.js`
- Create: `packages/render-coordinator/src/render-coordinator.js`
- Create: `packages/render-coordinator/test/fake-frame-clock.js`
- Create: `packages/render-coordinator/test/render-coordinator.test.js`
- Modify: root `test/workspace-contract.test.js`
- Modify: root `package-lock.json`

**Interfaces:**
- Consumes: browser- or test-supplied `requestFrame`, `cancelFrame`, and `now` functions.
- Produces: `createRenderCoordinator(options)`, `RENDER_PROFILES`, `registerSurface(config)`, `invalidate(id, reason)`, `setSurfaceState(id, state)`, and `snapshot()`.

- [ ] **Step 1: Write failing scheduler behavior tests**

```js
import { createFakeFrameClock } from './fake-frame-clock.js';
import { createRenderCoordinator } from '../src/render-coordinator.js';

test('renders invalidated on-demand surfaces once and sleeping surfaces never', () => {
  const clock = createFakeFrameClock();
  const renders = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'level', profile: 'editor', render: (frame) => renders.push(frame) });
  coordinator.invalidate('level', 'selection');
  clock.present(0);
  clock.present(16.67);
  assert.equal(renders.length, 1);
  assert.equal(coordinator.snapshot().surfaces.level.lastReason, 'selection');
});

test('coalesces visible animated surfaces in one RAF and respects maxFps', () => {
  const clock = createFakeFrameClock();
  const renders = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'a', profile: 'thumbnail-animated', render: ({ timestamp }) => renders.push(['a', timestamp]) });
  coordinator.registerSurface({ id: 'b', profile: 'thumbnail-animated', render: ({ timestamp }) => renders.push(['b', timestamp]) });
  for (const timestamp of [0, 16, 34, 50, 68, 84, 102]) clock.present(timestamp);
  assert.deepEqual(renders.map(([id]) => id), ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test packages/render-coordinator/test/render-coordinator.test.js`

Expected: FAIL because the package does not exist.

- [ ] **Step 3: Create the package, deterministic clock, and exact profiles**

Use this package identity:

```json
{
  "name": "@franz-lola/render-coordinator",
  "version": "0.0.0-monorepo",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.js" },
  "scripts": { "test": "node --test" },
  "engines": { "node": ">=22.14.0" }
}
```

`createFakeFrameClock()` owns one queued callback at a time and returns `{ adapter, present(timestamp), pendingCount() }`; `adapter` exposes deterministic `requestFrame(callback)`, `cancelFrame(handle)`, and `now()` without browser globals. Then define:

```js
export const RENDER_PROFILES = Object.freeze({
  game: Object.freeze({ mode: 'continuous', maxFps: 60 }),
  playtest: Object.freeze({ mode: 'continuous', maxFps: 60 }),
  editor: Object.freeze({ mode: 'on-demand', maxFps: 60 }),
  'thumbnail-animated': Object.freeze({ mode: 'animated', maxFps: 30 }),
  'thumbnail-static': Object.freeze({ mode: 'on-demand', maxFps: 1 }),
  test: Object.freeze({ mode: 'manual', maxFps: 60 }),
});
```

- [ ] **Step 4: Implement one shared RAF loop**

Each registered surface tracks `visible`, `active`, `dirty`, `lastReason`, `lastPresentedAt`, and counters. `continuous` presents while visible and active. `animated` presents at its max cadence while visible and active. `on-demand` presents only when dirty. `manual` presents only through `presentNow(id, timestamp)`. Hidden surfaces clear pending dirty work but preserve the latest reason for diagnostics. Destroying the last active surface cancels the RAF.

- [ ] **Step 5: Add the eighth workspace to the structural contract**

Update the exact package list in `test/workspace-contract.test.js` to include:

```text
@franz-lola/render-coordinator
```

Run:

```bash
npm install --ignore-scripts
npm test --workspace @franz-lola/render-coordinator
node --test test/workspace-contract.test.js
```

- [ ] **Step 6: Commit the coordinator package**

```bash
git add packages/render-coordinator package.json package-lock.json test/workspace-contract.test.js
git diff --cached --check
git commit -m "feat: coordinate shared render surfaces"
```

### Task 3: Move the game radar model onto PresentationFrame entities

**Files:**
- Create: `apps/game/src/render/cat-radar-model.js`
- Create: `apps/game/src/render/cat-radar-view.js`
- Create: `apps/game/test/cat-radar-model.test.js`
- Modify: `apps/game/src/main.js`
- Modify: `apps/game/src/style.css`
- Modify: `apps/game/test/browser-game-regression-contracts.test.js`
- Modify: `apps/game/package.json`
- Modify: `packages/testkit/src/fixtures.js`

**Interfaces:**
- Consumes: `PresentationFrame.cats`, `PresentationFrame.player`, and `camera.viewport`.
- Produces: `calculateCatRadar(frame, options) -> { visible, indicators }` and `updateCatRadarView(container, radarState)`.

- [ ] **Step 1: Write the failing projection test**

```js
import { fixturePresentationFrame } from '@franz-lola/render-testkit';

test('anchors an offscreen cat from the exact presentation screen point', () => {
  const frame = fixturePresentationFrame({
    viewport: { x: 0, y: 80, width: 400, height: 300 },
    player: { screen: { x: 200, y: 230 } },
    cats: [{ id: 'cat-1', screen: { x: 520, y: 180 }, world: { x: 20, y: 5 }, onScreen: false, distance: 12.4, color: '#f25f5c', respawnTimer: 0 }],
  });
  const result = calculateCatRadar(frame, { active: true });
  assert.equal(result.visible, true);
  assert.deepEqual(result.indicators[0], {
    id: 'cat-1', hidden: false, x: 372, y: 203.125, angle: 81.119, distance: 12, danger: false, color: '#f25f5c',
  });
});

test('never recomputes screen position from raw actor coordinates', () => {
  const frame = fixturePresentationFrame({ cats: [{ id: 'cat-1', screen: { x: -100, y: 100 }, world: { x: 9999, y: 9999 }, onScreen: false, distance: 4.6, color: '#fff', respawnTimer: 0 }] });
  assert.equal(calculateCatRadar(frame, { active: true }).indicators[0].x, 28);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/game/test/cat-radar-model.test.js`

Expected: FAIL because the radar model does not exist.

Before implementing the model, export `fixturePresentationFrame(overrides = {})` from render-testkit. It returns a deeply frozen schema-valid PresentationFrame baseline and recursively merges only `camera.viewport`, `player`, `cats`, and `characters` overrides. Add `"@franz-lola/render-testkit": "0.0.0-monorepo"` to the game `devDependencies`.

- [ ] **Step 3: Implement the pure radar model**

Use only `frame.camera.viewport`, `frame.player.screen`, and each cat’s presented fields. Clamp the ray from viewport center to the cat screen point against insets `min(28, width*0.08)` and `min(26, height*0.1)`. Hide on-screen or respawning cats. Round display distance with `Math.max(1, Math.round(cat.distance))`. Round model output coordinates and angle to three decimals so tests remain deterministic.

- [ ] **Step 4: Implement transform-only view updates**

Create/reuse one indicator by stable cat ID. Update position with:

```js
indicator.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
```

Cache the last `distance`, `danger`, `color`, `angle`, and `hidden` values in a `WeakMap`; update text/classes/custom properties only when they change. Never call `getBoundingClientRect`, `offset*`, or `getComputedStyle` from this adapter.

- [ ] **Step 5: Remove the 20 FPS path from game main**

Delete `lastRadarPaint`, the `paintTimestamp - lastRadarPaint >= 50` condition, and `updateCatRadar(sourceX, ...)`. Immediately after `pixelRenderer.render`, pass the returned frame to the view adapter once per actual game presentation. When the game render policy sleeps, radar also sleeps.

Replace `.cat-indicator` positional `left/top` writes with a fixed origin and compositor transform. Replace the brightness-filter danger animation with opacity/scale steps or a pseudo-element so the transform used for positioning is not overwritten.

- [ ] **Step 6: Verify unit and real-browser behavior**

Run:

```bash
node --test apps/game/test/cat-radar-model.test.js
npm test --workspace @franz-lola/game
npm run test:browser --workspace @franz-lola/game
```

Add browser assertions that over a two-second 60/120/175-Hz simulation: radar update count equals the presentation delta, every visible bubble stays within the gameplay viewport, and its ray angle differs by at most 0.5 degrees from the corresponding `PresentationFrame` entity.

- [ ] **Step 7: Commit the radar integration**

```bash
git add apps/game/src/render apps/game/src/main.js apps/game/src/style.css apps/game/test
git diff --cached --check
git commit -m "fix: synchronize cat radar with presented entities"
```

### Task 4: Adapt the stable game render scheduler to the shared coordinator

**Files:**
- Create: `apps/game/src/render/game-render-session.js`
- Create: `apps/game/test/game-render-session.test.js`
- Modify: `apps/game/src/render/render-scheduler.js`
- Modify: `apps/game/src/render/render-policy.js`
- Modify: `apps/game/src/main.js`
- Modify: `apps/game/package.json`

**Interfaces:**
- Consumes: existing game render policies and `createRenderCoordinator`.
- Produces: `createGameRenderSession({ coordinator, render })` with `frame(timestamp, policy)`, `invalidate(reason)`, `reset()`, and `snapshot()`.

- [ ] **Step 1: Characterize the existing scheduler before replacement**

```js
test('shared game adapter preserves hidden, once, and continuous policies', () => {
  const harness = createGameRenderHarness();
  harness.session.invalidate('state:paused');
  harness.session.frame(0, { mode: 'once' });
  harness.session.frame(16, { mode: 'once' });
  assert.deepEqual(harness.reasons, ['state:paused']);
  harness.session.frame(32, { mode: 'hidden' });
  assert.equal(harness.renders, 1);
  harness.session.frame(48, { mode: 'continuous', maxFps: 60 });
  assert.equal(harness.renders, 2);
});
```

- [ ] **Step 2: Verify RED against the missing adapter**

Run: `node --test apps/game/test/game-render-session.test.js`

Expected: FAIL because `createGameRenderSession` does not exist.

- [ ] **Step 3: Implement a compatibility adapter, not a second scheduler**

Map game policies to one coordinator surface named `game`. Preserve first-pending-reason semantics, tab restore reset, exact 60-FPS presentation cap, manual debug step, and current diagnostic fields. The game’s global RAF may still advance the fixed simulation, but only the coordinator invokes renderer presentation.

- [ ] **Step 4: Remove direct renderer scheduling from main**

`main.js` creates one game render session and invalidates it on the existing build, pellet, event, language, layout, context, and state transitions. There must be one `pixelRenderer.render` callsite in the game adapter and zero direct `PresentationFramePacer` callsites in the app.

- [ ] **Step 5: Verify scheduler parity and browser pacing**

Run:

```bash
node --test apps/game/test/render-policy.test.js apps/game/test/render-scheduler.test.js apps/game/test/game-render-session.test.js
npm test --workspace @franz-lola/game
npm run test:browser --workspace @franz-lola/game
```

Expected: map and pause sleep; gameplay remains within 60 FPS; simulated 60/120/175 Hz positions remain identical.

- [ ] **Step 6: Commit the game adapter**

```bash
git add apps/game/src/render apps/game/src/main.js apps/game/test apps/game/package.json package-lock.json
git diff --cached --check
git commit -m "refactor: run game presentation through shared coordinator"
```

### Task 5: Integrate the main studio LevelCanvas with the shared coordinator

**Files:**
- Create: `apps/studio/src/render/studio-render-session.svelte.js`
- Create: `apps/studio/src/render/use-render-surface.svelte.js`
- Create: `apps/studio/test/studio-render-session.test.js`
- Modify: `apps/studio/src/components/LevelCanvas.svelte`
- Modify: `apps/studio/src/main.js`
- Modify: `apps/studio/package.json`

**Interfaces:**
- Consumes: `createRenderCoordinator`, studio project snapshot, viewport snapshot, and `PassauPixelRenderer`.
- Produces: a shared studio coordinator and `useRenderSurface({ id, profile, visible, render })` lifecycle helper.

- [ ] **Step 1: Write failing visibility and invalidation tests**

```js
test('level canvas renders immediately after a pointer edit and sleeps when unchanged', () => {
  const harness = createStudioRenderHarness();
  harness.level.invalidate('pointer:wall');
  harness.clock.present(10);
  harness.clock.present(20);
  assert.equal(harness.level.renderCount, 1);
  harness.level.setVisible(false);
  harness.level.invalidate('project:cloud-sync');
  harness.clock.present(30);
  assert.equal(harness.level.renderCount, 1);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/studio/test/studio-render-session.test.js`

Expected: FAIL because the render session does not exist.

- [ ] **Step 3: Create one coordinator per studio tab**

The main studio module creates one coordinator and provides it through Svelte context. The lifecycle helper registers on mount, updates visibility through IntersectionObserver and workspace state, invalidates on reactive data changes, forwards ResizeObserver measurements, and unregisters/destroys on unmount.

- [ ] **Step 4: Remove LevelCanvas 100-ms throttling**

Delete its independent RAF and `timestamp - lastDraw >= 100` gate. Pointer edits invalidate with a reason and present on the next display frame. Ambient animation marks the surface `active` only when the visible level contains animated edges, decorations, text, characters, or effects; otherwise it remains on-demand.

- [ ] **Step 5: Verify canvas behavior**

Run:

```bash
node --test apps/studio/test/studio-render-session.test.js
npm test --workspace @franz-lola/studio
npm run test:e2e --workspace @franz-lola/studio -- --grep "level canvas|immediate"
```

Add E2E diagnostics `data-render-count` and `data-last-render-reason` in development/test builds. Assert one next-frame update after a pointer gesture and no further render-count increase across 500 ms of a static scene.

- [ ] **Step 6: Commit the main studio surface**

```bash
git add apps/studio/src/render apps/studio/src/components/LevelCanvas.svelte apps/studio/src/main.js apps/studio/test apps/studio/package.json package-lock.json
git diff --cached --check
git commit -m "refactor: coordinate studio level rendering"
```

### Task 6: Move thumbnails, cutscenes, animation playback, and playtest onto coordinated surfaces

**Files:**
- Modify: `apps/studio/src/components/ActorThumbnail.svelte`
- Modify: `apps/studio/src/components/ObjectThumbnail.svelte`
- Modify: `apps/studio/src/components/CutscenePreview.svelte`
- Modify: `apps/studio/src/components/MotionTimelineEditor.svelte`
- Modify: `apps/studio/src/components/SpriteSheetEditor.svelte`
- Modify: `apps/studio/src/components/PlaytestWorkspace.svelte`
- Modify: `apps/studio/src/playtest-engine.js`
- Create: `apps/studio/test/render-surface-profiles.test.js`
- Modify: `apps/studio/e2e/editor.spec.js`

**Interfaces:**
- Consumes: shared studio render session, `game-core` session, renderer PresentationFrame.
- Produces: no component-owned RAF loops; all surfaces declare a coordinator profile and visibility.

- [ ] **Step 1: Add a failing source contract against component RAF loops**

```js
test('studio components do not own requestAnimationFrame loops', async () => {
  for (const file of componentFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /requestAnimationFrame\s*\(/, file);
    assert.doesNotMatch(source, /cancelAnimationFrame\s*\(/, file);
  }
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/studio/test/render-surface-profiles.test.js`

Expected: FAIL on ActorThumbnail, ObjectThumbnail, CutscenePreview, timeline/playback, and PlaytestWorkspace.

- [ ] **Step 3: Assign exact surface profiles**

Use:

```text
ActorThumbnail static frame          thumbnail-static
ActorThumbnail playing animation     thumbnail-animated
ObjectThumbnail static               thumbnail-static
ObjectThumbnail animated/effects     thumbnail-animated
Cutscene paused/scrubbing             editor
Cutscene playback                     playtest
Sprite playback                       thumbnail-animated
Motion timeline playback              thumbnail-animated
PlaytestWorkspace active              playtest
PlaytestWorkspace paused/hidden       editor/hidden
```

- [ ] **Step 4: Share playtest simulation and presentation**

Playtest uses the same `createGameSession` and fixed-step input contract as the game. It sends the session snapshot and interpolation alpha to the same renderer, with editor overlays supplied only through renderer options. Fullscreen-camera simulation uses the same measured display contract as game.

- [ ] **Step 5: Verify surface sleeping and visual parity**

Run:

```bash
node --test apps/studio/test/render-surface-profiles.test.js
npm test --workspace @franz-lola/studio
npm run test:e2e --workspace @franz-lola/studio
npm run test:visual --workspace @franz-lola/studio
```

E2E must scroll thumbnail lists offscreen and assert their render counters stop, play an animation and assert 25–31 presentations over one second, pause it and assert the counter stabilizes, and compare playtest player/cat coordinates to the game-core snapshot.

- [ ] **Step 6: Commit coordinated studio surfaces**

```bash
git add apps/studio/src/components apps/studio/src/playtest-engine.js apps/studio/test apps/studio/e2e
git diff --cached --check
git commit -m "refactor: coordinate every studio render surface"
```

### Task 7: Add cross-application presentation parity and performance gates

**Files:**
- Create: `packages/testkit/test/presentation-parity.test.js`
- Create: `apps/studio/e2e/rendering.spec.js`
- Modify: `apps/game/scripts/browser-game-regression.mjs`
- Modify: `packages/pixel-renderer/scripts/browser-regression.mjs`
- Modify: root `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Golden Scene, game-core input script, game/studio render diagnostics.
- Produces: root `test:presentation-parity` and mandatory browser artifact set.

- [ ] **Step 1: Write the failing pure parity test**

```js
test('game and studio adapters project the golden scene identically', async () => {
  const fixture = await loadGoldenProject('hals-smoke');
  const gameFrame = await renderGoldenFrame({ adapter: 'game', fixture, presentationTime: 2 });
  const studioFrame = await renderGoldenFrame({ adapter: 'studio', fixture, presentationTime: 2 });
  assert.deepEqual(studioFrame.camera, gameFrame.camera);
  assert.deepEqual(studioFrame.player, gameFrame.player);
  assert.deepEqual(studioFrame.cats, gameFrame.cats);
  assert.deepEqual(studioFrame.display, gameFrame.display);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test packages/testkit/test/presentation-parity.test.js`

Expected: FAIL until game/studio test adapters expose the frame.

- [ ] **Step 3: Add test-only frame capture adapters**

Expose the last immutable PresentationFrame under existing development diagnostics, never as a mutable global production state. Browser tests read serializable copies with frame ID, camera, player, cats, display, and renderer health.

- [ ] **Step 4: Extend the real-browser matrix**

For WebGL2 and Canvas2D, cover 390×844 DPR3, 412×915 DPR2.625, 915×412 DPR2.625, desktop 60/120/175 Hz, Reduced Motion, static pause, active play, radar offscreen, studio level edit, animated thumbnail, and studio playtest. WebGPU is mandatory when available and otherwise a structured skip.

- [ ] **Step 5: Assert performance budgets**

Over five seconds:

```text
static level editor scene        <= 1 presentation after settle
hidden thumbnail                 0 presentations
visible animated thumbnail       145–155 presentations at 30 FPS
active game/playtest             <= 301 presentations at 60 FPS
pause/map                         0 presentations after settle
texture reallocations            0 during active stable-size run
radar updates                     equal game presentation delta
```

- [ ] **Step 6: Run the rendering completion gate twice**

Run:

```bash
npm test
npm run build
npm run benchmark:assert --workspace @franz-lola/pixel-renderer
npm run test:browser
npm run test:browser
git diff --check
git status -sb
```

Expected: all tests pass twice with distinct ephemeral browser ports and complete screenshot/video artifacts.

- [ ] **Step 7: Commit the parity gate**

```bash
git add packages/testkit apps/game/scripts apps/studio/e2e packages/pixel-renderer/scripts package.json .github/workflows/ci.yml
git diff --cached --check
git commit -m "test: enforce shared presentation parity"
```

## Shared Rendering Completion Gate

Before starting the guided studio plan, run:

```bash
npm ci --ignore-scripts
npm run verify
git diff --check main...HEAD
git status -sb
```

Expected outcome: game, radar, studio previews, cutscenes, animation playback, and playtest share one renderer frame contract and one scheduling package; the 20-FPS radar path and component-owned RAF loops no longer exist.
