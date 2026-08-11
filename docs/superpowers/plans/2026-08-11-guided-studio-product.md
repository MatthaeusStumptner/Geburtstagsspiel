# Guided Studio Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing powerful but flat editor into a guided, resumable 0–100 level-production workflow while retaining an expert studio with complete object, character, animation, event, cutscene, playtest, and multi-selection tooling.

**Architecture:** A composed `StudioSession` replaces the monolithic store as the application boundary. Pure project/readiness models live outside Svelte; focused reactive sub-sessions own navigation, selection, tools, viewport, history, rendering, drafts, and publication. Guided and expert shells are two views over the same project and command history.

**Tech Stack:** Svelte 5 runes, JavaScript ES modules, IndexedDB, LocalStorage for lightweight preferences, shared content-model/game-core/pixel-renderer/render-coordinator packages, Playwright.

## Global Constraints

- Requires the completed Foundation and Shared Rendering plans.
- Guided mode is the default; Expert mode remains available at every step.
- Standard German is the default copy; Niederbairisch is a presentation preference only.
- No project ID, content ID, validation rule, or stored document changes when language or mode changes.
- Every persistent edit is one named undo/redo command; pointer-move samples are not separate history entries.
- Route, project, step, selection, tool, zoom, and camera must resume after reload.
- Large drafts and histories use IndexedDB; existing LocalStorage drafts are migrated with a recoverable backup.
- Every object that is not a simple painted block remains individually selectable after placement.
- Text, object, character, animation, event, cutscene, and edge-effect tooling must use actual rendered previews.
- Publication remains disabled until a readiness report for the exact project revision is green.
- Every task uses TDD, includes keyboard/mobile behavior, and ends with a reviewable commit.

---

## Planned File Structure

```text
packages/content-model/src/project-document.js
packages/content-model/src/project-readiness.js
packages/content-model/test/project-readiness.test.js
apps/studio/src/session/studio-session.svelte.js
apps/studio/src/session/project-session.svelte.js
apps/studio/src/session/navigation-session.svelte.js
apps/studio/src/session/selection-session.svelte.js
apps/studio/src/session/tool-session.svelte.js
apps/studio/src/session/viewport-session.svelte.js
apps/studio/src/session/draft-sync-session.svelte.js
apps/studio/src/session/publication-session.svelte.js
apps/studio/src/persistence/indexeddb-project-repository.js
apps/studio/src/persistence/legacy-draft-migration.js
apps/studio/src/components/guide/GuideShell.svelte
apps/studio/src/components/guide/ProjectDashboard.svelte
apps/studio/src/components/guide/StepRail.svelte
apps/studio/src/components/guide/ReadinessPanel.svelte
apps/studio/src/components/expert/ExpertShell.svelte
apps/studio/src/components/animation/*
apps/studio/src/components/cutscene/*
apps/studio/src/components/events/*
apps/studio/e2e/guided-workflow.spec.js
apps/studio/e2e/expert-tooling.spec.js
```

### Task 1: Define StudioProject and the deterministic 0–100 readiness model

**Files:**
- Create: `packages/content-model/src/project-document.js`
- Create: `packages/content-model/src/project-readiness.js`
- Create: `packages/content-model/test/project-document.test.js`
- Create: `packages/content-model/test/project-readiness.test.js`
- Create: `packages/content-model/test/fixtures/studio-projects.js`
- Modify: `packages/content-model/src/index.js`
- Modify: `packages/content-model/schema/franz-lola-content.schema.json`

**Interfaces:**
- Consumes: canonical content documents and dependency resolution.
- Produces: `createProjectDocument(input)`, `parseProjectDocument(input)`, `evaluateProjectReadiness(project, evidence)`, `GUIDED_STEPS`, and `ReadinessReport`.

- [ ] **Step 1: Write failing project and scoring tests**

```js
import {
  completeEvidence,
  completeProject,
  validLevelWithoutCutscene,
} from './fixtures/studio-projects.js';

test('readiness is deterministic and blockers cap the project below publishable', () => {
  const project = createProjectDocument({ id: 'hals-neu', name: 'Hals neu', levelId: 'hals-neu' });
  const report = evaluateProjectReadiness(project, {
    documents: [validLevelWithoutCutscene],
    dependencies: { missing: [{ from: 'level:hals-neu', type: 'cutscene', id: 'intro' }], cycles: [] },
    playtests: [],
    viewportChecks: [],
  });
  assert.equal(report.percent, 38);
  assert.equal(report.publishable, false);
  assert.deepEqual(report.blockers.map(({ code }) => code), ['dependency.missing', 'playtest.desktop.missing', 'playtest.mobile.missing']);
  assert.deepEqual(report.steps.map(({ id }) => id), ['plan', 'level', 'assets', 'animation', 'story', 'playtest', 'publish']);
});
```

```js
test('matching desktop and mobile receipts can produce 100 percent', () => {
  const report = evaluateProjectReadiness(completeProject, completeEvidence);
  assert.equal(report.percent, 100);
  assert.equal(report.publishable, true);
  assert.deepEqual(report.blockers, []);
});
```

