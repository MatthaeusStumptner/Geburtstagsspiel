# Task 7 — Shared Rendering Completion Gate

## Result and scope

Status: **DONE**. Work was performed only in `C:\Users\matti\Code\Pacman_clone\.worktrees\franz-lola-shared-rendering` on `codex/franz-lola-shared-rendering`. The verified base, start HEAD, and merge base were all `5100937f360bf8b4169ff97b294797efe9a6fd5c`. No push, PR, deploy, publisher/content/service-worker feature, or guided-Studio product expansion was made. Browser artifacts remain ignored/uncommitted.

Implementation commit: `9f72796` (`test: add shared rendering completion gate`). This report is committed separately so it can record the implementation hash; its final hash is reported in the task handoff.

Skills followed: `superpowers:test-driven-development` (including `writing-good-tests`), `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `game-studio:web-game-foundations`, `game-studio:game-playtest`, `build-web-apps:frontend-testing-debugging`, `browser:control-in-app-browser`, `playwright`, and `cloudflare:web-perf`.

Target Flow defined before browser QA:

1. Game: map -> start -> active game/offscreen cat radar -> pause -> map.
2. Studio: level -> static editor -> visible animated thumbnail -> hidden thumbnail -> active playtest -> paused playtest.
3. Both surfaces must expose structured finite diagnostics derived from their actual `PresentationFrame`; every five-second window must meet the exact budget; representative screenshots and mandatory videos must be visibly nonblank/non-gray; console, page, promise/crash, renderer-health, context-loss, fallback, and cleanup channels must remain fail-closed.

## Inventory and architecture

- Reused the existing golden project/fixture and `runInputScript` from `@franz-lola/render-testkit`, actual Game `createBrowserGameSession`, actual Studio `PlaytestEngine`, actual `PresentationFrame`, and actual `PassauPixelRenderer`. No second simulation, frame schema, or fixture was introduced.
- `renderGoldenFrame({ adapter, fixture, presentationTime })` is the one pure testkit entry point. Its test-only canvas/backend captures the real renderer presentation without a production mutable global.
- `serializePresentationFrame` validates the whole public frame and returns a detached serializable copy. Malformed/non-finite fields fail rather than becoming zero.
- Game DEV diagnostics include the serialized real presentation. Studio DEV diagnostics retain frozen internal captures in a private map and return detached JSON copies. Studio backend query overrides are development-only and fail closed to `auto`.
- Canvas2D now reports explicit finite zero upload/texture counters, so backend equality does not depend on absent values.
- Game Task 4 matrix, Studio Task 6 E2E/visual harness, and the renderer browser harness are composed by the root gate. Studio rendering is an additional tag/config within the same Playwright surface, not a parallel product runtime.
- The Studio gate owns Vite in a dedicated child process through public Node/Vite boundaries. The child chooses a real non-default ephemeral port, reports readiness over IPC, preserves the same browser origin/HMR and dynamic publisher CORS behavior, and exits independently of dangling Svelte/Vite transform promises. The parent condition-polls HTTP readiness, runs Playwright, sends shutdown, bounds exact-child termination, verifies the former port is unreachable, and reports `code`, `forced`, and `portClosed`. Early exits and stubborn children are covered fail-closed.

## RED -> GREEN record

| Contract | RED | GREEN |
|---|---:|---:|
| Pure Game/Studio presentation parity | `node --test packages/testkit/test/presentation-parity.test.js`: 0/1, missing `renderGoldenFrame` | 1/1 |
| Detached/validated diagnostic capture | malformed/detachment tests failed before API | all presentation-frame tests green |
| Game browser contracts (finite fields, exact budgets, coverage, artifacts/video, health, WebGPU) | focused behavior failures for missing fields/coverage/video/skip | 19/19 |
| Studio diagnostics/backend/render gate | missing modules/config and actionability/visual-health contracts failed | rendering contracts 3/3 plus Studio suite green |
| Root public parity alias/composition/CI artifacts | foundation contract 11/12, missing `test:presentation-parity`; root omitted visual/rendering | foundation contract 12/12; final focused aggregate 18/18 |
| Coalesced pointer burst | adversarial hover -> down -> up absent | burst test green; one presentation has latest `up` state under first pending `hover` reason |
| Studio lifecycle, same-process cleanup | real Visual finished 9/9 but wrapper hung; failed root pass exited 1 after exact PID cleanup | isolated lifecycle contracts 3/3; cumulative E2E 40/40 -> Visual 9/9 exited 0 in 177.9 s |
| Ephemeral child port | lifecycle assertion RED 0/1 because Vite interpreted `port: 0` as default 5173 | public Node `listen(0)` reservation, strict Vite bind, contract 1/1 on non-default port |
| IPC/termination failure behavior | injected early-exit and stubborn-child tests RED 0/2 | 2/2, plus normal lifecycle = 3/3 |

The lifecycle debugging deliberately stopped after three variants of same-process close could not prevent a real cumulative hang. Installed Vite source showed `environment.close()` waiting in a loop for pending transform requests, which could starve a parent timer. No Vite private fields were mutated. Process isolation removed the architectural coupling; the obsolete cleanup helper/tests were removed before final verification.

## Pure presentation parity

The Game and Studio adapters produced `frameId: 1` and exact equality for camera, player, cats, and display at the same fixture and presentation time. Canonical selected-field SHA-256: `bc5fbe3b39855e251aa8a05d3d04775d51de8d4911a93d90c32c8fe1a2d93feb`.

- Camera viewport: `(0,0,400,300)`; source: `(23,0,192.85714285714283,144.6428571428571)`; scale `2.0740740740740744`.
- Player: world `(169.19999999999965,36)`; screen `(303.22962962962896,74.66666666666669)`.
- `cat-1`: world `(84.00000000000009,180)`; screen `(126.51851851851872,373.3333333333334)`; offscreen; distance `6.971549325652072`; color `#ff6b5f`; respawn `0`.
- Display: `400x300`, DPR/effective DPR `1`, reason `golden-capture`.

