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
## Fix round 2/5 — PresentationFrame shape, Canvas applicability, and honest 5-second trajectories

### Review verification and architecture

Base/starting HEAD was exactly `65d6f4306c26186f99d19e337c8d40799a425282` on `codex/franz-lola-shared-rendering`. I read and applied `superpowers:receiving-code-review`, `superpowers:systematic-debugging`, `superpowers:test-driven-development` (including its writing-good-tests reference), and `superpowers:verification-before-completion`. The three review findings reproduced technically; no finding was accepted only on assertion.

The fixed PresentationFrame contract now has one exact root shape (`kind`, `frameId`, `presentationTime`, `camera`, `player`, `cats`, `characters`, `display`, `renderer`). Array traversal is descriptor-driven: only canonical own indices `0..length-1` and `length` are accepted, holes/noncanonical keys/symbols/accessors are rejected without executing a getter, and the validated clone is reused instead of reading the source twice. `createPresentationFrame`, `isPresentationFrame`, and `serializePresentationFrame` consistently reject root extras; serialization returns a detached mutable serializable copy. Renderer compatibility aliases were removed from the frame rather than weakening this fixed contract, and the Game consumer now reads `player.screen`.

Canvas2D renderer diagnostics no longer expose `gpuCropResizes` or any other fake GPU counter. The renderer, Game capture contract, Studio capture contract, and benchmark summary all enforce the same backend-specific schema: Canvas uses `not-applicable/canvas2d-cpu-compositor` plus finite backing-store resize data; WebGL2/WebGPU require finite GPU crop/texture data. Missing values are never coerced to zero.

The High-Hz route now remains unsaturated for the complete five-second measurement. It starts at the independently checked open tile `(1,1)`, moves right, queues the turn down at 3.4 s, and follows the hand-derived reference `(6.8,1)`, `(12.6,1)`, `(18.4,1)`, `(23,2.2)`, `(23,8)` at seconds 1–5. Resume is confirmed before the mark and input dispatch. Five atomic browser samples must each fall in `[target,target+17ms]`, stay within the existing one-fixed-step tolerance `(5.8/120)+0.006`, and the terminal segment must move at least five tiles. The presentation cap remains exactly `<=301/5s`; no tolerance or budget was relaxed.

During the final independent verify, the existing Renderer harness exposed a genuine load-sensitive early-timer race: one `webgl2-fractional-dpr` run reached the assertion approximately 1 ms before five real seconds. A separate RED introduced `waitForMinimumDuration`; its condition-based loop rechecks the real clock until the exact minimum is reached. This changes no duration budget or app behavior.

### RED to GREEN evidence

Initial focused RED command:

`node --test packages/pixel-renderer/test/presentation-frame-contract-round2-review.test.js packages/pixel-renderer/test/renderer-info-applicability-round2-review.test.js apps/game/test/high-refresh-five-second-round2-review.test.js`

Exit 1, seven tests: one pass and six intentional failures. The failures proved acceptance of noncanonical array keys, acceptance/execution of array accessors, silent dropping of root extras, Canvas fake `gpuCropResizes` in the renderer, acceptance of fake GPU data by benchmark/Game contracts, and acceptance of a terminally saturated four-second route. The independent hand-derived five-second trajectory test already passed.

Minimal GREEN checkpoints:

- PresentationFrame plus applicability contracts: 5/5 passed.
- Independent High-Hz pure contract/trajectory: 2/2 passed.
- All directly affected package/app suites: 56/56 passed.
- Minimum-duration RED: Exit 1 because `browser-minimum-duration.mjs` did not exist; after the minimal condition-based helper, the helper plus all Renderer browser subprocess contracts passed 5/5.
- Fresh full unit gate after the last harness fix: 579/579 passed (structure 40, Game 157, Publisher 21, Studio 141, content 49, core 36, pixel-renderer 98, coordinator 30, testkit 7).

Two browser canaries also served as honest behavior REDs before the final route was green. `run-2026-08-13T06-34-46-198Z`/port 55235 failed because a paused fixture incorrectly waited for visible radar; `run-2026-08-13T06-36-10-888Z`/port 58598 failed because a wait followed by a separate evaluate sampled late. Both saved mandatory videos (914,720 bytes/19.36 s and 1,392,979 bytes/13.28 s) and cleaned their ports/processes. The fix uses paused-state/position readiness and returns each sample atomically from `waitForFunction`.