`fixtures/studio-projects.js` exports deeply frozen version-2 content documents plus one project at revision 7. `completeEvidence` contains a dependency closure with no missing/cycles and desktop/mobile playtest receipts whose `projectRevision` is exactly 7; `validLevelWithoutCutscene` deliberately references a missing intro cutscene. No fixture reads clock, storage, or browser state.

- [ ] **Step 2: Verify RED**

Run: `node --test packages/content-model/test/project-document.test.js packages/content-model/test/project-readiness.test.js`

Expected: FAIL because project/readiness modules do not exist.

- [ ] **Step 3: Implement the project document**

Use this stored shape:

```js
{
  kind: 'franz-lola-project',
  schemaVersion: 1,
  id,
  name: { standard, dialect },
  levelId,
  documentRefs: [{ type, id }],
  createdAt,
  updatedAt,
  revision,
}
```

Validate lowercase kebab IDs, unique references, one level root, integer revision, and ISO timestamps. Parsing returns a new normalized object and never mutates input.

- [ ] **Step 4: Implement exact readiness weights and issue format**

Use these weights:

```js
export const GUIDED_STEPS = Object.freeze([
  { id: 'plan', weight: 5 },
  { id: 'level', weight: 25 },
  { id: 'assets', weight: 15 },
  { id: 'animation', weight: 15 },
  { id: 'story', weight: 15 },
  { id: 'playtest', weight: 20 },
  { id: 'publish', weight: 5 },
]);
```

Every issue has `{ code, severity, stepId, documentRef, messageKey, params, action }`. Scores are integer, deterministic, and derived only from the exact project revision and supplied evidence. Any blocker makes `publishable=false`. Playtest receipts count only when their `projectRevision` equals the current revision.

- [ ] **Step 5: Run focused and package tests**

Run:

```bash
node --test packages/content-model/test/project-document.test.js packages/content-model/test/project-readiness.test.js
npm test --workspace @franz-lola/content-model
```

- [ ] **Step 6: Commit the project model**

```bash
git add packages/content-model
git diff --cached --check
git commit -m "feat: score studio project readiness"
```

### Task 2: Replace hash-only navigation with stable project routes and resume state

**Files:**
- Modify: `apps/studio/src/studio-router.js`
- Modify: `apps/studio/src/studio-navigation.js`
- Create: `apps/studio/src/session/navigation-session.svelte.js`
- Create: `apps/studio/test/navigation-session.test.js`
- Create: `apps/studio/test/fixtures/navigation.js`
- Modify: `apps/studio/test/studio-router.test.js`
- Modify: `apps/studio/src/App.svelte`

**Interfaces:**
- Consumes: browser history/location and project IDs.
- Produces: routes `/studio/project/:projectId/:step`, `createNavigationSession(adapter)`, `navigate(route)`, `switchMode(mode)`, and `snapshot()`.

- [ ] **Step 1: Write failing parse/serialize and resume tests**

```js
import { createFakeNavigationAdapter } from './fixtures/navigation.js';

test('round-trips guided and expert project routes', () => {
  assert.deepEqual(parseStudioRoute('/Geburtstagsspiel/studio/project/hals-neu/animation?mode=expert'), {
    projectId: 'hals-neu', step: 'animation', mode: 'expert', selection: null,
  });
  assert.equal(formatStudioRoute({ projectId: 'hals-neu', step: 'playtest', mode: 'guide' }),
    '/Geburtstagsspiel/studio/project/hals-neu/playtest');
});

test('resumes the last valid route without replacing a shared deep link', () => {
  const session = createNavigationSession(createFakeNavigationAdapter({ pathname: '/Geburtstagsspiel/studio/', stored: '/Geburtstagsspiel/studio/project/hals-neu/story' }));
  assert.equal(session.snapshot().step, 'story');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/studio/test/studio-router.test.js apps/studio/test/navigation-session.test.js`

Expected: FAIL because project routes and navigation session are absent.

`createFakeNavigationAdapter({ pathname, search = '', stored = null })` provides in-memory `location`, `history.pushState`, `history.replaceState`, `addEventListener`, `removeEventListener`, and string storage methods. It records every navigation so back/forward and replacement behavior are asserted without a browser.

- [ ] **Step 3: Implement History API routing with base awareness**

Accept only known steps `plan`, `level`, `assets`, `animation`, `story`, `playtest`, `publish`. Invalid project IDs or steps redirect to the project dashboard without discarding the current project. Persist last route and mode under `franz-lola-studio-navigation-v1`. A directly supplied valid URL wins over stored navigation.

- [ ] **Step 4: Add selection to URL only when useful**

Expert workspace may add `?selected=type:id`; transient pointer state, open color picker, scroll offset, and dialog internals remain outside the URL. Back/forward restores project, step, mode, and stable selection.

- [ ] **Step 5: Verify router behavior**

Run:

```bash
node --test apps/studio/test/studio-router.test.js apps/studio/test/navigation-session.test.js
npm test --workspace @franz-lola/studio
```

- [ ] **Step 6: Commit routing**

```bash
git add apps/studio/src/studio-router.js apps/studio/src/studio-navigation.js apps/studio/src/session/navigation-session.svelte.js apps/studio/src/App.svelte apps/studio/test
git diff --cached --check
git commit -m "feat: persist studio project routes"
```

