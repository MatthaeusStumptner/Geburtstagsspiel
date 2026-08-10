# Game Performance Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the stable renderer into the game, stop hidden/static rendering, shrink the mobile backbuffer to the visible playfield, and remove the remaining load, map-animation, cache, and accessibility findings.

**Architecture:** Extract render policy, scheduling, and layout measurement from `src/main.js` into focused modules. DOM layout becomes observer-driven, rendering becomes state/dirty-driven, and the canvas occupies only the measured gameplay region on mobile. Keep Svelte responsible for UI surfaces and the renderer responsible for pixels.

**Tech Stack:** JavaScript ES modules, Svelte 5, Vite 6, Node.js 22 test runner, Playwright Chromium, generated Service Worker, `@franz-lola/pixel-renderer` from Renderer PR #14.

## Global Constraints

- Use the exact tested commit from Renderer PR #14.
- Preserve GitHub Pages hosting under `/Geburtstagsspiel/`.
- Preserve LocalStorage saves and save migrations.
- Continuous simulation and presentation run only in `playing`, `hit`, and `cutscene`.
- Map, onboarding, pause, ready, win, game over, and menu states must not produce continuous scene uploads.
- Mobile canvas dimensions must exclude the opaque DOM HUD.
- HTML and authored content must never be trapped behind a cache-first Service Worker policy.
- New production behavior must be introduced by a failing automated test first.

---

### Task 1: Pin the stable renderer commit

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `test/presentation-frame-pacer.test.js`
- Test: `test/fixed-step-loop.test.js`

**Interfaces:**
- Consumes: the final commit SHA from Renderer PR #14.
- Produces: game dependency `@franz-lola/pixel-renderer` pinned to that immutable SHA.

- [ ] **Step 1: Verify renderer contract before changing the dependency**

Add assertions that the installed package exports the new camera helper and retains pacing behavior:

```js
import { PresentationFramePacer, recommendedPresentationRate, snapCameraToTexels } from '@franz-lola/pixel-renderer';

test('game renderer dependency exposes stable camera sampling', () => {
  assert.equal(typeof snapCameraToTexels, 'function');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/presentation-frame-pacer.test.js`

Expected: failure because the currently pinned renderer commit does not export `snapCameraToTexels`.

- [ ] **Step 3: Pin and install the final renderer commit**

Resolve the full final SHA produced by Renderer PR #14 and install that immutable revision:

```powershell
$rendererCommit = git -C 'C:\Users\matti\Code\Pacman_clone_renderer' rev-parse HEAD
if ($rendererCommit -notmatch '^[0-9a-f]{40}$') { throw "Renderer commit must be a full 40-character SHA, got: $rendererCommit" }
npm install "github:MatthaeusStumptner/Pacman_clone_renderer#$rendererCommit"
```

Verify that `package-lock.json` contains the same full SHA before staging; `npm install` writes the exact resolved revision to both package files.

- [ ] **Step 4: Verify simulation and presentation contracts**

Run: `node --test test/presentation-frame-pacer.test.js test/fixed-step-loop.test.js && npm test`

Expected: 60/120/175-Hz tests and all game tests pass.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json test/presentation-frame-pacer.test.js
git commit -m "Pin stable renderer pipeline"
```

### Task 2: Declarative render policy and scheduler

**Files:**
- Create: `src/render/render-policy.js`
- Create: `src/render/render-scheduler.js`
- Modify: `src/main.js`
- Create: `test/render-policy.test.js`
- Create: `test/render-scheduler.test.js`

**Interfaces:**
- Produces: `renderPolicyForState(state, settingsReturnState, onboardingOpen)` returning `'continuous'`, `'once'`, or `'hidden'`.
- Produces: `createRenderScheduler({ render, pacer })` with `request(reason)`, `frame(timestamp, policy)`, `reset(timestamp)`, and `snapshot()`.

- [ ] **Step 1: Add failing policy tests**

```js
test('assigns every game state an explicit render policy', () => {
  assert.equal(renderPolicyForState('playing'), 'continuous');
  assert.equal(renderPolicyForState('hit'), 'continuous');
  assert.equal(renderPolicyForState('cutscene'), 'continuous');
  for (const state of ['ready', 'paused', 'won', 'over']) assert.equal(renderPolicyForState(state), 'once');
  assert.equal(renderPolicyForState('menu', 'playing'), 'once');
  assert.equal(renderPolicyForState('map'), 'hidden');
  assert.equal(renderPolicyForState('playing', null, true), 'hidden');
});
```

- [ ] **Step 2: Add failing scheduler tests**

```js
test('renders continuous states through the pacer and static states once', () => {
  const renders = [];
  const scheduler = createRenderScheduler({ render: (reason) => renders.push(reason), pacer: { shouldPresent: () => true, reset() {} } });
  scheduler.frame(0, 'continuous');
  scheduler.frame(16, 'continuous');
  scheduler.request('pause-enter');
  scheduler.frame(32, 'once');
  scheduler.frame(48, 'once');
  scheduler.request('hud-change');
  scheduler.frame(64, 'once');
  scheduler.frame(80, 'hidden');
  assert.deepEqual(renders, ['continuous', 'continuous', 'pause-enter', 'hud-change']);
});
```

- [ ] **Step 3: Run and verify RED**

Run: `node --test test/render-policy.test.js test/render-scheduler.test.js`

Expected: module-not-found failures.

- [ ] **Step 4: Implement render policy**

```js
const CONTINUOUS = new Set(['playing', 'hit', 'cutscene']);
const ONCE = new Set(['ready', 'paused', 'won', 'over', 'menu']);