Passing focused real-browser High-Hz evidence:

| Refresh | Run / port | Virtual duration / presentations | Maximum observed position error | Artifacts / diagnostics |
|---|---|---:|---:|---|
| 60 Hz | `run-2026-08-13T06-37-23-106Z` / 55908 | 5000.000 ms / 299 | 0.048333 (limit 0.054333) | 7 PNG; WebM 2,180,155 bytes/24.88 s; error arrays 0 |
| 120 Hz | `run-2026-08-13T06-38-31-726Z` / 52650 | 5008.333 ms / 300 | 0.048333 | 7 PNG; WebM 2,520,135 bytes/27.80 s; error arrays 0 |
| 175 Hz | `run-2026-08-13T06-39-04-415Z` / 50362 | 5005.714 ms / 292 | 0.033143 | 7 PNG; WebM 3,021,537 bytes/32.72 s; error arrays 0 |

The exact 60 Hz samples were `1016.667:(6.848333,1)/(6.896667,1)`, `2000:(12.6,1)`, `3000:(18.4,1)`, `4000:(23,2.2)`, and `5000:(23,8)`; final error was `5.755e-13`. Ports and owned processes were zero after every canary.

### Complete post-fix browser matrices and artifacts

The two required root `npm run test:browser` executions both passed on distinct OS-assigned ephemeral ports after the minimum-duration fix:

| Gate | Renderer | Game | Studio E2E / Visual / Rendering |
|---|---|---|---|
| Pass 1, Exit 0, 908.4 s | `2026-08-13T07-23-21-204Z-29216` port 64548; 3/3; 3 PNG + 3 WebM; pacer 121/121/121; WebGPU structured skip | `run-2026-08-13T07-23-40-075Z` port 65215; 14/14; 90 PNG + 14 WebM | E2E `run-2026-08-13T07-29-31-322Z-11956` port 64945, 40/40; Visual `run-2026-08-13T07-31-29-467Z-32244` port 57448, 9/9; Rendering `run-2026-08-13T07-32-28-405Z-33304` port 50610, 15/15 PNG/WebM |
| Pass 2, Exit 0, 911.9 s | `2026-08-13T07-38-45-561Z-26636` port 58384; same complete counts | `run-2026-08-13T07-39-04-468Z` port 54663; 14/14; 90 PNG + 14 WebM | E2E `run-2026-08-13T07-44-56-388Z-25724` port 63685, 40/40; Visual `run-2026-08-13T07-46-53-478Z-18836` port 59723, 9/9; Rendering `run-2026-08-13T07-47-54-953Z-32792` port 52060, 15/15 PNG/WebM |

Both Game runs covered the required mobile 390/mobile 412/landscape/desktop 60/120/175/reduced-motion matrix on WebGL2 and Canvas2D. Both Studio Rendering runs covered the same profiles and states (static, animated, hidden, active playtest, paused); WebGPU was available and mandatory, so its mobile-412 scenario passed. Game/Renderer recorded the real structured skip `requestAdapter() returned null`. Every static/hidden/paused resource delta was 0, active/animated five-second cadence stayed inside the exact caps, and every Console/Page/Promise/context-loss array was empty apart from the already-classified Chrome `ReadPixels` driver warning. Every Studio owned child cleanup reported `forced=false` and `portClosed=true`.

Final `npm ci --ignore-scripts` installed 87 packages, audited 96, found 0 vulnerabilities, and exited 0. The subsequent final `npm run verify` exited 0 after 1,086.2 s and reran 579/579 tests, all builds, benchmark assert, and the complete browser gate:

- Renderer `2026-08-13T07-57-14-242Z-29964`, port 55577: 3/3, three compositor PNGs and three mandatory WebMs; captures 5223–5227 ms; video 671,594–728,870 bytes and 6.28–6.92 s; pacer 121 at 60/120/175; WebGPU structured skip `requestAdapter() returned null`.
- Game `run-2026-08-13T07-57-33-161Z`, port 50837: 14/14, 90 compositor/screenshots and 14 mandatory WebMs totaling 29,583,084 bytes, minimum 21.08 s; WebGPU structured skip; all browser/app/renderer error arrays 0.
- Studio E2E port 58861: 40/40. Studio Visual port 63444: 9/9 with all Playwright videos. Studio Rendering `run-2026-08-13T08-06-22-557Z-35112`, port 50672: 15/15 PNG and 15/15 WebM totaling 17,065,295 bytes, minimum 20.68 s; native WebGPU resolved and passed; diagnostic failure count 0. All three owned server wrappers reported `code=0 forced=false portClosed=true`.