## Browser matrix and exact five-second budgets

### Game, final independent pass 2 (`run-2026-08-13T03-10-45-288Z`)

Every row produced mandatory video, 5 screenshots (desktop rows 6), zero console/page errors, zero stable-active texture reallocations, zero pause/map presentations, and exact radar delta = game presentation delta.

| Scenario | Backend / viewport / Hz | Active ms -> presentation/radar | Pause ms -> delta | Map ms -> delta | Video s |
|---|---|---:|---:|---:|---:|
| mobile-390 | WebGL2 390x844 DPR3 60 | 5000.000 -> 297/297 | 5016 -> 0 | 5013 -> 0 | 24.16 |
| mobile-412 | WebGL2 412x915 DPR2.625 60 | 5000.000 -> 297/297 | 5014 -> 0 | 5007 -> 0 | 25.60 |
| landscape | WebGL2 915x412 DPR2.625 60 | 5000.000 -> 297/297 | 5006 -> 0 | 5011 -> 0 | 23.48 |
| desktop-60 | WebGL2 1366x768 60 | 5000.000 -> 296/296 | 5007 -> 0 | 5002 -> 0 | 24.72 |
| desktop-120 | WebGL2 1366x768 120 | 5008.333 -> 300/300 | 5013 -> 0 | 5011 -> 0 | 27.92 |
| desktop-175 | WebGL2 1366x768 175 | 5005.714 -> 292/292 | 5003 -> 0 | 5001 -> 0 | 32.80 |
| reduced | WebGL2 412x915 DPR2.625 60 reduced | 5000.000 -> 297/297 | 5003 -> 0 | 5015 -> 0 | 24.68 |
| mobile-390 | Canvas2D 390x844 DPR3 60 | 5000.000 -> 297/297 | 5010 -> 0 | 5003 -> 0 | 22.12 |
| mobile-412 | Canvas2D 412x915 DPR2.625 60 | 5000.000 -> 297/297 | 5016 -> 0 | 5009 -> 0 | 21.84 |
| landscape | Canvas2D 915x412 DPR2.625 60 | 5000.000 -> 296/296 | 5002 -> 0 | 5005 -> 0 | 21.52 |
| desktop-60 | Canvas2D 1366x768 60 | 5000.000 -> 297/297 | 5003 -> 0 | 5010 -> 0 | 21.92 |
| desktop-120 | Canvas2D 1366x768 120 | 5008.333 -> 299/299 | 5015 -> 0 | 5004 -> 0 | 27.44 |
| desktop-175 | Canvas2D 1366x768 175 | 5005.714 -> 292/292 | 5009 -> 0 | 5016 -> 0 | 32.40 |
| reduced | Canvas2D 412x915 DPR2.625 60 reduced | 5000.000 -> 297/297 | 5010 -> 0 | 5005 -> 0 | 21.12 |