### Task 3: Add IndexedDB project storage and recoverable LocalStorage migration

**Files:**
- Create: `apps/studio/src/persistence/indexeddb-project-repository.js`
- Create: `apps/studio/src/persistence/legacy-draft-migration.js`
- Create: `apps/studio/src/persistence/memory-project-repository.js`
- Create: `apps/studio/test/indexeddb-project-repository.test.js`
- Create: `apps/studio/test/legacy-draft-migration.test.js`
- Create: `apps/studio/test/fixtures/persistence.js`
- Modify: `apps/studio/src/draft-repository.js`
- Modify: `apps/studio/src/main.js`

**Interfaces:**
- Consumes: existing LocalStorage key `franz-lola-level-editor-workspace-v2`.
- Produces: repository methods `listProjects`, `readProject`, `writeProject`, `deleteProject`, `readDocuments`, `writeDocuments`, `appendHistory`, and `exportBackup`; migration marker `franz-lola-studio-migration-v1`.

- [ ] **Step 1: Write failing atomic-save and migration tests**

```js
import {
  character,
  createLegacyStorage,
  level,
  project,
} from './fixtures/persistence.js';

test('writes project and documents atomically', async () => {
  const repository = createMemoryProjectRepository();
  await repository.writeSnapshot({ project, documents: [level, character], expectedRevision: 3 });
  await assert.rejects(
    repository.writeSnapshot({ project: { ...project, revision: 5 }, documents: [], expectedRevision: 2 }),
    /Revision 3/,
  );
  assert.equal((await repository.readProject(project.id)).revision, 4);
});

test('migrates legacy drafts once and keeps a readable backup', async () => {
  const storage = createLegacyStorage();
  const repository = createMemoryProjectRepository();
  const result = await migrateLegacyDraftWorkspace({ storage, repository });
  assert.equal(result.migrated, 2);
  assert.ok(storage.getItem('franz-lola-level-editor-workspace-v2.backup'));
  assert.equal(storage.getItem('franz-lola-studio-migration-v1'), 'complete');
});
```

`fixtures/persistence.js` exports deeply frozen `project`, `level`, and `character` objects with matching IDs/references plus `createLegacyStorage()`, an isolated Map-backed Storage adapter containing exactly two valid legacy drafts and the original v2 workspace JSON.

- [ ] **Step 2: Verify RED**

Run: `node --test apps/studio/test/indexeddb-project-repository.test.js apps/studio/test/legacy-draft-migration.test.js`

Expected: FAIL because repositories do not exist.

- [ ] **Step 3: Implement the repository contract**

Use IndexedDB database `franz-lola-studio`, version 1, with stores `projects`, `documents`, `history`, and `metadata`. Key documents by `[projectId, type, id]`. One readwrite transaction persists project, documents, and a compact command-history checkpoint. Reject stale expected revisions.

- [ ] **Step 4: Implement safe migration**

Parse the legacy workspace, validate every level through content-model, generate one project per draft, and write all valid entries. Invalid entries remain in the backup and appear in a migration report; they are not deleted. Set the completion marker only after the IndexedDB transaction succeeds. Never delete the original key automatically.

- [ ] **Step 5: Use LocalStorage only for lightweight state**

Keep navigation, language, theme, guide/expert preference, last project ID, tool, zoom, and camera in LocalStorage. Route all project documents and history through the project repository.

- [ ] **Step 6: Verify persistence and reload in browser**

Run:

```bash
node --test apps/studio/test/indexeddb-project-repository.test.js apps/studio/test/legacy-draft-migration.test.js
npm test --workspace @franz-lola/studio
npm run test:e2e --workspace @franz-lola/studio -- --grep "draft|reload|migration"
```

- [ ] **Step 7: Commit persistence**

```bash
git add apps/studio/src/persistence apps/studio/src/draft-repository.js apps/studio/src/main.js apps/studio/test apps/studio/e2e
git diff --cached --check
git commit -m "feat: persist studio projects in IndexedDB"
```

### Task 4: Compose focused StudioSession sub-models and retire monolithic ownership

**Files:**
- Create: `apps/studio/src/session/studio-session.svelte.js`
- Create: `apps/studio/src/session/project-session.svelte.js`
- Create: `apps/studio/src/session/selection-session.svelte.js`
- Create: `apps/studio/src/session/tool-session.svelte.js`
- Create: `apps/studio/src/session/viewport-session.svelte.js`
- Create: `apps/studio/src/session/draft-sync-session.svelte.js`
- Create: `apps/studio/src/session/publication-session.svelte.js`
- Create: `apps/studio/test/studio-session.test.js`
- Modify: `apps/studio/src/studio/store.svelte.js`
- Modify: `apps/studio/src/App.svelte`

**Interfaces:**
- Consumes: content-model, command history, project repository, navigation session, render session, and publisher client.
- Produces: `createStudioSession(dependencies)` with properties `project`, `navigation`, `selection`, `tools`, `viewport`, `history`, `render`, `drafts`, `publication`, and derived `readiness`.

- [ ] **Step 1: Write failing ownership tests**