The post-fix benchmark assert passed without changed budgets. Representative Weak-Mobile results remained below the 36 ms render-p95, 52 ms frame-p95, and 50% long-frame limits (gameplay approximately 15.2/33.4/16.2; cutscene approximately 17.4/33.4/21.23). Canvas nested summaries now contain no `gpuCropResizes`; GPU summaries retain finite `gpuCropResizes:1`. The benchmark remains the performance source of truth; no DevTools metric was invented.

### Visual audit, cleanup, ACL, and deferred minor

The real saved Playwright-/locator-PNG compositor health assertions passed for Renderer, Game, and Studio across representative static/animated/playtest/mobile/landscape/reduced states; blank/gray captures cannot satisfy those decoded pixel assertions. A manual `view_image` attempt on five exact representative post-fix artifacts failed at the environment's Windows ACL boundary both in place and after exact temporary copies. The copies were content-verified, then the single guarded temporary directory was deleted; no manual visual finding is claimed and original mandatory artifacts remain untouched. This is the sole remaining environmental concern, not a test pass substituted by assumption.

`apply_patch` was attempted first on every existing Round-2 file/report and failed with the same concrete `helper_unknown_error: apply deny-read ACLs`; new files were created through `apply_patch`. Existing-file fallbacks used exact SHA-256 plus unique anchors and immediate diff checks. One guarded test-file edit encountered a PowerShell parser error after its intended first replacements; the immediate full diff proved only those expected changes, and the remaining alias edit was completed under a fresh SHA guard. One High-Hz replacement stopped on an anchor mismatch before writing. No approval was denied and no private Vite/dependency internal was touched.

The generated one-file `apps/studio/test-results/.last-run.json` directory was resolved to its exact worktree path, contents checked, and removed before commit; artifacts under ignored output directories remain uncommitted. Final process/listener audits found no Node/Chrome/Vite/Playwright gate process and no owned listening port. The Task 5 coalesced pointer-reason minor remains unchanged and sound: first pending reason is provenance while latest pointer-up state is presented; none of these fixed frame/resource/timing contracts implicates it.

Round 2 contains no publisher/content/service-worker/UX expansion, no deployment, push, or PR, no CI/root composition change, and no budget/tolerance relaxation. No known product, frame-shape, backend-applicability, duration, artifact, process, or port failure remains. The only concern is the explicitly reported ACL inability to perform a fresh manual image-view pass; the mandatory decoded compositor-pixel gates passed in every final matrix.

## Fix round 3/5 — complete backend schemas and migration aliases

### Review verification, method, and architecture

The round started clean at exact HEAD/base `d7db469bee8b5ecfe2e5f36aebb83483f9714aa1` on `codex/franz-lola-shared-rendering`. I read and applied `superpowers:receiving-code-review`, `superpowers:systematic-debugging`, `superpowers:test-driven-development` (including writing-good-tests), and `superpowers:verification-before-completion`. Both Important findings reproduced in executable tests before implementation.

The Canvas finding was a real three-way schema drift: Game rejected texture/crop/upload-byte fields but accepted `sceneUploadSkips: 0`; the benchmark omitted the same field from validation/output; Studio manually rejected only texture reallocations and GPU crop. Round 3 introduces one shared immutable `GPU_ONLY_RENDERER_FIELDS` list in `renderer-resource-metrics.js`: `uploadedBytes`, `sceneUploadedBytes`, `overlayUploadedBytes`, `worldOverlayUploadedBytes`, `textureReallocations`, `gpuCropResizes`, `sceneUploadSkips`, `overlayUploadSkips`, and `worldOverlayUploadSkips`. `validateRendererResourceMetrics` now owns the exact fail-closed backend split. Canvas requires `not-applicable`, reason `canvas2d-cpu-compositor`, finite nonnegative `backingStoreResizes`, and absence of every GPU-only field. WebGL2/WebGPU require `applicable` and a finite nonnegative value for every listed GPU field. Unknown applicability fails rather than being interpreted. Game, Studio Rendering, benchmark summary, and Renderer browser gates all call this same shared validator; real Canvas outputs remain clean and real GPU outputs remain measured.