This satisfies active `<=301`, pause/map `0`, stable-active texture reallocations `0`, and radar synchronization exactly. Game WebGPU: `{ status: "skipped", reason: "requestAdapter() returned null" }` from a real adapter probe.

### Studio, final independent pass 2 (`run-2026-08-13T03-19-34-197Z-19348`)

All 15 scenarios produced one scenario screenshot and mandatory video; diagnostic console/page/crash arrays were empty; every texture reallocation delta was zero. Normal-motion static/hidden/paused deltas were zero, visible animated deltas were 146–150, and active playtest deltas were 291–300. Reduced motion intentionally slept continuous animated/playtest work at zero after its final presentation.

| Coverage | Backends / viewport / refresh / state | Raw deltas over measured windows |
|---|---|---|
| mobile 390 | WebGL2 + Canvas2D, 390x844 DPR3 60 | static 0/5015 or 5011; animated 149 or 150/5000; hidden 0/5007; active 299/5000; pause 0/5012 or 5008 |
| mobile 412 | WebGL2 + Canvas2D, 412x915 DPR2.625 60 | static 0/5008 or 5013; animated 149/5000; hidden 0/5010; active 299/5000; pause 0/5010 or 5011 |
| landscape | WebGL2 + Canvas2D, 915x412 DPR2.625 60 | static 0/5010 or 5011; animated 150/5000; hidden 0/5004 or 5003; active 299/5000; pause 0/5008 or 5003 |
| desktop 60 | WebGL2 + Canvas2D, 1366x768 | static 0/5009 or 5011; animated 150 or 149/5000; hidden 0/5013; active 299/5000; pause 0/5011 or 5004 |
| desktop 120 | WebGL2 + Canvas2D, 1366x768 | static 0/5005 or 5009; animated 150/5008.333; hidden 0/5008 or 5003; active 299 or 300/5000; pause 0/5007 or 5004 |
| desktop 175 | WebGL2 + Canvas2D, 1366x768 | static 0/5010 or 5012; animated 146/5005.714; hidden 0/5011 or 5007; active 291/5000; pause 0/5014 or 5004 |
| reduced | WebGL2 + Canvas2D, 412x915 DPR2.625 60 | static 0/5016 or 5005; animated 0/5013 or 5019; hidden 0/5004 or 5017; active 0/5012 or 5007; pause 0/5012 or 5008 |
| mandatory WebGPU | WebGPU 412x915 DPR2.625 60 | static 0/5009; animated 149/5000; hidden 0/5011; active 299/5000; pause 0/5003; texture 0 |

Studio WebGPU disposition: `{ status: "passed", resolvedBackend: "webgpu" }`. Videos ranged 20.80–29.24 s and 738,638–1,991,702 bytes. Representative WebGPU video: 24.32 s / 806,484 bytes.

### Renderer browser harness