```js
test('selection and tool gestures do not mutate persistent project state until committed', () => {
  const studio = createStudioSession(testDependencies());
  studio.selection.select({ type: 'object', id: 'note-1' });
  studio.tools.beginGesture({ tool: 'move', point: { x: 1, y: 1 } });
  studio.tools.updateGesture({ x: 3, y: 4 });
  assert.equal(studio.project.snapshot().revision, 1);
  studio.tools.commitGesture();
  assert.equal(studio.project.snapshot().revision, 2);
  assert.equal(studio.history.snapshot().undoLabel, 'Objekt verschieben');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/studio/test/studio-session.test.js`

Expected: FAIL because composed sessions do not exist.

- [ ] **Step 3: Build a compatibility facade around existing commands**

First make `StudioSession` delegate existing mutating operations through `ProjectSession.execute(command)`. Keep legacy component method names on a temporary facade, but prohibit new persistent fields in `store.svelte.js`. Move one responsibility per focused commit step until the old store owns only composition compatibility.

- [ ] **Step 4: Define selection and gesture semantics**

`SelectionSession` stores stable `{ type, id }` references and supports replace, toggle, add, remove, rectangle selection, select all by type, and clear. `ToolSession` stores transient gesture start/current points and creates exactly one command on commit. Escape cancels without revision change. Pointer capture loss cancels safely.

- [ ] **Step 5: Separate cloud/draft/publication state**

`DraftSyncSession` owns local/cloud revision and conflict state. `PublicationSession` owns selected snapshot, preflight, publication ID, progress, retry, and resume. Neither may directly modify editor selection or viewport.

- [ ] **Step 6: Add a boundary test for forbidden imports**

Assert that selection/tool/viewport modules do not import publisher client, D1/cloud policy, Svelte components, or IndexedDB; publication session does not import canvas/editor tools; project model does not import browser globals.

- [ ] **Step 7: Run session and existing studio tests**

Run:

```bash
node --test apps/studio/test/studio-session.test.js apps/studio/test/studio-history.test.js apps/studio/test/editor-tools.test.js
npm test --workspace @franz-lola/studio
npm run test:e2e --workspace @franz-lola/studio -- --grep "undo|selection|cloud conflict"
```

- [ ] **Step 8: Commit the session architecture**

```bash
git add apps/studio/src/session apps/studio/src/studio/store.svelte.js apps/studio/src/App.svelte apps/studio/test apps/studio/e2e
git diff --cached --check
git commit -m "refactor: compose focused studio sessions"
```

### Task 5: Build the guided shell, dashboard, and 0–100 step rail

**Files:**
- Create: `apps/studio/src/components/guide/GuideShell.svelte`
- Create: `apps/studio/src/components/guide/ProjectDashboard.svelte`
- Create: `apps/studio/src/components/guide/StepRail.svelte`
- Create: `apps/studio/src/components/guide/ReadinessPanel.svelte`
- Create: `apps/studio/src/components/expert/ExpertShell.svelte`
- Create: `apps/studio/src/components/ModeSwitcher.svelte`
- Modify: `apps/studio/src/App.svelte`
- Modify: `apps/studio/src/style.css`
- Create: `apps/studio/e2e/guided-workflow.spec.js`

**Interfaces:**
- Consumes: navigation/readiness/project sessions.
- Produces: guide/expert shells with identical project content and an accessible readiness display.

- [ ] **Step 1: Write a failing guided navigation browser test**

```js
test('a first-time user sees the guided project journey and can switch modes without data loss', async ({ page }) => {
  await page.goto('/Geburtstagsspiel/studio/');
  await expect(page.getByRole('heading', { name: 'Was möchtest du bauen?' })).toBeVisible();
  await page.getByRole('button', { name: 'Mit einer Vorlage starten' }).click();
  await page.getByRole('button', { name: 'Hals' }).click();
  await expect(page.getByRole('progressbar', { name: 'Projektfortschritt' })).toHaveAttribute('aria-valuenow', /\d+/);
  await page.getByRole('button', { name: 'Profi-Studio öffnen' }).click();
  await expect(page.locator('#level-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Geführten Modus öffnen' }).click();
  await expect(page.getByText('Hals', { exact: true })).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:e2e --workspace @franz-lola/studio -- --grep "guided project journey"`

Expected: FAIL because the guided shell does not exist.

- [ ] **Step 3: Build the project dashboard**

Show recent local/shared projects, template start, empty project, import backup, and recovery/migration notices. Each card shows name, location/theme, last saved time, readiness percent, cloud/local state, and one primary action. Deletion remains behind a confirmation naming the project and whether it is local or shared.

- [ ] **Step 4: Build the step rail and context action**

Desktop uses a vertical rail; mobile uses a compact top step plus drawer. Each step shows complete/current/attention/locked state, but users may enter any non-publish step. The primary footer action is specific, such as `Wege testen`, `Franz animieren`, or `Testspiel starten`, never generic `Weiter` when a clearer verb exists.

- [ ] **Step 5: Render localized issue actions**

`ReadinessPanel` maps `messageKey` and params to standard/dialect copy and invokes `issue.action` to navigate/select the affected item. Screen readers receive one polite summary when percentage or blocker count changes, not one announcement per issue.