The alias finding also reproduced against the plan's explicit migration contract. The public `PassauPixelRenderer.render()` result again exposes `playerScreen`, `entities`, and `characterEntities`, frozen in one wrapper and strictly referential to `player.screen`, `cats`, and `characters` from the current canonical frame. There is no recomputation, copied array, or stale cache. The canonical serialized PresentationFrame is unchanged: `createPresentationFrame` still accepts only its nine fixed root fields, arbitrary extras still fail, and `serializePresentationFrame` strips only the three recognized migration aliases after verifying exact enumerable data descriptors and strict reference equality. Forged, accessor-backed, partial, or stale alias wrappers fail closed. A consumer inventory confirmed Game already reads canonical fields; Studio capture serializes the public result through this checked canonicalization; testkit Golden projections use canonical fields. No consumer was moved back onto a legacy alias.

### RED -> GREEN evidence

Initial focused RED:

`node --test packages/pixel-renderer/test/renderer-resource-schema-round3-review.test.js packages/pixel-renderer/test/renderer-legacy-aliases-round3-review.test.js`

Exit 1, 4 tests, 0 passed, 4 failed. The failures proved: all three aliases were absent; the shared GPU-field contract/validator did not exist; Game and benchmark accepted Canvas `sceneUploadSkips: 0`; and both accepted a non-finite GPU `sceneUploadSkips`. The schema test iterates every GPU-only field against Canvas, every required GPU field against missing/NaN values, and the unknown applicability branch. The compatibility test uses a real renderer and additionally rejects stale, partial, extra, and accessor alias wrappers while proving canonical serialization has no alias root fields.

Minimal GREEN: the same command passed 4/4. The first affected integration run exposed five old fixtures that still lacked/expected the now-complete field set; after updating only those fixtures/contracts, the full directly affected set passed 66/66. That set covered PresentationFrame creation/recognition/serialization, real renderer return behavior, renderer browser harness, benchmark summary, Game browser contracts, Studio rendering diagnostics, and testkit parity.

### Full gates, performance, browser matrix, and artifacts

- `npm test`: Exit 0 in 48.8 s, 583/583 total: structure 40, Game 157, Publisher 21, Studio 141, content-model 49, game-core 36, pixel-renderer 102, render-coordinator 30, testkit 7.
- `npm run build`: Exit 0 in 10.1 s. Renderer 38 modules / 214.01 kB (57.84 gzip), Game 204 / 422.81 kB (121.41 gzip), Studio 205 / main 454.61 kB (126.19 gzip).
- `npm run benchmark:assert --workspace @franz-lola/pixel-renderer`: Exit 0 in 109.4 s. Representative Weak-Mobile auto gameplay/cutscene remained below unchanged `36 ms / 52 ms / 50%` budgets: render p95 approximately `15.3 / 17.5 ms`, frame p95 `33.4 / 33.4 ms`, long-frame `14.53 / 13.97%`. Canvas summaries contained no GPU-only field; GPU summaries contained finite values for all nine fields (including `sceneUploadSkips: 0` and `gpuCropResizes: 1`). Invalid measurements and budget failures were empty. The benchmark remains the performance source of truth; no DevTools metric was invented.
- Real canaries: Renderer full harness Exit 0, port 61365, three scenarios/six artifacts, WebGL2 + Canvas2D and pacer 121/121/121 passed, WebGPU structured skip. Game WebGL2 one-row run `run-2026-08-13T08-43-29-897Z` passed. Studio Canvas run `run-2026-08-13T08-44-31-914Z-33608`, port 63648, passed 1/1 with `forced=false`, `portClosed=true`. These confirm the shared validator at the actual application/browser boundaries, not just in pure tests.

The two mandatory post-fix root browser passes used distinct OS-assigned ephemeral ports and retained the complete artifact set:

| Gate | Renderer | Game | Studio E2E / Visual / Rendering |
|---|---|---|---|
| Pass 1, Exit 0, 909.7 s | `2026-08-13T08-45-27-520Z-28380`, port 61940; 3 scenarios/6 artifacts; pacer 121/121/121; WebGPU structured skip | `run-2026-08-13T08-45-46-559Z`, port 54973; 14/14; 90 PNG + 14 WebM, 29,652,673 bytes, minimum 21.12 s | E2E `run-2026-08-13T08-51-39-289Z-31900` port 58533, 40/40; Visual `run-2026-08-13T08-53-35-573Z-7320` port 61240, 9/9; Rendering `run-2026-08-13T08-54-33-966Z-9976` port 58844, 15/15 PNG/WebM, 17,284,324 video bytes, minimum 20.92 s |
| Pass 2, Exit 0, 908.4 s | `2026-08-13T09-01-52-126Z-21880`, port 50845; same complete counts/status | `run-2026-08-13T09-02-11-189Z`, port 57800; 14/14; 90 PNG + 14 WebM, 29,406,052 bytes, minimum 21.08 s | E2E `run-2026-08-13T09-08-03-100Z-33072` port 54995, 40/40; Visual `run-2026-08-13T09-10-00-416Z-31988` port 49245, 9/9; Rendering `run-2026-08-13T09-10-59-158Z-32684` port 63008, 15/15 PNG/WebM, 17,201,294 video bytes, minimum 20.64 s |

Both Game matrices passed all 14 mobile-390/mobile-412/landscape/desktop-60/120/175/reduced rows over WebGL2 and Canvas2D. Both Studio matrices passed the same profiles/states with native mandatory WebGPU available. Renderer and Game honestly recorded `requestAdapter() returned null` as the structured WebGPU skip; Studio WebGPU passed. All exact five-second budgets, trajectory limits, resource deltas, decoded compositor-health checks, mandatory screenshot/video checks, and renderer/context/fallback/error gates remained unchanged. All Studio wrappers reported `code=0 forced=false portClosed=true`.

`npm ci --ignore-scripts` then exited 0 in 4.7 s (87 packages installed, 96 audited, 0 vulnerabilities). Final `npm run verify` exited 0 in 1082.5 s and reran the complete 583-test/build/benchmark/browser graph. Its browser evidence was Renderer `2026-08-13T09-20-25-083Z-13816` port 52053 (3/3, six artifacts, structured WebGPU skip); Game `run-2026-08-13T09-20-44-538Z` port 52775 (14/14, 90 PNG + 14 WebM, 29,592,410 bytes, minimum 21.12 s); Studio E2E `run-2026-08-13T09-26-36-518Z-31332` port 65213 (40/40), Visual `run-2026-08-13T09-28-33-077Z-31264` port 54883 (9/9), and Rendering `run-2026-08-13T09-29-32-378Z-11764` port 60486 (15/15 PNG/WebM, 17,244,651 video bytes, minimum 20.72 s, native WebGPU passed). Every wrapper again reported clean non-forced cleanup and closed port.

### Scope, cleanup, ACL, deferred minor, and concerns

Round 3 changed only the pixel-renderer resource/PresentationFrame boundaries, their Game/Studio/Renderer/benchmark gate consumers, tests, and this report. Root scripts and CI required no edit because their existing composition continued to execute all five mandatory surfaces; its structure contracts passed in final verify. No performance number, tolerance, artifact, WebGPU rule, or five-second requirement was relaxed. No publisher/content/service-worker/guided-UX feature, push, PR, or deployment was added.

The post-gate audit found zero LISTEN sockets on all 12 recorded pass/verify ports. Its sole process-pattern match was the audit PowerShell itself because the literal patterns were present in its command line, not an owned Node/Chrome/Vite/Playwright process. The generated `apps/studio/test-results/.last-run.json` was the only untracked runner metadata; after `apply_patch` hit the documented Windows `helper_unknown_error: apply deny-read ACLs`, its exact absolute path, SHA-256 `91D1C43004802CD49950D78EB11C8FA7D05DA8FFFFE219A8B13B2F561BC00903`, and `"status": "passed"` marker were guarded before exact removal and immediate status check. Existing-file changes likewise attempted `apply_patch` first and used only path/SHA/unique-anchor guarded fallbacks after the same concrete denial; new files used `apply_patch`. No approval was denied.

The Task 5 coalesced pointer reason remains unchanged and sound: first pending reason is provenance while the latest pointer-up state is presented once. Neither complete backend resource schemas nor referential migration aliases affect that contract. The only environmental concern remains the already documented difference in WebGPU adapter availability across Chromium contexts and the inability to perform a new manual `view_image` inspection through this Windows ACL; mandatory decoded real compositor-PNG health and real WebM gates passed in every matrix. No known product, compatibility, schema, artifact, budget, process, or port failure remains after Round 3.