Pass 2 run `2026-08-13T03-10-26-596Z-9300`, port `64059`: WebGL2 fractional DPR, WebGL2 reduced motion, and Canvas2D desktop all passed; 3 screenshots + 3 mandatory videos (5.88–6.92 s; 641,481–731,568 bytes); pacer presentations were exactly `121/121/121` at 60/120/175 Hz; no context loss or errors. Four Chrome GL-driver `ReadPixels` performance warnings were retained as warnings, not hidden or reclassified. Renderer WebGPU structured skip: `requestAdapter() returned null`.

## Artifacts and visual inspection

- Final pass Game: 14 mandatory videos plus 74 screenshots; Studio rendering: 15 screenshots + 15 mandatory videos; Renderer: 3 screenshots + 3 mandatory videos. Existing Studio visual proof additionally recorded all 9 Playwright videos/screenshots.
- Representative visual-health samples were far above the blank/gray thresholds; e.g. Studio mobile WebGL level `opaque=1024, colors=57, chroma=1018, lumaRange=72`, playtest `1024/54/1013/112`.
- Contact sheets inspected: `apps/studio/output/playwright/task7-contact-game.png`, `task7-contact-renderer.png`, `task7-contact-studio-editor.png`, `task7-contact-studio-playtest.png`, and `task7-contact-videos.png`.
- Findings: map, active gameplay, offscreen radar, pause, static Studio, animated thumbnail, mobile editor, playtest, fractional DPR, reduced motion, Canvas2D, WebGL2, and WebGPU were colored and crisp; no blank/gray frame, crop escape, missing radar, illegible HUD, or frozen mandatory video was accepted.
- Videos opened and inspected at multiple timestamps: Game WebGL mobile (24.24 s), Game Canvas reduced (21.04 s), Studio WebGPU (24.32 s), Studio Canvas desktop (20.96 s), and Renderer WebGL (5.92 s). Studio mid-video frames showed the real playtest, not a static placeholder.

## Browser and DevTools availability

The in-app browser was attempted first with its documented client against `http://127.0.0.1:4187`. It failed before browser binding: `node_repl kernel exited unexpectedly`; Windows sandbox `helper_unknown_error: apply deny-read ACLs`; `reason stdout_eof`. Repo Playwright/installed Chrome was therefore used as the permitted fallback.