- [ ] **Step 6: Build the expert shell from existing workspaces**

Keep Level, Objects, Characters, Animations, Cutscenes, Events, Playtest, and Live navigation. The mode switch only changes shell/navigation. It does not clone project state or instantiate another renderer/session.

- [ ] **Step 7: Verify guide accessibility and responsive layouts**

Run:

```bash
npm run test:e2e --workspace @franz-lola/studio -- --grep "guided|mode|progress"
npm run test:visual --workspace @franz-lola/studio
```

Cover 1440×900, 390×844, 412×915, and 915×412. Assert no clipped primary action, keyboard-complete step navigation, visible focus, and progress text independent of color.

- [ ] **Step 8: Commit the product shell**

```bash
git add apps/studio/src/components/guide apps/studio/src/components/expert apps/studio/src/components/ModeSwitcher.svelte apps/studio/src/App.svelte apps/studio/src/style.css apps/studio/e2e
git diff --cached --check
git commit -m "feat: guide creators through level production"
```

### Task 6: Unify select, move, draw, text, and per-instance block tooling

**Files:**
- Modify: `apps/studio/src/editor-tools.js`
- Modify: `apps/studio/src/editor-state.js`
- Modify: `apps/studio/src/components/LevelCanvas.svelte`
- Modify: `apps/studio/src/components/LevelWorkspace.svelte`
- Modify: `apps/studio/src/components/SceneTree.svelte`
- Modify: `apps/studio/src/components/SelectionSummary.svelte`
- Create: `apps/studio/src/components/inspector/TransformInspector.svelte`
- Create: `apps/studio/src/components/inspector/BlockInspector.svelte`
- Create: `apps/studio/src/components/inspector/TextInspector.svelte`
- Create: `apps/studio/e2e/expert-tooling.spec.js`
- Create: `apps/studio/test/fixtures/tooling.js`

**Interfaces:**
- Consumes: selection/tool/project sessions and renderer overlay selection.
- Produces: stable tools `select`, `move`, `wall`, `erase`, `object`, `text`, `zone`, and `pan`; individual placed-block overrides.

- [ ] **Step 1: Write failing multi-selection and text-transform tests**

```js
import { toolingLevel } from './fixtures/tooling.js';

test('one drag moves a mixed multi-selection as one undo command', () => {
  const result = applyTransformCommand(toolingLevel, {
    selection: [{ type: 'block', id: 'block-7-4' }, { type: 'object', id: 'note-1' }, { type: 'text', id: 'sign-1' }],
    translate: { x: 2, y: -1 },
  });
  assert.deepEqual(positionOf(result.level, 'note-1'), { x: 8, y: 3 });
  assert.equal(result.command.label, '3 Elemente verschieben');
  assert.deepEqual(result.command.revert(result.level), toolingLevel);
});

test('text can have transparent background and no border without losing crisp glyphs', () => {
  const text = normalizeTextStyle({ background: 'transparent', border: 'none', fontSize: 1.25, padding: 0 });
  assert.deepEqual(text, { background: 'transparent', border: 'none', fontSize: 1.25, padding: 0, color: '#ffffff', align: 'left' });
});
```

`fixtures/tooling.js` exports one deeply frozen version-2 level with stable placed-instance IDs `note-1`, `cat-1`, `block-7-4`, and `sign-1`; the objects span mixed types so group transforms and undo prove per-instance behavior.

- [ ] **Step 2: Verify RED**

Run: `node --test apps/studio/test/editor-tools.test.js apps/studio/test/editor-state.test.js`

Expected: FAIL on mixed block IDs and border-free text normalization.

- [ ] **Step 3: Give every placed block a stable instance identity**

Retain the compact base wall grid, but store per-instance overrides under `level.blockInstances` with ID `block-x-y`, coordinates, base tile type, color/material/effects overrides, and optional animation. Clicking a grid block creates/selects its instance lazily; untouched blocks remain compact.

- [ ] **Step 4: Implement direct manipulation**

Selection click, Shift-toggle, drag rectangle, scene-tree selection, and inspector selection share `SelectionSession`. Move/resize handles use the renderer’s exact PresentationFrame camera. Text resize updates world bounds and integer-aligned glyph rendering; it does not raster-scale an old text bitmap.

- [ ] **Step 5: Add complete text box controls**

Expose content, language variants, font size, line height, alignment, color, padding, background `transparent|solid`, border `none|solid`, border color, position, size, layer, animation, and effects. Default new level text to transparent background and no border so only text appears unless a box is requested.

- [ ] **Step 6: Verify browser usability**

Run:

```bash
npm test --workspace @franz-lola/studio
npm run test:e2e --workspace @franz-lola/studio -- --grep "multi-selection|text|block instance|undo"
npm run test:visual --workspace @franz-lola/studio
```

Browser tests must select individual wall blocks, edit only one override, multi-select across types, undo once, drag and resize borderless transparent text, and verify the renderer screenshot remains crisp at DPR 1, 2, and 2.625.

- [ ] **Step 7: Commit level tooling**

```bash
git add apps/studio/src/editor-tools.js apps/studio/src/editor-state.js apps/studio/src/components apps/studio/test apps/studio/e2e
git diff --cached --check
git commit -m "feat: directly edit every placed level element"
```