export function renderPolicyForState(state, settingsReturnState = null, onboardingOpen = false) {
  if (onboardingOpen || state === 'map') return 'hidden';
  if (CONTINUOUS.has(state)) return 'continuous';
  if (state === 'menu' && settingsReturnState === 'map') return 'hidden';
  if (ONCE.has(state)) return 'once';
  return 'once';
}
```

- [ ] **Step 5: Implement the scheduler**

Keep one pending reason, a render count, skipped-hidden count, and last reason. `request(reason)` replaces `'idle'` but does not enqueue duplicate animation frames. `frame()` always renders continuous states when the pacer allows, renders once only when a reason is pending, and clears pending work in hidden states.

Expose:

```js
snapshot() {
  return Object.freeze({ pendingReason, renderCount, hiddenSkips, lastReason });
}
```

- [ ] **Step 6: Integrate with `src/main.js`**

Replace the unconditional line:

```js
if (presentationPacer.shouldPresent(now)) render(now);
```

with:

```js
const policy = renderPolicyForState(state, settingsReturnState, uiSession.snapshot().onboarding.open);
renderScheduler.frame(now, policy);
```

Call `requestRender(reason)` after state transitions, level changes, layout changes, language changes, pause/resume, overlay changes that reveal the canvas, and context restoration. Use stable reason strings such as `state:paused`, `level:home`, `layout:resize-observer`, and `visibility:return`.

Track retained-world invalidation separately from animation frames:

```js
let staticWorldRevision = 0;
function invalidateStaticWorld(reason) {
  staticWorldRevision += 1;
  requestRender(`world:${reason}`);
}
```

Call `invalidateStaticWorld()` after `buildLevel()`, a successful pellet deletion, an event unlock or activation change, imported decoration changes, and a language change. Pass `staticRevision: staticWorldRevision` to every renderer call. Movement-only simulation steps do not increment it.

Expose scheduler data inside `window.__GASSI_RENDERER_DEBUG__()` in development.

- [ ] **Step 7: Run tests and commit**

Run: `node --test test/render-policy.test.js test/render-scheduler.test.js && npm test`

```powershell
git add src/render/render-policy.js src/render/render-scheduler.js src/main.js test/render-policy.test.js test/render-scheduler.test.js
git commit -m "Pause rendering in static game states"
```

### Task 3: Observer-owned layout model

**Files:**
- Create: `src/render/gameplay-layout.js`
- Modify: `src/main.js`
- Create: `test/gameplay-layout.test.js`

**Interfaces:**
- Produces: `createGameplayLayout()` with `update(input)`, `snapshot()`, and monotonically increasing `revision` only when normalized geometry changes.
- Input: `{ canvasWidth, canvasHeight, hudBottom, canvasTop, devicePixelRatio, safeTop, safeBottom, mobile }`.
- Output: `{ cssWidth, cssHeight, viewport, devicePixelRatio, revision }`.

- [ ] **Step 1: Add failing layout tests**

```js
test('excludes the mobile DOM HUD from the renderer backbuffer', () => {
  const layout = createGameplayLayout();
  const snapshot = layout.update({ canvasWidth: 412, canvasHeight: 915, hudBottom: 203.2, canvasTop: 0, devicePixelRatio: 2.625, safeTop: 0, safeBottom: 0, mobile: true });
  assert.deepEqual(snapshot.viewport, { x: 0, y: 0, width: 412, height: 711.8 });
  assert.equal(snapshot.cssHeight, 711.8);
  assert.equal(snapshot.devicePixelRatio, 2.625);
});