Chrome DevTools/web-perf was separately available against a standalone local Game server on port `62009`. Measured (supplementary, not substituted for the brief's renderer budgets): LCP 510 ms, TTFB 8 ms, render delay 502 ms, CLS 0.08, CPU 1x, no network throttle, no console errors. Observed non-gating warnings: duplicated unused font preloads and missing form id/name metadata. Trace save was denied by the DevTools workspace-root configuration, so no trace-file metric was invented. Exact server PID/children and listener were cleaned.

## Root and CI completion gate

- Added public root `test:presentation-parity`.
- Root `test:browser` now obligatorily composes Renderer browser, Game Task 4 matrix, Studio Task 6 E2E, Studio Task 6 visual, and Studio Task 7 rendering.
- Root `verify` remains the single CI gate and therefore runs all package tests, builds, renderer benchmark assertion, and the complete artifact-producing browser set.
- CI uploads Renderer, Game, and Studio browser artifact trees with `always()` and `if-no-files-found: error`; the Studio upload includes both `test-results` and `output/playwright`.
- Foundation contracts execute the exact root command graph and reject hidden working-directory/install variants.

## Deferred Task 5 pointer reason

An adversarial same-frame hover -> pointerdown -> pointerup burst was added. The coordinator intentionally preserves the first pending reason (`hover`) as provenance while the rendered state is the latest (`up`) and the surface presents once. This does not violate parity or the gate: presentation fields, state, frame count, and diagnostic copies are current and deterministic; changing reason semantics would break the existing coordinator contract without improving visual parity. No product fix was made.

## Verification after the final harness fix

- `npm run test:presentation-parity`: 1/1 green.
- Focused parity/lifecycle/rendering/root contracts: 18/18 green.
- `npm test`: exit 0 in 47.0 s; 557 tests total (root 39, Game 151, Publisher 21, Studio 140, content-model 49, game-core 36, pixel-renderer 87, render-coordinator 30, testkit 4).
- `npm run build`: exit 0 in 10.3 s; Renderer, Game, and Studio production builds passed.
- `npm run benchmark:assert --workspace @franz-lola/pixel-renderer`: exit 0 in 111.2 s, generated `2026-08-13T02:54:40.090Z`. Notebook Canvas gameplay/cutscene render p95 10.3/10.9 ms, frame p95 16.7/16.8 ms, long 0/0%; notebook WebGL 4.5/5.4 ms, frame 16.8/33.3 ms, long 0.56/3.91%; weak-mobile auto 16.2/18.7 ms, frame 33.4/33.4 ms, long 18.99/20.67%. Budgets were 14/34/15 and 36/52/50; `invalidMeasurements`, `renderWorkFailures`, `experienceDiagnostics`, `warnings`, and `nonAutoDiagnostics` were empty.
- Browser pass 1: exit 0 in 914.9 s. Renderer port 57664; Game `run-2026-08-13T02-55-11-441Z`; Studio E2E port 57524, Visual 62983, rendering 61755. Counts 3 + 14 + 40 + 9 + 15; all Studio cleanup `code=0 forced=false portClosed=true`.
- Browser pass 2: exit 0 in 911.5 s. Renderer port 64059; Game `run-2026-08-13T03-10-45-288Z`; Studio E2E port 58293, Visual 61483, rendering 55666. Same complete counts/artifacts; all cleanup clean. Port sets were distinct.
- `npm ci --ignore-scripts`: exit 0 in 4.8 s; 87 packages installed, 96 audited, 0 vulnerabilities.
- Final `npm run verify`: exit 0 in 1083.7 s. Renderer run `2026-08-13T03-30-44-759Z-26568`, port 64032, 3 scenarios/6 artifacts; Game `run-2026-08-13T03-31-03-320Z`, port 56489, 14 scenarios; Studio E2E port 50611, Visual 52916, rendering `run-2026-08-13T03-39-53-606Z-11748`, port 59894, 15 scenarios. Renderer/Game real WebGPU probes skipped with `requestAdapter() returned null`; Studio WebGPU passed. All Studio cleanup was `code=0 forced=false portClosed=true`.
- After each counted full pass and final verify, exact port queries returned no LISTEN socket and process queries returned no Game/Studio wrapper or owned Vite child.

## Windows ACL and concerns

`apply_patch` was always attempted first. Updating/deleting an existing worktree file consistently failed with `windows sandbox failed: helper_unknown_error: apply deny-read ACLs`. Only after each concrete failure, the exact file SHA-256, unique marker/single anchor, and intended path were checked before a scoped PowerShell fallback; syntax/diff checks followed immediately. New files were added with `apply_patch`. A few fallback drafts failed on quoting/anchor validation before mutation; immediate SHA/syntax checks prevented silent damage. There was no approval denial.

One machine-specific concern remains documented rather than hidden: Chrome emits benign WebGL `ReadPixels` performance warnings during screenshot health sampling, and WebGPU adapter availability differs between Chrome contexts (Studio actual adapter available; Game/Renderer probe returned null). The structured results reflect the real contexts. No tolerance was loosened, no missing finite value became zero, and no artifact/video became optional.

---

## Review fix round 1/5 — 2026-08-13

### Start, method, skills, and Target Flow

The fix round started clean on `codex/franz-lola-shared-rendering` at exact HEAD `556b0c6751bb3c191e4631245383bfb759bd8c51`. The Task 7 brief, this report, and the final review findings were read in full. `superpowers:receiving-code-review`, `superpowers:systematic-debugging`, `superpowers:test-driven-development` (including writing-good-tests), and `superpowers:verification-before-completion` governed the work. Every finding was reproduced before implementation.

The Target Flow remains: Game active level -> map/radar/pause/resize -> free five-second 60/120/175 trajectory -> final health, compositor PNG, mandatory WebM; Studio static/animated/hidden/playtest/paused exact five-second windows -> final health, screenshot, mandatory WebM. Renderer remains WebGL2 fractional DPR, WebGL2 reduced motion, Canvas2D desktop, 60/120/175 pacer, mandatory video, and a real WebGPU probe. Existing Golden Scene/testkit, Game-core script, PresentationFrame, Task 4 Game matrix, Task 6 Studio E2E/visual, and Renderer harness were composed rather than duplicated.

### Independent RED -> GREEN findings

1. **Non-tautological app parity.** RED `node --test packages/testkit/test/presentation-parity-review.test.js`: 0/3; `renderGoldenCapture` and app-owned adapters were absent. The old shared implementation gave both apps the same wrong checksum `d29f98aa8867949c0807a9cfdf544eb566afeefb9c96eb742966f93f47f0f7a3`. GREEN adds Game `createGamePresentation` (also used by production `presentGame`), Studio `createPlaytestPresentation`, and test-only app-owned adapters. Testkit still owns the one fixture, input script, and capture renderer, but no longer implements both projections. Each app first matches an independent literal frame/checksum, then the apps match each other.
2. **Recursive serializer.** RED `presentation-frame-serialization-review.test.js`: 1/2; nested `NaN` was accepted and JSON changed it to `null`, while a function disappeared. GREEN recursively rejects non-finite numbers, undefined/functions/symbols/bigint, Date/Map and exotic prototypes, cycles, sparse/extended arrays, accessors, symbols, and non-enumerable properties. Valid serialization returns a detached mutable copy without JSON coercion.
3. **Resource applicability.** RED Canvas snapshot 0/1 and Game resource contract missing its applicability export. GREEN: WebGL2/WebGPU report `applicable`; Canvas reports `not-applicable`, reason `canvas2d-cpu-compositor`, and real `backingStoreResizes`, with no fake GPU fields. Game/Studio assert GPU texture stability only where applicable and Canvas backing-store stability otherwise. An additional benchmark RED was 0/1 (`ERR_MODULE_NOT_FOUND`); the resulting 2/2 GREEN summarizer removes all Canvas `?? 0` GPU summaries and fails closed on invalid applicable metrics.
4. **Nontrivial high-Hz drift.** The reviewed `(7,20)` ArrowLeft route was blocked by Home walls. GREEN fixes the independent literal path to `(24,5) -> (1,5)`, requires at least 20 units of expected and measured travel, and rejects the old zero-distance fixture. Pure 60/120/175 sessions and every browser row end exactly at `(1,5)`, error `0`.
5. **Real compositor pixel health.** RED `test/browser-visual-health-review.test.js`: 0/1. Its adversarial canvas is red/green at source but CSS grayscale in the compositor. GREEN saves locator PNG bytes, decodes the saved image in Chrome, and applies the unchanged thresholds `opaque >=512`, `colors >=8`, `chroma >=32`, `luminance range >=32`. Game adds `active-level-compositor.png`; Renderer no longer accepts PNG size alone.
6. **Studio failure evidence.** RED `rendering-failure-evidence-review.test.js`: 0/1. GREEN closes in `finally`, finalizes/renames the Playwright WebM to the standard scenario name, preserves structured capture/cleanup/video errors, always writes `summary.json`, then throws one aggregate failure. The behavior test proves a real 24,000-byte renamed artifact, failed summary, cleanup, and AggregateError.

Focused final integration was 91/91. During broad integration one old Canvas fallback fixture still encoded synthetic GPU zeros; after correcting that adjacent contract, the full suite passed. No tolerance, five-second window, matrix row, WebGPU rule, or video requirement was relaxed.

### App-owned Golden capture

Both adapters independently produce seed `2308` checksum `b3c8457ba89a848a4245bb76156a471f632e31cd879f2c473118d87544e00572`, `frameId: 1`, presentation time `2`:

- camera viewport `(0,0,400,300)`, source `(23,0,192.85714285714283,144.6428571428571)`, scale `2.0740740740740744`;
- player world `(169.19999999999965,36)`, screen `(303.22962962962896,74.66666666666669)`;
- `cat-1` world `(132,132)`, screen `(226.0740740740741,273.7777777777778)`, on-screen, distance `4.289813515760324`, color `#ff6b5f`, respawn `0`;
- display `400x300`, actual/effective DPR `1`, buffer `400x300`, reason `golden-capture`.

### Exact independent browser pass 2

Game `run-2026-08-13T05-10-59-691Z`, port `56831`: 14/14 scenarios, 90 screenshots including 14 compositor PNGs, 14 videos totaling 27,849,479 bytes, minimum 21.28 s. Every row ended `(1,5)` with error 0; pause/map delta 0; radar exactly equaled presentation count; stable resource delta 0.

| Game row | Active ms / presentations | Resource | Pause ms/delta; map ms/delta | Video s/bytes |
|---|---:|---|---|---:|
| mobile390 GL | 5000/297 | GPU/0 | 5014/0;5009/0 | 26.08/2,221,860 |
| mobile412 GL | 5000/297 | GPU/0 | 5011/0;5005/0 | 26.80/2,193,226 |
| landscape GL | 5000/297 | GPU/0 | 5014/0;5011/0 | 25.32/1,816,021 |
| desktop60 GL | 5000/297 | GPU/0 | 5003/0;5004/0 | 26.08/2,123,269 |
| desktop120 GL | 5008.333/299 | GPU/0 | 5008/0;5010/0 | 28.48/2,169,067 |
| desktop175 GL | 5005.714/291 | GPU/0 | 5003/0;5007/0 | 33.56/2,575,974 |
| reduced GL | 5000/297 | GPU/0 | 5007/0;5008/0 | 26.68/1,753,229 |
| mobile390 Canvas | 5000/297 | N/A backing-store/0 | 5015/0;5005/0 | 22.76/1,813,008 |
| mobile412 Canvas | 5000/297 | N/A backing-store/0 | 5012/0;5011/0 | 22.04/1,776,042 |
| landscape Canvas | 5000/297 | N/A backing-store/0 | 5014/0;5001/0 | 21.88/1,501,533 |
| desktop60 Canvas | 5000/297 | N/A backing-store/0 | 5012/0;5015/0 | 22.16/1,827,584 |
| desktop120 Canvas | 5008.333/300 | N/A backing-store/0 | 5015/0;5011/0 | 27.72/2,274,816 |
| desktop175 Canvas | 5005.714/291 | N/A backing-store/0 | 5009/0;5004/0 | 32.72/2,524,997 |
| reduced Canvas | 5000/296 | N/A backing-store/0 | 5004/0;5006/0 | 21.28/1,278,853 |

Studio `run-2026-08-13T05-20-01-526Z-10108`, port `51131`: 15/15 screenshots and videos, 17,140,032 video bytes, minimum 20.92 s. WebGL2 + Canvas2D cover mobile390/mobile412/landscape/desktop60/120/175/reduced; available WebGPU is mandatory. Static/hidden/paused deltas were 0; normal animated 146–150; normal playtest 291–300; reduced animated/playtest 0; every resource delta 0. Canvas rows use `not-applicable/canvas-backing-store`; GPU rows use `applicable/gpu-textures`. WebGPU mobile412 passed natively: static `5007/0`, animated `5000/149`, hidden `5010/0`, active `5000/299`, paused `5017/0`, texture delta 0, video 24.40 s / 834,731 bytes. Game/Renderer real probes recorded `requestAdapter() returned null` as a structured skip.

### Performance, artifacts, and visual inspection

Post-fix benchmark assertion exited 0 in 112.2 s. Auto gameplay/cutscene render-p95 values: Notebook `4.9/5.7` vs 14 ms; Tablet `5.9/6.9` vs 20; Mobile `7.2/10.3` vs 24; Weak-Mobile `16.3/20.6` vs 36. Frame/long budgets remained respectively `34ms/15%`, `34/25`, `34/30`, `52/50`. Canvas benchmark rows now contain only explicit N/A/backing-store metrics; GPU rows retain finite upload/reallocation values. The benchmark remains the performance source of truth; no DevTools number was invented.

Seven exact pass-2 PNGs were manually inspected: Renderer Canvas/WebGL, Game mobile WebGL and landscape Canvas compositor, Studio reduced Canvas, Studio mobile WebGPU, and Studio character visual proof. All showed colored coherent stage/playfield/HUD/editor content; none was gray, blank, cropped away, or a placeholder. `view_image` hit the Windows ACL error even via the visualization root, so disposable JPEG copies were inspected in memory and both exact temporary directories were parent/leaf-guarded and deleted. Original mandatory artifacts were untouched.

### Completion gates after the final fix

- Focused: 91/91.
- `npm test`: exit 0, 48 s, 571 total (root40, Game155, Publisher21, Studio141, content49, core36, renderer92, coordinator30, testkit7).
- `npm run build`: exit 0, 10.1 s; Renderer 37 modules/210.73 kB (56.97 gzip), Game 203/422.29 (121.24), Studio 204/454.10 (126.02).
- Benchmark assert: exit 0, 112.2 s, unchanged budgets, no invalid/asserted failures.
- Browser pass 1: exit 0, 917.3 s. Renderer port61649; Game `run-2026-08-13T04-55-11-461Z` port57837, 14 scenarios/90 screenshots/14 videos 27,367,944 bytes min21.44s; Studio E2E port57106 40/40, Visual58715 9/9, Rendering `run-2026-08-13T05-04-07-222Z-21776` port63683, 15 screenshots/videos 17,412,263 bytes min20.84s.
- Browser pass 2: exit 0, 924.0 s. Renderer port53704; Game run/port as above; Studio E2E61710 40/40, Visual59231 9/9, Rendering run/port as above. Same complete counts.
- `npm ci --ignore-scripts`: exit 0, 4.8 s; 87 installed, 96 audited, 0 vulnerabilities.
- Final `npm run verify`: exit 0, 1097.1 s. Renderer port58162/3 scenarios/6 artifacts; Game `run-2026-08-13T05-34-31-463Z` port65533, 14/90/14, 27,768,636 video bytes min21.40s; Studio E2E63795 40/40, Visual52696 9/9, Rendering `run-2026-08-13T05-43-34-471Z-28816` port60910, 15/15, 17,184,957 video bytes min20.60s.

All Studio wrappers in all runs reported `code=0 forced=false portClosed=true`; exact port queries returned no listeners and no owned gate/browser/server process remained. Root `test:browser`, `verify`, and CI composition required no code change: existing Task 7 contracts still obligatorily include all five surfaces and retained artifact uploads; structure tests passed.

### Deferred minor, ACL, and concerns

The Task 5 adversarial hover -> down -> up burst disposition remains: first pending reason is diagnostic provenance, while the one presented state is latest pointer-up. None of these parity/diagnostic fixes changes that sound contract, so no unrelated product change was made.

`apply_patch` was attempted first for each existing file/report edit and failed with `helper_unknown_error: apply deny-read ACLs`. Exact path/SHA/unique-anchor guarded PowerShell fallbacks were followed immediately by diff checks; new files used `apply_patch`. One canary had an accidental 5-second tool timeout; an exact zero-process/port audit preceded the successful full rerun. Two disposable visual-copy commands failed safely before mutation/deletion and were retried with explicit guards. No approval was denied.

The only environmental concern is honest capability variance: Game/Renderer Chromium had no WebGPU adapter, while Studio Chromium exposed and passed WebGPU. Known Chrome `ReadPixels` warnings remain diagnostic. No known product, parity, finite-health, artifact, budget, process, or port failure remains after fix round 1.