### Task 7: Rebuild character, sprite-sheet, and animation authoring around explicit tracks

**Files:**
- Create: `apps/studio/src/animation/animation-model.js`
- Create: `apps/studio/src/animation/playback-controller.js`
- Create: `apps/studio/test/animation-model.test.js`
- Create: `apps/studio/test/playback-controller.test.js`
- Create: `apps/studio/src/components/animation/AnimationWorkspace.svelte`
- Create: `apps/studio/src/components/animation/AnimationTimeline.svelte`
- Create: `apps/studio/src/components/animation/FrameStrip.svelte`
- Create: `apps/studio/src/components/animation/StateMapping.svelte`
- Modify: `apps/studio/src/components/SpriteSheetEditor.svelte`
- Modify: `apps/studio/src/components/CharacterWorkspace.svelte`
- Modify: `apps/studio/src/components/ActorThumbnail.svelte`

**Interfaces:**
- Consumes: existing appearance/keyframes, renderer actor preview, render coordinator.
- Produces: `normalizeAnimationTrack`, `sampleAnimationTrack`, `createPlaybackController`, and state mappings `idle|up|right|down|left`.

- [ ] **Step 1: Write failing timeline and playback tests**

```js
test('samples stepped sprite keyframes and preserves exact state mappings', () => {
  const track = normalizeAnimationTrack({ id: 'walk-right', duration: 0.5, loop: true, keyframes: [
    { id: 'a', time: 0, easing: 'step', pixels: frameA },
    { id: 'b', time: 0.25, easing: 'step', pixels: frameB },
  ] });
  assert.equal(sampleAnimationTrack(track, 0.24).id, 'a');
  assert.equal(sampleAnimationTrack(track, 0.26).id, 'b');
  assert.equal(sampleAnimationTrack(track, 0.51).id, 'a');
});

test('playback pause and scrub never create project revisions', () => {
  const controller = createPlaybackController({ duration: 1, loop: true });
  controller.play(); controller.advance(0.2); controller.pause(); controller.seek(0.7);
  assert.equal(controller.snapshot().time, 0.7);
  assert.equal(project.revision, initialRevision);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/studio/test/animation-model.test.js apps/studio/test/playback-controller.test.js`

Expected: FAIL because animation model/controller do not exist.

- [ ] **Step 3: Normalize existing sprite data without changing Franz/Lola art**

Preserve the approved pixel rows, palette, anchors, scale, and state mapping. Convert legacy `frames` to keyframes once through content migration. Each track stores ID, duration, loop, FPS hint, ordered keyframes, and easing. Reordering or editing is one command.

- [ ] **Step 4: Build the animation workspace**

Layout: actual renderer preview, play/pause/loop/speed/scrub controls, keyframe timeline, frame strip, pixel grid, palette, onion-skin toggle, state mapping, and selected-frame inspector. Dragging a keyframe snaps to 0.01 seconds by default and supports keyboard nudging.

- [ ] **Step 5: Keep preview and project state separate**

Playback time is transient in `RenderSession`; only saved keyframe edits change project revision. Thumbnails render the actual current appearance, state, and keyframe. A missing mapping shows an explicit repair card rather than a generic icon.

- [ ] **Step 6: Verify full character tooling**

Run:

```bash
node --test apps/studio/test/animation-model.test.js apps/studio/test/playback-controller.test.js
npm test --workspace @franz-lola/studio
npm run test:e2e --workspace @franz-lola/studio -- --grep "sprite|animation|player state"
npm run test:visual --workspace @franz-lola/studio
```

Test actual Franz/Lola thumbnails, create a new character, draw and multi-select pixels, map five states, create/reorder/scrub keyframes, play at 30 FPS coordinated cadence, save, reload, and undo.

- [ ] **Step 7: Commit animation tooling**

```bash
git add apps/studio/src/animation apps/studio/src/components/animation apps/studio/src/components/SpriteSheetEditor.svelte apps/studio/src/components/CharacterWorkspace.svelte apps/studio/src/components/ActorThumbnail.svelte apps/studio/test apps/studio/e2e
git diff --cached --check
git commit -m "feat: author sprite and state animation tracks"
```

### Task 8: Unify object effects, edge animation, events, and level-bound cutscenes

**Files:**
- Modify: `apps/studio/src/components/ObjectWorkspace.svelte`
- Modify: `apps/studio/src/components/VisualEffectsEditor.svelte`
- Modify: `apps/studio/src/components/EdgeEffectsEditor.svelte`
- Create: `apps/studio/src/components/events/EventWorkspace.svelte`
- Create: `apps/studio/src/components/events/EventTriggerEditor.svelte`
- Create: `apps/studio/src/components/cutscene/CutsceneWorkspace.svelte`
- Create: `apps/studio/src/components/cutscene/CutsceneTimeline.svelte`
- Create: `apps/studio/src/components/cutscene/CutsceneTrackInspector.svelte`
- Modify: imported legacy event/cutscene workspaces to delegate or remove duplicates
- Create: `apps/studio/test/story-authoring.test.js`