test('does not advance layout revision for identical observer input', () => {
  const layout = createGameplayLayout();
  const first = layout.update({ canvasWidth: 390, canvasHeight: 844, hudBottom: 180, canvasTop: 0, devicePixelRatio: 3, safeTop: 0, safeBottom: 0, mobile: true });
  const second = layout.update({ canvasWidth: 390, canvasHeight: 844, hudBottom: 180, canvasTop: 0, devicePixelRatio: 3, safeTop: 0, safeBottom: 0, mobile: true });
  assert.equal(second.revision, first.revision);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/gameplay-layout.test.js`

Expected: module-not-found failure.

- [ ] **Step 3: Implement pure layout normalization**

Clamp dimensions to at least one CSS pixel, subtract the visible HUD and safe-bottom area only on mobile, round geometry to three decimals, and compare normalized values before increasing `revision`.

- [ ] **Step 4: Replace render-time DOM measurement**

Remove `canvas.clientWidth`, `canvas.clientHeight`, `canvas.getBoundingClientRect()`, and HUD `getBoundingClientRect()` calls from `render()` and `gameplayViewport()`.

Create `measureGameplayLayout(reason)` called by a `ResizeObserver` observing the board frame and mobile header. Use `entry.devicePixelContentBoxSize` when present to derive device pixels; fall back to `getBoundingClientRect()` only inside the observer callback. Call:

```js
pixelRenderer.resize({
  width: layout.cssWidth,
  height: layout.cssHeight,
  devicePixelRatio: layout.devicePixelRatio,
  reason,
});
requestRender(`layout:${reason}`);
```

Listen to `orientationchange` and `fullscreenchange` in addition to `resize`. Keep the no-`ResizeObserver` fallback.

- [ ] **Step 5: Pass cached viewport to renderer**

In `render()`, read `const layout = gameplayLayout.snapshot()` and pass:

```js
viewport: layout.viewport,
sceneChanged: ['playing', 'hit', 'cutscene'].includes(state),
staticRevision: staticWorldRevision,
```

For layout-only redraws in paused/ready/won/over, pass `sceneChanged: false`.

- [ ] **Step 6: Run tests and commit**

Run: `node --test test/gameplay-layout.test.js test/render-scheduler.test.js && npm test`

```powershell
git add src/render/gameplay-layout.js src/main.js test/gameplay-layout.test.js
git commit -m "Move game layout reads out of render loop"
```

### Task 4: True mobile playfield layout

**Files:**
- Modify: `src/style.css`
- Modify: `src/ui/components/BoardHud.svelte`
- Modify: `src/main.js`
- Create: `test/mobile-layout-contract.test.js`

**Interfaces:**
- Produces: CSS custom property `--mobile-game-header-height` measured by JS.
- Produces: canvas box beginning below the mobile header while overlays can still cover the full board column.

- [ ] **Step 1: Add failing static contract tests**

```js
test('mobile canvas occupies the playfield below the DOM header', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(css, /body\.mobile-game-active #game[\s\S]*top:\s*var\(--mobile-game-header-height\)/);
  assert.match(css, /height:\s*calc\(100dvh - var\(--mobile-game-header-height\)\)/);
  assert.doesNotMatch(css, /body\.mobile-game-active #game[\s\S]{0,180}height:\s*100%/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/mobile-layout-contract.test.js`

Expected: old `height: 100%` contract fails.

- [ ] **Step 3: Implement the mobile geometry**

Set the mobile header height custom property from the observer callback. Position the canvas absolutely:

```css
body.mobile-game-active #game,
.board-column:fullscreen #game,
.board-column:-webkit-full-screen #game {
  position: absolute;
  inset-inline: 0;
  top: var(--mobile-game-header-height, 0px);
  width: 100%;
  height: calc(100dvh - var(--mobile-game-header-height, 0px));
  aspect-ratio: auto;
  border: 0;
}
```

Keep `.game-overlay`, cutscene overlays, settings, and announcements positioned against `.board-column`, not the shortened canvas.

- [ ] **Step 4: Make HUD semantics independent of the canvas**

Ensure `BoardHud.svelte` owns `#mobile-game-header` and its status cards. The header remains a DOM sibling overlay with a stable `data-gameplay-blocker` attribute used by the observer.

- [ ] **Step 5: Run tests and commit**

Run: `node --test test/mobile-layout-contract.test.js test/gameplay-layout.test.js && npm test && npm run build`

```powershell
git add src/style.css src/ui/components/BoardHud.svelte src/main.js test/mobile-layout-contract.test.js
git commit -m "Render only the visible mobile playfield"
```

### Task 5: Compositor-friendly Passau map

**Files:**
- Modify: `src/style.css`
- Modify: `src/ui/components/MapScreen.svelte`
- Create: `test/map-animation-contract.test.js`

**Interfaces:**
- Produces: map root classes `map-motion-active` and `map-motion-paused`.
- Removes: animated `background-position`, `filter`, and full-path `stroke-dashoffset`.

- [ ] **Step 1: Add failing CSS contract tests**

```js
test('map animations use transform and opacity only', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /@keyframes map-grid-drift[\s\S]*background-position/);
  assert.doesNotMatch(css, /@keyframes river-flow[\s\S]*stroke-dashoffset/);
  assert.doesNotMatch(css, /@keyframes road-flow[\s\S]*stroke-dashoffset/);
  assert.doesNotMatch(css, /@keyframes marker-float[\s\S]*filter:/);
  assert.match(css, /\.map-motion-paused[\s\S]*animation-play-state:\s*paused/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/map-animation-contract.test.js`

Expected: all four old animation patterns are found.

- [ ] **Step 3: Move the grid to a transformed pseudo-element**

Give `.map-canvas` a static background and add `.map-canvas::before` with the two grid gradients, `inset: -28px`, `will-change: transform`, and `animation: map-grid-translate 22s linear infinite`. Animate only `transform: translate3d(28px, 28px, 0)`.

- [ ] **Step 4: Replace SVG path animation with sparse glints**

In `MapScreen.svelte`, add three short glint elements per river and two road glints using existing map coordinates. Animate each glint group with `transform` and `opacity`. Keep river and road paths static. Marker float changes only transform and pseudo-element opacity; remove animated `filter` and `drop-shadow`.

- [ ] **Step 5: Pause hidden motion**

Set `map-motion-active` only when `view.open && !view.selectionOpen`. Apply `animation-play-state: paused` to all map animation descendants for `map-motion-paused`, `body.onboarding-open`, and `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 6: Run tests and commit**

Run: `node --test test/map-animation-contract.test.js && npm test && npm run build`

```powershell
git add src/style.css src/ui/components/MapScreen.svelte test/map-animation-contract.test.js
git commit -m "Move Passau map motion to compositor"
```

### Task 6: Self-hosted fonts and accessible lives counter

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Modify: `src/ui/components/TopHud.svelte`
- Create: `test/font-and-a11y-contract.test.js`

**Interfaces:**
- Consumes: `@fontsource/dm-mono` and `@fontsource/silkscreen` CSS assets bundled by Vite.
- Produces: a visually hidden text node for the lives count and no prohibited ARIA attribute on `<strong>`.

- [ ] **Step 1: Add failing source contract tests**

```js
test('does not load runtime fonts from Google', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /fonts\.googleapis\.com|@import\s+url/);
});

test('uses semantic hidden text for lives', async () => {
  const source = await readFile(new URL('../src/ui/components/TopHud.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<strong id="lives" aria-label=/);
  assert.match(source, /class="visually-hidden"/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/font-and-a11y-contract.test.js`

Expected: Google Fonts import and prohibited `aria-label` are found.

- [ ] **Step 3: Install and import local fonts**

Run:

```powershell
npm install @fontsource/dm-mono @fontsource/silkscreen
```

At the top of `src/main.js`, import only:

```js
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
```

Remove the CSS `@import`.

- [ ] **Step 4: Fix the lives markup**

```svelte
<strong id="lives" aria-hidden="true">
  {Array.from({ length: view.lives }, () => '●').join(' ')}
</strong>
<span class="visually-hidden" aria-live="polite">{view.lives} {view.copy.livesA11y ?? 'Leben'}</span>
```

Add the standard clipped `.visually-hidden` utility without `display: none`.

- [ ] **Step 5: Run tests and commit**

Run: `node --test test/font-and-a11y-contract.test.js && npm test && npm run build`

```powershell
git add package.json package-lock.json src/main.js src/style.css src/ui/components/TopHud.svelte test/font-and-a11y-contract.test.js
git commit -m "Bundle local fonts and fix HUD semantics"
```

### Task 7: Versioned asset Service Worker

**Files:**
- Create: `scripts/generate-service-worker.mjs`
- Create: `src/platform/register-service-worker.js`
- Modify: `src/main.js`
- Modify: `package.json`
- Create: `test/service-worker.test.js`

**Interfaces:**
- Produces: `buildServiceWorkerSource({ cacheName, assetPaths })`.
- Produces: `registerGameServiceWorker({ navigator, baseUrl })` returning the registration or `null`.
- Cache policy: cache-first only for generated `/assets/` URLs; navigation, HTML, JSON, and all other requests use network-first with no cache fallback mutation of game saves.

- [ ] **Step 1: Add failing generator tests**

```js
test('generated worker caches only versioned assets', () => {
  const source = buildServiceWorkerSource({ cacheName: 'franz-lola-assets-abc123', assetPaths: ['/Geburtstagsspiel/assets/app-abc123.js', '/Geburtstagsspiel/assets/app-def456.css'] });
  assert.match(source, /franz-lola-assets-abc123/);
  assert.match(source, /request\.destination === 'document'/);
  assert.match(source, /request\.url\.includes\('\/assets\/'\)/);
  assert.doesNotMatch(source, /localStorage/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/service-worker.test.js`

Expected: module-not-found failure.

- [ ] **Step 3: Implement deterministic worker generation**

Export `buildServiceWorkerSource()` from the script. During the post-build CLI path, enumerate `dist/assets/*`, normalize paths with Vite base `/Geburtstagsspiel/`, derive `cacheName` from a SHA-256 hash of the sorted asset filenames, and write `dist/sw.js`. Guard the CLI path with `if (pathToFileURL(process.argv[1]).href === import.meta.url)` so importing the generator in the Node test does not write build artifacts.

The worker installs the asset list, deletes caches whose name starts with `franz-lola-assets-` but differs from the current name, and handles fetch as follows:

```js
if (request.method !== 'GET') return;
if (request.mode === 'navigate' || request.destination === 'document' || request.url.endsWith('.json')) {
  event.respondWith(fetch(request));
  return;
}
if (request.url.includes('/assets/')) {
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    return response;
  })));
}
```

- [ ] **Step 4: Register without blocking startup**

Register `new URL('sw.js', baseUrl)` only in production and only when `serviceWorker` exists. Catch registration failures and return `null`; do not display a gameplay error.

Change scripts to:

```json
"build": "vite build && node scripts/generate-service-worker.mjs"
```

- [ ] **Step 5: Run tests and inspect the build**

Run: `node --test test/service-worker.test.js && npm run build`

Verify: `dist/sw.js` exists, contains only hashed `dist/assets` entries, and does not contain `index.html` or level JSON paths.

- [ ] **Step 6: Commit**

```powershell
git add scripts/generate-service-worker.mjs src/platform/register-service-worker.js src/main.js package.json test/service-worker.test.js
git commit -m "Cache versioned game assets safely"
```

### Task 8: Automated mobile visual and runtime regression

**Files:**
- Create: `scripts/browser-game-regression.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run test:browser` and `npm run verify`.
- Produces: screenshots and WebM recordings under `output/playwright/game/` locally.

- [ ] **Step 1: Add a failing browser regression script**

Install the browser-test dependency before creating the script:

```powershell
npm install -D playwright
```

Launch Vite through its programmatic API and Chromium through Playwright. Preload a deterministic save with `page.addInitScript()` so the game opens at the map without onboarding. Test:

```js
await page.setViewportSize({ width: 412, height: 915 });
const metrics = await page.evaluate(() => {
  const canvas = document.querySelector('#game');
  const header = document.querySelector('#mobile-game-header');
  const canvasRect = canvas.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  return { canvasTop: canvasRect.top, headerBottom: headerRect.bottom, bufferHeight: canvas.height, renderer: window.__GASSI_RENDERER_DEBUG__?.() };
});
assert.ok(metrics.canvasTop >= metrics.headerBottom - 1);
assert.ok(metrics.bufferHeight < Math.round(915 * 2));
```

Open a level, pause it, read renderer counters, wait 1,000 ms, and assert frame count and scene uploaded bytes do not change. Return to the map and repeat the assertion.

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/browser-game-regression.mjs`

Expected: old full-height backbuffer or continuously increasing frame/upload counters fail.

- [ ] **Step 3: Cover the viewport/backend matrix**

Run these cases:

```js
[
  { name: 'mobile-390-dpr3', width: 390, height: 844, deviceScaleFactor: 3, backend: 'webgl2' },
  { name: 'mobile-412-dpr2625', width: 412, height: 915, deviceScaleFactor: 2.625, backend: 'webgl2' },
  { name: 'mobile-reduced-motion', width: 412, height: 915, deviceScaleFactor: 2.625, backend: 'webgl2', reducedMotion: 'reduce' },
  { name: 'landscape-915-dpr2625', width: 915, height: 412, deviceScaleFactor: 2.625, backend: 'webgl2' },
  { name: 'desktop-webgl2-60hz', width: 1366, height: 768, deviceScaleFactor: 1, backend: 'webgl2', rafHz: 60 },
  { name: 'desktop-webgl2-120hz', width: 1366, height: 768, deviceScaleFactor: 1, backend: 'webgl2', rafHz: 120 },
  { name: 'desktop-webgl2-175hz', width: 1366, height: 768, deviceScaleFactor: 1, backend: 'webgl2', rafHz: 175 },
  { name: 'desktop-canvas2d', width: 1366, height: 768, deviceScaleFactor: 1, backend: 'canvas2d' },
]
```

For each case capture map, active game, paused game, and post-resize screenshots. Record a three-second WebM covering movement, pause, and map return. Check console errors and fail on any WebGL error, unhandled rejection, or renderer context loss.

For each `rafHz` case, install a pre-navigation `requestAnimationFrame` wrapper that preserves native callback scheduling but advances callback timestamps by exactly `1000 / rafHz`. After two virtual seconds, assert the renderer presented no more than 121 frames and the simulation remains within one fixed step of the expected position. If `navigator.gpu` exists, repeat the mobile DPR 2.625 case with `backend: 'webgpu'`; otherwise record the fallback reason as an explicit skip.

- [ ] **Step 4: Add scripts and CI**

```json
"test:browser": "node scripts/browser-game-regression.mjs",
"verify": "npm test && npm run build && npm run test:browser"
```

Ignore `output/playwright/`. In CI install Chromium with `npx playwright install --with-deps chromium`, run `npm run verify`, and upload `output/playwright/game` only when the job fails.

- [ ] **Step 5: Run twice and commit**

Run: `npm run test:browser && npm run test:browser && npm run verify`

Expected: both browser runs close their temporary servers, produce visual artifacts, and pass.

```powershell
git add scripts/browser-game-regression.mjs package.json package-lock.json .github/workflows/ci.yml .gitignore
git commit -m "Test mobile rendering and static-state sleep"
```

### Task 9: Final performance audit and PR update

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-stable-mobile-rendering-design.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: browser artifacts, renderer diagnostics, Chrome performance traces, and Lighthouse accessibility results.
- Produces: before/after measurements and operational notes in PR #15.

- [ ] **Step 1: Run fresh local verification**

Run: `npm ci && npm run verify`

Expected: unit tests, production build, and all Playwright cases pass.

- [ ] **Step 2: Run the web-performance matrix**

Measure a cold mobile load at 412 × 915, DPR 2.625, Fast 4G, and 4× CPU slowdown. Record TTFB, FCP, LCP, CLS, request chain, transferred bytes, and accessibility score.

Measure five seconds each in map, paused game, and active game. Record renderer frames, scene upload bytes, texture reallocations, forced layout duration, and long tasks.

Acceptance values:

```text
Mobile LCP <= 2500 ms
CLS <= 0.10
Paused/map scene-upload delta after first frame = 0 bytes
Paused/map renderer-frame delta after first frame = 0 frames
Active texture reallocations over 5 seconds = 0
Presentation <= 60 FPS for balanced/quality and <= 30 FPS for performance
```

- [ ] **Step 3: Update documentation with measured numbers**

Append a dated verification section to the design document and add README notes for service-worker update behavior, renderer debug fields, and mobile playfield sizing. Use only the measured values from Step 2.

- [ ] **Step 4: Commit documentation**

```powershell
git add docs/superpowers/specs/2026-08-10-stable-mobile-rendering-design.md README.md
git commit -m "Document verified game performance"
```

- [ ] **Step 5: Verify the complete branch**

Run: `git diff --check main...HEAD && git status -sb && npm run verify`

Expected: clean worktree and all verification commands pass before pushing updates to Spiel PR #15.