**Interfaces:**
- Consumes: content documents, animation tracks, project references, renderer preview.
- Produces: reusable objects/effects/events and cutscenes whose `levelId` is mandatory.

- [ ] **Step 1: Write failing content constraints**

```js
test('cutscenes are level-bound while objects and events remain reusable', () => {
  assert.throws(() => normalizeCutscene({ id: 'intro', levelId: '', tracks: [] }), /Level/);
  assert.equal(normalizeObject({ id: 'zauberberg-note', appearance, effects: [] }).levelId, undefined);
  assert.deepEqual(normalizeEvent({ id: 'eisvogel', trigger, actions, scope: 'library' }).scope, 'library');
});

test('visual effects never synthesize diagnostic bars into the authored object', () => {
  const result = normalizeVisualEffect({ type: 'glitch', intensity: 0.4, scanBars: false });
  assert.equal(result.scanBars, false);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/studio/test/story-authoring.test.js`

Expected: FAIL until constraints and normalizers exist.

- [ ] **Step 3: Make reusable assets truly global**

Music notes, stage lights, Eisvogel, fish, boat, tree, bench, sign, cats, and custom assets live in the root library and may be placed in every level. The Zauberberg note remains a distinct authored object. Cards render actual object previews and show usage count.

- [ ] **Step 4: Provide composable effect layers**

Support glitch, RGB split, palette pulse, opacity flicker, outline, shadow, wobble, bob, water flow, light cone, particle jump, and authored sprite animation. Each layer has enabled, intensity, cadence, blend, and Reduced Motion fallback. Diagnostic bars are never rendered as an effect control or default object overlay.

- [ ] **Step 5: Build event triggers and actions**

Triggers: zone, collectible count, timer, object interaction, event sequence, level state. Actions: show text, reveal/hide object, play animation, play sound/music, change edge effect, reward, spawn actor, start cutscene. Validation points to missing target IDs.

- [ ] **Step 6: Build the cutscene track timeline**

Tracks support character/object transform, sprite state, camera, text, visibility, audio cue, event, and effect parameters. Keyframes have time/easing; playback/scrub uses the shared coordinator. Cutscene documents require `levelId`, while referenced assets remain reusable.

- [ ] **Step 7: Verify authored examples and usability**

Run:

```bash
npm test --workspace @franz-lola/studio
npm run test:e2e --workspace @franz-lola/studio -- --grep "effect|event|cutscene|Zauberberg"
npm run test:visual --workspace @franz-lola/studio
```

Create/edit the Zauberberg note, stage lights, moving water, jumping fish, boat, Eisvogel event, and one level-bound cutscene entirely through UI. Save/reload and compare renderer previews to playtest.

- [ ] **Step 8: Commit story tooling**

```bash
git add apps/studio/src/components apps/studio/test apps/studio/e2e content
git diff --cached --check
git commit -m "feat: author reusable effects events and cutscenes"
```

### Task 9: Issue revision-bound playtest receipts and build the guided preflight UI

**Files:**
- Create: `apps/studio/src/playtest/playtest-receipt.js`
- Create: `apps/studio/test/playtest-receipt.test.js`
- Modify: `apps/studio/src/components/PlaytestWorkspace.svelte`
- Create: `apps/studio/src/components/guide/PlaytestChecklist.svelte`
- Create: `apps/studio/src/components/guide/PublishPreflight.svelte`
- Modify: `apps/studio/src/components/PublishWorkspace.svelte`
- Modify: `apps/studio/src/session/publication-session.svelte.js`
- Modify: `apps/studio/e2e/guided-workflow.spec.js`

**Interfaces:**
- Consumes: completed game-core session, viewport/render health, readiness model.
- Produces: signed-in-memory `PlaytestReceipt` and an immutable publication snapshot; server upload remains current until Publisher plan.

- [ ] **Step 1: Write failing receipt validity tests**

```js
test('only a completed receipt for the exact revision and viewport counts', () => {
  const receipt = createPlaytestReceipt({
    projectId: 'hals-neu', projectRevision: 12, levelId: 'hals-neu', viewport: 'mobile', completed: true,
    backend: 'webgl2', contextLost: false, fallbackReason: null, duration: 84.2, collected: 630, total: 630,
  });
  assert.equal(receiptMatches(receipt, { projectId: 'hals-neu', revision: 12, viewport: 'mobile' }), true);
  assert.equal(receiptMatches(receipt, { projectId: 'hals-neu', revision: 13, viewport: 'mobile' }), false);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/studio/test/playtest-receipt.test.js`

Expected: FAIL because receipt functions do not exist.

- [ ] **Step 3: Record receipts only on real completion**

The playtest workspace emits a receipt only after the same win condition as the game. Record exact project revision, level ID, desktop/mobile viewport class, backend health, duration, collected/total Guttis, events, and content checksum. Any persistent edit invalidates matching receipts through revision mismatch; do not delete them silently.

- [ ] **Step 4: Build the playtest checklist**

Show Desktop and Mobile as separate checks. A test button launches the exact full-camera playtest. Completion returns to the guide with result summary. Failure or exit records no passing receipt.

- [ ] **Step 5: Build immutable preflight selection**

When readiness is publishable, create a deep-frozen snapshot containing project, dependency closure, exact document revisions/checksums, receipts, and renderer/content contract identifiers. Later edits mark the snapshot stale and require rerunning preflight.

- [ ] **Step 6: Verify complete guided journey without real network**

Use publisher route mocks and run:

```bash
node --test apps/studio/test/playtest-receipt.test.js
npm run test:e2e --workspace @franz-lola/studio -- --grep "guided project journey|playtest receipt|preflight"
```

Create from template, make a valid edit, complete desktop/mobile tests, reach 100%, open preflight, inspect selected dependencies, and assert the publish button disables after one additional edit.

- [ ] **Step 7: Commit playtest/readiness integration**

```bash
git add apps/studio/src/playtest apps/studio/src/components apps/studio/src/session/publication-session.svelte.js apps/studio/test apps/studio/e2e
git diff --cached --check
git commit -m "feat: require revision-bound studio playtests"
```

### Task 10: Run novice usability, accessibility, performance, and visual proof gates

**Files:**
- Create: `apps/studio/e2e/novice-journey.spec.js`
- Create: `apps/studio/e2e/helpers/novice-journey.js`
- Create: `apps/studio/e2e/studio-accessibility.spec.js`
- Create: `apps/studio/e2e/studio-performance.spec.js`
- Modify: `apps/studio/playwright.config.js`
- Modify: `apps/studio/playwright.visual.config.js`
- Modify: root `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: all guided/expert workflows and test diagnostics.
- Produces: reproducible screenshots, videos, accessibility assertions, and task-time/performance budgets.

- [ ] **Step 1: Write the end-to-end novice journey before final polish**

```js
import {
  addObjectFromActualPreview,
  completeViewportPlaytests,
  createCharacterAnimation,
  createEventAndCutscene,
  startFromHalsTemplate,
} from './helpers/novice-journey.js';

test('a novice can create, edit, test, and reach publish-ready without technical UI', async ({ page }) => {
  await startFromHalsTemplate(page);
  await addObjectFromActualPreview(page, 'Zauberberg-Musiknote');
  await createCharacterAnimation(page, 'winken');
  await createEventAndCutscene(page);
  await completeViewportPlaytests(page, ['desktop', 'mobile']);
  await expect(page.getByRole('progressbar', { name: 'Projektfortschritt' })).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByRole('button', { name: 'Veröffentlichung prüfen' })).toBeEnabled();
  await expect(page.locator('body')).not.toContainText(/JSON|Pull Request|SHA|Branch/);
});
```

Each helper uses role/name/test-id locators against visible controls only, waits for the relevant saved/readiness status, and returns its elapsed milliseconds. `completeViewportPlaytests` uses the actual playtest controls and win condition; no helper calls debug mutation hooks, force-clicks, dispatches synthetic DOM events, or writes project state directly.

- [ ] **Step 2: Run it and record the first RED interaction**

Run: `npm run test:e2e --workspace @franz-lola/studio -- --grep "novice can create"`

Expected: FAIL at the first remaining unclear/missing guided interaction. Fix only product defects required by the approved journey; do not weaken the test or force-click controls.

- [ ] **Step 3: Add accessibility assertions**

Test full keyboard flow, focus return for dialogs, named canvases/alternatives, one modal at a time, polite status regions, non-color progress, Reduced Motion, 200% browser zoom, and readable Standard/Dialect switching. Do not use `aria-label` to duplicate visible text.

- [ ] **Step 4: Add performance assertions**

At 1440×900 and 412×915 DPR2.625, assert no unexpected Long Task above 200 ms after settled workspace, hidden surface frames zero, static scene frames <=1 over one second, animated thumbnail 25–31 frames, pointer edit visible next frame, and no renderer context loss/reallocation during resize roundtrip.

- [ ] **Step 5: Generate and inspect visual evidence**

Capture PNG and WebM for project dashboard, guided level step, multi-selection, text edit, character animation, event/cutscene timeline, desktop/mobile playtest, preflight, expert mode, and Reduced Motion. Inspect at least one initial/middle/final video frame per workflow for blank canvases, overlap, flicker, clipped actions, stale previews, and camera jumps.

- [ ] **Step 6: Run the complete Studio gate twice**

Run:

```bash
npm test
npm run build
npm run test:e2e --workspace @franz-lola/studio
npm run test:visual --workspace @franz-lola/studio
npm run test:e2e --workspace @franz-lola/studio
git diff --check
git status -sb
```

- [ ] **Step 7: Commit the Studio acceptance gate**

```bash
git add apps/studio/e2e apps/studio/playwright.config.js apps/studio/playwright.visual.config.js package.json .github/workflows/ci.yml
git diff --cached --check
git commit -m "test: prove the complete novice studio journey"
```

## Guided Studio Completion Gate

Before starting Publisher/Offline/Cutover, run:

```bash
npm ci --ignore-scripts
npm run verify
git diff --check main...HEAD
git status -sb
```

Expected outcome: a first-time creator can plan, author, animate, create events/cutscenes, test, and reach a revision-bound 100% preflight; expert tools remain complete; local projects resume safely; no live publisher or URL cutover has occurred yet.
