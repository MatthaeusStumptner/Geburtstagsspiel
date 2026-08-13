# Franz & Lola Monorepo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the verified game, renderer, studio, publisher, schemas, simulation, and authored content into one npm workspace with one lockfile and one green root gate.

**Architecture:** `Geburtstagsspiel` becomes the canonical monorepo. Existing applications remain independently buildable under `apps/*`, while reusable code moves behind explicit `packages/*` interfaces. The first plan preserves visible behavior and live data; renderer/radar behavior, guided UX, service workers, and production cutover are handled by the follow-up plans.

**Tech Stack:** Node.js 22, npm workspaces, JavaScript ES modules, Svelte 5, Vite 6, Playwright, Node test runner, Cloudflare Workers/Wrangler, D1, GitHub Actions.

## Global Constraints

- Canonical repository: `MatthaeusStumptner/Geburtstagsspiel`.
- Import game source from `c36a9e12137e33019082544ebe9fda9f01d1d55c` plus the approved design commit.
- Import renderer source from `09146f9eedade56d14c441d06fc6bced82bd2323`.
- Import studio and publisher source from `2ef8d21be9246f9a3069b4a83a7ad008754eb748`, but discard their Git renderer pins and nested lockfiles.
- Use one root `package-lock.json`; nested lockfiles are forbidden.
- Internal packages remain private workspace packages and are not published to npm.
- Do not reset or recreate the production D1 database.
- Preserve the game save key and all save migrations.
- Preserve existing level/content IDs and exact published JSON values during the structural move.
- Every task uses TDD, ends in a focused verification, and creates one reviewable commit.
- Do not archive or mutate the old GitHub repositories during this foundation plan.

---

## Planned File Structure

```text
package.json                              root workspace scripts only
package-lock.json                         the only dependency lock
apps/game/                                current game application
apps/studio/                              current level editor application
apps/publisher/                           current Cloudflare Worker and D1 migrations
packages/pixel-renderer/                  imported renderer implementation
packages/content-model/                   schemas, parsing, references, migrations
packages/game-core/                       fixed-step simulation and game rules
packages/testkit/                         shared fixtures and contract helpers
content/                                  canonical authored content
tools/assemble-pages.mjs                  later combined Pages assembly entry
tools/check-workspace-contract.mjs        dependency and package-boundary validation
test/workspace-contract.test.js           root structural regression tests
test/content-catalog-contract.test.js     canonical content checks
.github/workflows/ci.yml                  one root verification gate
```

### Task 1: Freeze source snapshots and write the failing workspace contract

**Files:**
- Create: `docs/migration/source-manifest.json`
- Create: `tools/check-workspace-contract.mjs`
- Create: `test/workspace-contract.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the three exact source commits listed in Global Constraints.
- Produces: `checkWorkspaceContract(rootUrl) -> { packages, lockfiles, externalRendererPins, violations }` for CI and later migration tasks.

- [ ] **Step 1: Record the immutable import manifest**

```json
{
  "schemaVersion": 1,
  "recordedAt": "2026-08-11",
  "sources": {
    "game": {
      "repository": "https://github.com/MatthaeusStumptner/Geburtstagsspiel.git",
      "commit": "c36a9e12137e33019082544ebe9fda9f01d1d55c"
    },
    "renderer": {
      "repository": "https://github.com/MatthaeusStumptner/Pacman_clone_renderer.git",
      "commit": "09146f9eedade56d14c441d06fc6bced82bd2323"
    },
    "studio": {
      "repository": "https://github.com/MatthaeusStumptner/Pacman_clone_level_editor.git",
      "commit": "2ef8d21be9246f9a3069b4a83a7ad008754eb748"
    }
  }
}
```

- [ ] **Step 2: Write the root contract test before moving files**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWorkspaceContract } from '../tools/check-workspace-contract.mjs';

test('reports the current pre-workspace topology without mutating it', async () => {
  const result = await checkWorkspaceContract(new URL('../', import.meta.url));
  assert.deepEqual(result.lockfiles, ['package-lock.json']);
  assert.deepEqual(result.externalRendererPins, ['package.json']);
  assert.deepEqual(result.violations, ['external renderer pins are forbidden']);
  assert.deepEqual(result.packages, []);
});
```

- [ ] **Step 3: Run the test and capture the expected RED**

Run: `node --test test/workspace-contract.test.js`

Expected: FAIL because `tools/check-workspace-contract.mjs` does not yet exist or because the current game root still contains a GitHub renderer pin and no workspaces.

- [ ] **Step 4: Implement the read-only contract checker**

```js
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function walk(directory, root, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'output', '.worktrees'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, root, files);
    else files.push(path.relative(root, absolute).replaceAll('\\', '/'));
  }
  return files;
}

export async function checkWorkspaceContract(rootUrl) {
  const root = fileURLToPath(rootUrl);
  const files = await walk(root, root);
  const lockfiles = files.filter((file) => file.endsWith('package-lock.json')).sort();
  const packageFiles = files.filter((file) => file === 'package.json' || /^(apps|packages)\/[^/]+\/package\.json$/.test(file));
  const manifests = await Promise.all(packageFiles.map(async (file) => ({
    file,
    value: JSON.parse(await readFile(path.join(root, file), 'utf8')),
  })));
  const packages = manifests.filter(({ file }) => file !== 'package.json').map(({ value }) => value.name).sort();
  const externalRendererPins = manifests.flatMap(({ file, value }) => {
    const dependency = value.dependencies?.['@franz-lola/pixel-renderer'];
    return typeof dependency === 'string' && /github:|Pacman_clone_renderer|#[0-9a-f]{7,40}/i.test(dependency) ? [file] : [];
  });
  const violations = [];
  if (lockfiles.length !== 1 || lockfiles[0] !== 'package-lock.json') violations.push('exactly one root package-lock.json is required');
  if (externalRendererPins.length) violations.push('external renderer pins are forbidden');
  return { packages, lockfiles, externalRendererPins, violations };
}
```

- [ ] **Step 5: Keep generated and nested workspace output ignored**

Append these exact entries to `.gitignore` if they are not already present:

```gitignore
apps/*/dist/
apps/*/node_modules/
packages/*/dist/
packages/*/node_modules/
dist/
output/
```

- [ ] **Step 6: Prove the diagnostic contract is GREEN, then commit it**

Run: `node --test test/workspace-contract.test.js`

Expected: PASS. The checker must accurately expose the current external renderer pin; later tasks tighten the same assertions at each migrated topology.

```bash
git add docs/migration/source-manifest.json tools/check-workspace-contract.mjs test/workspace-contract.test.js .gitignore
git commit -m "test: define monorepo workspace contract"
```

### Task 2: Move the existing game into `apps/game` and introduce the root workspace

**Files:**
- Create: `apps/game/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Move: `index.html` -> `apps/game/index.html`
- Move: `vite.config.js` -> `apps/game/vite.config.js`
- Move: `public/` -> `apps/game/public/`
- Move: `src/` -> `apps/game/src/`
- Move: `scripts/` -> `apps/game/scripts/`
- Move: game tests from `test/` -> `apps/game/test/`
- Modify: `apps/game/scripts/browser-game-regression.mjs`
- Modify: `apps/game/scripts/generate-service-worker.mjs`

**Interfaces:**
- Consumes: current game package and all game tests.
- Produces: workspace `@franz-lola/game` with `build`, `test`, `test:browser`, and `verify` scripts callable from root.

- [ ] **Step 1: Add a failing game workspace smoke test**

Add this case to `test/workspace-contract.test.js`:

```js
test('the game workspace keeps its public commands', async () => {
  const game = JSON.parse(await readFile(new URL('../apps/game/package.json', import.meta.url), 'utf8'));
  assert.equal(game.name, '@franz-lola/game');
  assert.equal(game.scripts.verify, 'npm test && npm run build && npm run test:browser');
  assert.equal(game.dependencies['@franz-lola/pixel-renderer'], 'github:MatthaeusStumptner/Pacman_clone_renderer#925b1708dd8cd60f9cf4b0168d7674d8656ebdf2');
  const result = await checkWorkspaceContract(new URL('../', import.meta.url));
  assert.deepEqual(result.packages, ['@franz-lola/game']);
  assert.deepEqual(result.externalRendererPins, ['apps/game/package.json']);
  assert.deepEqual(result.violations, ['external renderer pins are forbidden']);
});
```

Also import `readFile` from `node:fs/promises` at the top of the test.

- [ ] **Step 2: Verify the new test fails**

Run: `node --test test/workspace-contract.test.js`

Expected: FAIL with `ENOENT` for `apps/game/package.json`.

- [ ] **Step 3: Move game-owned paths with Git-aware moves**

Run these as separate commands so every move is inspectable:

```powershell
New-Item -ItemType Directory -Force apps\game
git mv index.html apps/game/index.html
git mv vite.config.js apps/game/vite.config.js
git mv public apps/game/public
git mv src apps/game/src
git mv scripts apps/game/scripts
New-Item -ItemType Directory -Force apps\game\test
```

Move only the existing game test files listed in the source map into `apps/game/test/`. Leave `test/workspace-contract.test.js` at root.

- [ ] **Step 4: Create the game package manifest**

```json
{
  "name": "@franz-lola/game",
  "private": true,
  "version": "0.3.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build && node scripts/generate-service-worker.mjs",
    "preview": "vite preview",
    "test": "node --test test/*.test.js",
    "test:browser": "node scripts/browser-game-regression.mjs",
    "verify": "npm test && npm run build && npm run test:browser",
    "levels:import": "node scripts/import-level-catalog.mjs"
  },
  "dependencies": {
    "@fontsource/dm-mono": "^5.3.0",
    "@fontsource/silkscreen": "^5.3.0",
    "@franz-lola/pixel-renderer": "github:MatthaeusStumptner/Pacman_clone_renderer#925b1708dd8cd60f9cf4b0168d7674d8656ebdf2",
    "svelte": "^5.56.8"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^5.1.1",
    "playwright": "^1.62.1",
    "vite": "^6.4.3"
  }
}
```

- [ ] **Step 5: Replace the root manifest with workspace orchestration**

```json
{
  "name": "franz-lola-monorepo",
  "private": true,
  "version": "0.0.0-monorepo",
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "test:structure": "node --test test/*.test.js",
    "test": "npm run test:structure && npm run test --workspaces --if-present",
    "build": "npm run build --workspace @franz-lola/game",
    "test:browser": "npm run test:browser --workspace @franz-lola/game",
    "verify": "npm run test && npm run build && npm run test:browser"
  },
  "engines": { "node": ">=22.14.0" }
}
```

- [ ] **Step 6: Make game scripts workspace-relative**

In `apps/game/scripts/browser-game-regression.mjs`, resolve the game root from the script directory and never from the process working directory. In `apps/game/scripts/generate-service-worker.mjs`, write only below `apps/game/dist`. Add this assertion to `apps/game/test/service-worker.test.js`:

```js
assert.equal(outputPath, resolve(gameRoot, 'dist', 'sw.js'));
```

- [ ] **Step 7: Generate the first root lock and run the game gate**

Run:

```bash
npm install --ignore-scripts
npm run test:structure
npm run verify --workspace @franz-lola/game
```

Expected: both commands pass. The game deliberately retains its verified Git renderer pin for this one independently green migration commit; Task 3 replaces it only after the local renderer package exists.

- [ ] **Step 8: Commit the game workspace move**

```bash
git add package.json package-lock.json apps/game test/workspace-contract.test.js
git diff --cached --check
git commit -m "refactor: move game into monorepo workspace"
```

### Task 3: Import the verified renderer as a private workspace package

**Files:**
- Create: `packages/pixel-renderer/package.json`
- Import: renderer `src/`, `schema/`, `scripts/`, `test/`, `benchmark/`, `README.md`, `vite.config.js`, and `benchmark.html`
- Do not import: renderer `.git/`, `.github/`, `.worktrees/`, `node_modules/`, `dist/`, `output/`, or `package-lock.json`
- Modify: `apps/game/package.json`
- Modify: root `package-lock.json`
- Modify: root `package.json`

**Interfaces:**
- Consumes: exact renderer source snapshot `09146f9eedade56d14c441d06fc6bced82bd2323`.
- Produces: workspace `@franz-lola/pixel-renderer@0.0.0-monorepo` with the current public exports and renderer verification commands.

- [ ] **Step 1: Add a failing source provenance and local-resolution test**

Add to `test/workspace-contract.test.js`:

```js
test('the game resolves the renderer from the local workspace', async () => {
  const renderer = JSON.parse(await readFile(new URL('../packages/pixel-renderer/package.json', import.meta.url), 'utf8'));
  assert.equal(renderer.name, '@franz-lola/pixel-renderer');
  assert.equal(renderer.version, '0.0.0-monorepo');
  assert.equal(renderer.private, true);
  const resolved = await import.meta.resolve('@franz-lola/pixel-renderer');
  assert.match(resolved, /packages\/pixel-renderer\/src\/index\.js$/);
  const game = JSON.parse(await readFile(new URL('../apps/game/package.json', import.meta.url), 'utf8'));
  assert.equal(game.dependencies['@franz-lola/pixel-renderer'], '0.0.0-monorepo');
  const result = await checkWorkspaceContract(new URL('../', import.meta.url));
  assert.deepEqual(result.packages, ['@franz-lola/game', '@franz-lola/pixel-renderer']);
  assert.deepEqual(result.externalRendererPins, []);
  assert.deepEqual(result.violations, []);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/workspace-contract.test.js`

Expected: FAIL because `packages/pixel-renderer/package.json` does not exist.

- [ ] **Step 3: Import the exact renderer snapshot**

Use the local renderer repository at the recorded commit. Verify its HEAD first:

```bash
git -C C:/Users/matti/Code/Pacman_clone_renderer rev-parse HEAD
```

Expected: `09146f9eedade56d14c441d06fc6bced82bd2323`.

Copy only the paths listed under Files into `packages/pixel-renderer/`. Inspect `git status --short` and reject generated output or nested Git metadata before continuing.

- [ ] **Step 4: Convert the renderer manifest to a workspace package**

Keep its exports and dependency on `@chenglou/pretext`, but set these exact identity fields:

```json
{
  "name": "@franz-lola/pixel-renderer",
  "version": "0.0.0-monorepo",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.14.0" }
}
```

Preserve scripts `build`, `test`, `benchmark`, `benchmark:assert`, `test:browser`, and `verify` byte-for-byte unless a path must be made package-relative.

Only after `packages/pixel-renderer/package.json` exists, replace the temporary game Git dependency with the exact local workspace version:

```json
"@franz-lola/pixel-renderer": "0.0.0-monorepo"
```

- [ ] **Step 5: Expand root build and verification scripts**

Set these root scripts:

```json
{
  "build": "npm run build --workspace @franz-lola/pixel-renderer && npm run build --workspace @franz-lola/game",
  "test:renderer-browser": "npm run test:browser --workspace @franz-lola/pixel-renderer",
  "benchmark:renderer": "npm run benchmark:assert --workspace @franz-lola/pixel-renderer"
}
```

- [ ] **Step 6: Recreate the root lock and prove local linking**

Run:

```bash
npm install --ignore-scripts
npm ls @franz-lola/pixel-renderer --workspaces
npm test --workspace @franz-lola/pixel-renderer
npm run build --workspace @franz-lola/pixel-renderer
npm run verify --workspace @franz-lola/game
```

Expected: npm reports the renderer as a linked workspace; renderer Node tests/build and the complete game gate pass.

- [ ] **Step 7: Commit the renderer import**

```bash
git add packages/pixel-renderer apps/game/package.json package.json package-lock.json test/workspace-contract.test.js
git diff --cached --check
git commit -m "refactor: import shared renderer workspace"
```

### Task 4: Import studio and publisher into the same workspace and fix the known CI race

**Files:**
- Create: `apps/studio/package.json`
- Import: editor `index.html`, `vite.config.js`, `playwright*.js`, `src/`, `test/`, `e2e/`, `scripts/`, `README.md`, `ARCHITECTURE.md`, `EDITOR_UX_AUDIT.md`
- Create: `apps/publisher/package.json`
- Import: publisher `src/`, `test/`, `migrations/`, `wrangler.jsonc`, `.dev.vars.example`, `README.md`
- Do not import: either `.git/`, `.github/`, `node_modules/`, `dist/`, `output/`, `test-results/`, `.playwright-cli/`, or nested `package-lock.json`
- Modify: `apps/studio/src/components/ObjectWorkspace.svelte`
- Modify: `apps/studio/e2e/editor.spec.js`
- Modify: root `package.json`
- Modify: root `package-lock.json`

**Interfaces:**
- Consumes: studio/publisher source snapshot `2ef8d21be9246f9a3069b4a83a7ad008754eb748` and local renderer workspace.
- Produces: workspaces `@franz-lola/studio` and `@franz-lola/publisher`, plus an explicit asset-library readiness contract.

- [ ] **Step 1: Add failing workspace manifest assertions**

```js
test('studio and publisher use the local renderer and one root lock', async () => {
  for (const workspace of ['studio', 'publisher']) {
    const manifest = JSON.parse(await readFile(new URL(`../apps/${workspace}/package.json`, import.meta.url), 'utf8'));
    assert.equal(manifest.dependencies['@franz-lola/pixel-renderer'], '0.0.0-monorepo');
  }
  const result = await checkWorkspaceContract(new URL('../', import.meta.url));
  assert.deepEqual(result.lockfiles, ['package-lock.json']);
  assert.deepEqual(result.packages, [
    '@franz-lola/game',
    '@franz-lola/pixel-renderer',
    '@franz-lola/publisher',
    '@franz-lola/studio',
  ]);
  assert.deepEqual(result.externalRendererPins, []);
  assert.deepEqual(result.violations, []);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/workspace-contract.test.js`

Expected: FAIL with missing `apps/studio/package.json`.

- [ ] **Step 3: Import the exact studio and publisher source snapshot**

Verify the source branch first:

```bash
git -C C:/Users/matti/Code/Pacman_clone_level_editor rev-parse HEAD
```

Expected: `2ef8d21be9246f9a3069b4a83a7ad008754eb748`.

Copy only the listed paths. Move imported `publisher/*` directly into `apps/publisher/`; do not leave a nested publisher package inside `apps/studio`.

- [ ] **Step 4: Set workspace identities and local dependencies**

Use `@franz-lola/studio@0.0.0-monorepo` and `@franz-lola/publisher@0.0.0-monorepo`, both private. Replace both GitHub renderer pins with:

```json
"@franz-lola/pixel-renderer": "0.0.0-monorepo"
```

Keep Svelte, Playwright, Vite, Wrangler, and the publisher `undici` override at their imported versions. Raise publisher Node engine to `>=22.14.0` to match the root.

- [ ] **Step 5: Reproduce the editor PR #18 failure before changing the E2E**

Run:

```bash
npm install --ignore-scripts
npx playwright install chromium
npm run test:e2e --workspace @franz-lola/studio -- --project=desktop-chromium --grep "asset creation is transactional"
```

Expected: FAIL because the asset count is sampled at zero before the 16 built-in assets finish hydrating.

- [ ] **Step 6: Make catalog readiness observable in the UI**

Add a derived readiness flag in the object workspace and expose it without changing visual copy:

```svelte
<section
  class="workspace object-workspace"
  data-library-status={studio.assetCatalogReady ? 'ready' : 'loading'}
>
```

Set `assetCatalogReady` only after the catalog promise has settled and the global assets have been committed to the store. An empty but settled catalog is still `ready`.

- [ ] **Step 7: Correct the transactional E2E boundary**

Before reading `originalCount`, add:

```js
await expect(page.locator('.object-workspace')).toHaveAttribute('data-library-status', 'ready');
const assets = page.locator('.asset-list [data-asset-id]');
const originalIds = await assets.evaluateAll((nodes) => nodes.map((node) => node.dataset.assetId).sort());
```

After cancel, assert both the stable IDs and absence of the canceled draft:

```js
await expect.poll(() => assets.evaluateAll((nodes) => nodes.map((node) => node.dataset.assetId).sort())).toEqual(originalIds);
await expect(page.getByText('Verworfener Entwurf', { exact: true })).toHaveCount(0);
```

- [ ] **Step 8: Run studio and publisher gates**

Run:

```bash
npm run test --workspace @franz-lola/studio
npm run test:e2e --workspace @franz-lola/studio
npm run build --workspace @franz-lola/studio
npm run test --workspace @franz-lola/publisher
npm run deploy --workspace @franz-lola/publisher -- --dry-run --outdir .wrangler-dry-run
node --test test/workspace-contract.test.js
```

Expected: all pass; the structural contract may still report missing content-model/game-core/testkit packages until later tasks, but it must report no nested lockfile and no external renderer pin.

- [ ] **Step 9: Commit the studio and publisher import**

```bash
git add apps/studio apps/publisher package.json package-lock.json test/workspace-contract.test.js
git diff --cached --check
git commit -m "refactor: import studio and publisher workspaces"
```

### Task 5: Extract the shared content model from the renderer

**Files:**
- Create: `packages/content-model/package.json`
- Create: `packages/content-model/src/index.js`
- Move: `packages/pixel-renderer/src/level-format.js` -> `packages/content-model/src/level-format.js`
- Move: `packages/pixel-renderer/src/content-document.js` -> `packages/content-model/src/content-document.js`
- Move: renderer schemas -> `packages/content-model/schema/`
- Move: renderer content/schema tests -> `packages/content-model/test/`
- Create: `packages/content-model/src/project-dependencies.js`
- Create: `packages/content-model/src/migrations.js`
- Create: `packages/content-model/test/fixtures/content-documents.js`
- Create: `packages/content-model/test/project-dependencies.test.js`
- Create: `packages/content-model/test/schema-migration.test.js`
- Modify: imports in renderer, game, studio, and publisher
- Modify: all affected package manifests

**Interfaces:**
- Consumes: existing level/content parsing and validation behavior.
- Produces: `MIN_CONTENT_SCHEMA_VERSION`, `CONTENT_SCHEMA_VERSION`, `CONTENT_TYPES`, `migrateContentDocument(input)`, `parseLevelDocument`, `validateLevelDocument`, `parseContentDocument`, `validateContentDocument`, `contentPublicationPath`, and `resolveProjectDependencies(documents)` from `@franz-lola/content-model`.

- [ ] **Step 1: Write the failing dependency-closure test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProjectDependencies } from '../src/project-dependencies.js';

test('resolves a stable transitive publication closure and reports missing IDs', () => {
  const result = resolveProjectDependencies([
    { type: 'level', id: 'hals', references: [{ type: 'character', id: 'franz' }, { type: 'cutscene', id: 'intro' }] },
    { type: 'character', id: 'franz', references: [{ type: 'animation', id: 'franz-walk' }] },
    { type: 'animation', id: 'franz-walk', references: [] },
  ], [{ type: 'level', id: 'hals' }]);
  assert.deepEqual(result.ordered.map(({ type, id }) => `${type}:${id}`), [
    'animation:franz-walk', 'character:franz', 'level:hals',
  ]);
  assert.deepEqual(result.missing, [{ from: 'level:hals', type: 'cutscene', id: 'intro' }]);
  assert.deepEqual(result.cycles, []);
});
```

Add `packages/content-model/test/fixtures/content-documents.js` with two deeply frozen, minimal documents copied from the current valid renderer fixtures: `legacyObjectV1` uses schema version 1 and `eventV2` uses schema version 2 with `type: 'event'`. Then add:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTENT_SCHEMA_VERSION,
  CONTENT_TYPES,
  MIN_CONTENT_SCHEMA_VERSION,
  migrateContentDocument,
  parseContentDocument,
} from '../src/index.js';
import { eventV2, legacyObjectV1 } from './fixtures/content-documents.js';

test('migrates schema v1 to v2 and accepts reusable events', () => {
  assert.equal(MIN_CONTENT_SCHEMA_VERSION, 1);
  assert.equal(CONTENT_SCHEMA_VERSION, 2);
  assert.ok(CONTENT_TYPES.includes('event'));
  const migrated = migrateContentDocument(legacyObjectV1);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(legacyObjectV1.schemaVersion, 1);
  assert.deepEqual(parseContentDocument(eventV2), eventV2);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test packages/content-model/test/project-dependencies.test.js packages/content-model/test/schema-migration.test.js`

Expected: FAIL because the package, migration module, and event-aware schema do not exist.

- [ ] **Step 3: Create the content-model package and preserve existing exports**

```json
{
  "name": "@franz-lola/content-model",
  "version": "0.0.0-monorepo",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./schema/franz-lola-level.schema.json": "./schema/franz-lola-level.schema.json",
    "./schema/franz-lola-content.schema.json": "./schema/franz-lola-content.schema.json"
  },
  "scripts": { "test": "node --test" },
  "engines": { "node": ">=22.14.0" }
}
```

Move the existing parser/validator code and re-export its current constants from `src/index.js`.

- [ ] **Step 4: Add the versioned event-aware schema migration**

Use these exact public constants:

```js
export const MIN_CONTENT_SCHEMA_VERSION = 1;
export const CONTENT_SCHEMA_VERSION = 2;
export const CONTENT_TYPES = Object.freeze([
  'character', 'tileset', 'block', 'animation', 'cutscene', 'object', 'event',
]);
```

`migrateContentDocument(input)` accepts only non-array objects with an integer schema version from 1 through 2. Version 1 is cloned, normalized to version 2, and receives explicit empty `references` when absent; version 2 is cloned unchanged after validation. Public parsing migrates before current-schema validation and always returns version 2. Unknown/future versions fail closed with a version-specific issue. Update the JSON schema discriminator and publication-path mapping for `event`; do not silently reinterpret any existing type.

- [ ] **Step 5: Implement deterministic dependency closure**

`resolveProjectDependencies(documents, roots)` must index documents by `type:id`, traverse declared `references`, sort each adjacency list lexicographically, emit dependencies before dependents, deduplicate nodes, report missing references with their owner, and return explicit cycle paths. It must never silently remove a missing reference.

- [ ] **Step 6: Replace cross-package imports**

Renderer imports format functions from `@franz-lola/content-model` rather than local files. Game, studio, and publisher must also import validation/publication functions from content-model directly. Add this root boundary assertion:

```js
assert.equal(renderer.dependencies['@franz-lola/content-model'], '0.0.0-monorepo');
assert.equal(publisher.dependencies['@franz-lola/content-model'], '0.0.0-monorepo');
const topology = await checkWorkspaceContract(new URL('../', import.meta.url));
assert.deepEqual(topology.packages, [
  '@franz-lola/content-model',
  '@franz-lola/game',
  '@franz-lola/pixel-renderer',
  '@franz-lola/publisher',
  '@franz-lola/studio',
]);
```

- [ ] **Step 7: Run all affected tests**

Run:

```bash
npm install --ignore-scripts
node --test packages/content-model/test/schema-migration.test.js packages/content-model/test/project-dependencies.test.js
npm test --workspace @franz-lola/content-model
npm test --workspace @franz-lola/pixel-renderer
npm test --workspace @franz-lola/game
npm test --workspace @franz-lola/studio
npm test --workspace @franz-lola/publisher
```

Expected: every existing parser, schema, publication, and application test passes unchanged, plus the new dependency-closure test.

- [ ] **Step 8: Commit the content boundary**

```bash
git add packages/content-model packages/pixel-renderer apps package.json package-lock.json test/workspace-contract.test.js
git diff --cached --check
git commit -m "refactor: extract shared content model"
```

### Task 6: Move authored content to the canonical root catalog with checksum proof

**Files:**
- Create: `content/levels/`
- Create: `content/characters/`, `content/tilesets/`, `content/blocks/`, `content/animations/`, `content/cutscenes/`, `content/objects/`, `content/events/`
- Create: `tools/migrate-content-catalog.mjs`
- Create: `tools/content-checksums.mjs`
- Create: `test/content-catalog-contract.test.js`
- Modify: `apps/game/src/game/level-catalog.js`
- Modify: `apps/game/scripts/import-level-catalog.mjs`
- Modify: `apps/studio/scripts/generate-game-catalog.mjs`
- Modify: `apps/studio/src/catalog.js`
- Modify: `apps/publisher/src/github.js`
- Modify: `apps/publisher/src/level-publication.js`

**Interfaces:**
- Consumes: nine existing game level documents and studio reusable content.
- Produces: `readContentCatalog(rootUrl)`, canonical `content/*` paths, and a migration report with old/new SHA-256 values.

- [ ] **Step 1: Write the failing checksum-preservation test**

```js
test('canonical levels preserve every source JSON value', async () => {
  const report = JSON.parse(await readFile(new URL('../docs/migration/content-checksums.json', import.meta.url), 'utf8'));
  assert.equal(report.levels.length, 9);
  for (const level of report.levels) {
    assert.equal(level.sourceValueSha256, level.canonicalValueSha256, level.id);
  }
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/content-catalog-contract.test.js`

Expected: FAIL because the migration report does not exist.

- [ ] **Step 3: Implement a dry-run-first catalog migrator**

The CLI accepts only these modes:

```text
node tools/migrate-content-catalog.mjs --check
node tools/migrate-content-catalog.mjs --write
```

`--check` reads both source trees and reports collisions, invalid IDs, schema errors, and normalized JSON-value hashes without writing. `--write` refuses to run unless the current source paths and counts match the recorded manifest. Hash parsed-and-stably-stringified JSON values so line endings and indentation do not create false changes.

- [ ] **Step 4: Move the level catalog and reusable content**

Run `--check`, inspect all nine level IDs, then run `--write`. Do not delete source files until the generated report proves equal value hashes. After the test is GREEN, delete the old game level JSONs and the generated `apps/studio/src/data/passau-levels.json` source; the studio catalog generator must read root `content/` instead.

- [ ] **Step 5: Update all readers and publisher paths**

Game imports a build-generated catalog module produced from root `content/`. Studio reads the same root source in dev/build. Publisher repository calls list `content/levels` and write through `contentPublicationPath` for every supported type, including `event`.

Add this publisher assertion:

```js
assert.equal(contentPublicationPath({ type: 'level', id: 'hals' }), 'content/levels/hals.level.json');
assert.equal(contentPublicationPath({ type: 'event', id: 'eisvogel' }), 'content/events/eisvogel.event.json');
```

- [ ] **Step 6: Verify catalog consumers**

Run:

```bash
node tools/migrate-content-catalog.mjs --check
npm test --workspace @franz-lola/content-model
npm test --workspace @franz-lola/game
npm test --workspace @franz-lola/studio
npm test --workspace @franz-lola/publisher
npm run build --workspace @franz-lola/game
npm run build --workspace @franz-lola/studio
```

Expected: all nine levels and all reusable studio assets are available from root content; checksum contract and published path tests pass.

- [ ] **Step 7: Commit the canonical content move**

```bash
git add content tools docs/migration/content-checksums.json test/content-catalog-contract.test.js apps packages
git diff --cached --check
git commit -m "refactor: centralize authored content catalog"
```

### Task 7: Extract deterministic simulation into `game-core`

**Files:**
- Create: `packages/game-core/package.json`
- Create: `packages/game-core/src/index.js`
- Move: renderer simulation modules -> `packages/game-core/src/simulation/`
- Move: `apps/game/src/game/actor-respawn.js`, `difficulty-config.js`, `level-cutscene-player.js`, and pure progress rules -> `packages/game-core/src/`
- Move: corresponding pure tests -> `packages/game-core/test/`
- Create: `packages/game-core/src/game-session.js`
- Create: `packages/game-core/test/fixtures.js`
- Create: `packages/game-core/test/game-session.test.js`
- Modify: imports in renderer, game, and studio playtest
- Modify: root `test/workspace-contract.test.js`

**Interfaces:**
- Consumes: `FixedStepLoop`, `LevelSimulation`, grid motion, actor motion, difficulty profiles, respawn, and cutscene sampling.
- Produces: `createGameSession({ level, difficulty, seed })`, `session.queueInput(input)`, `session.step(dt)`, and `session.snapshot()`.

- [ ] **Step 1: Write a failing deterministic session test**

```js
import { deterministicSessionLevel } from './fixtures.js';

test('game and studio sessions produce identical snapshots for the same seed and input', () => {
  const input = Array.from({ length: 240 }, (_, index) => index < 120 ? 'right' : 'down');
  const first = createGameSession({ level: deterministicSessionLevel, difficulty: 'normal', seed: 42 });
  const second = createGameSession({ level: deterministicSessionLevel, difficulty: 'normal', seed: 42 });
  for (const direction of input) {
    first.queueInput(direction);
    second.queueInput(direction);
    first.step(1 / 120);
    second.step(1 / 120);
  }
  assert.deepEqual(first.snapshot(), second.snapshot());
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test packages/game-core/test/game-session.test.js`

Expected: FAIL because `createGameSession` does not exist.

- [ ] **Step 3: Move pure simulation modules without changing behavior**

Create `@franz-lola/game-core@0.0.0-monorepo`, private, depending only on `@franz-lola/content-model`. `test/fixtures.js` exports one deeply frozen minimal valid level named `deterministicSessionLevel`; it has a fixed 9×9 grid, player/cat spawn, pellets, and no browser-owned fields. Renderer and applications import `FixedStepLoop`, `LevelSimulation`, motion functions, and profiles from game-core. Keep renderer re-exports temporarily for one migration commit, marked in a compatibility test, then remove them after all consumers use game-core.

Update the structural expectation to these six packages:

```js
assert.deepEqual(topology.packages, [
  '@franz-lola/content-model',
  '@franz-lola/game',
  '@franz-lola/game-core',
  '@franz-lola/pixel-renderer',
  '@franz-lola/publisher',
  '@franz-lola/studio',
]);
```

- [ ] **Step 4: Implement the session facade**

`createGameSession` validates the level, creates one fixed-step simulation and seeded random source, records queued direction input, advances only through `step(dt)`, and returns a deeply immutable snapshot containing player, cats, characters, pellets, power-ups, events, state, score, lives, elapsed, previous positions, and interpolation alpha. It must not access DOM, canvas, storage, audio, or wall-clock time.

- [ ] **Step 5: Use the same session in game and studio playtest**

Replace studio `playtest-engine.js` construction with `createGameSession`. In the game, route fixed-step state mutation through the same session while keeping browser UI, audio, save, and navigation adapters in `apps/game`. Add a cross-app fixture test in `packages/testkit` during Task 8.

- [ ] **Step 6: Verify simulation parity**

Run:

```bash
npm test --workspace @franz-lola/game-core
npm test --workspace @franz-lola/pixel-renderer
npm test --workspace @franz-lola/game
npm test --workspace @franz-lola/studio
npm run test:e2e --workspace @franz-lola/studio -- --grep "playtest"
npm run test:browser --workspace @franz-lola/game
```

Expected: deterministic unit test passes; existing game and editor playtest behavior remains green.

- [ ] **Step 7: Commit the shared simulation boundary**

```bash
git add packages/game-core packages/pixel-renderer apps package.json package-lock.json
git diff --cached --check
git commit -m "refactor: share deterministic game core"
```

### Task 8: Add the root testkit, package boundaries, and unified CI gate

**Files:**
- Create: `packages/testkit/package.json`
- Create: `packages/testkit/src/index.js`
- Create: `packages/testkit/src/fixtures.js`
- Create: `packages/testkit/test/cross-app-contract.test.js`
- Create: `tools/check-package-boundaries.mjs`
- Create: `test/package-boundaries.test.js`
- Modify: root `package.json`
- Modify: `.github/workflows/ci.yml`
- Remove: imported application-specific workflow files from app directories if any were accidentally copied

**Interfaces:**
- Consumes: content-model, game-core, pixel-renderer, game, studio, publisher.
- Produces: `loadGoldenProject(id)`, `runInputScript(session, script)`, root `npm run verify:foundation`, and one mandatory PR gate.

- [ ] **Step 1: Write failing boundary and cross-app tests**

```js
test('applications do not import another application source tree', async () => {
  const violations = await checkPackageBoundaries(new URL('../', import.meta.url));
  assert.deepEqual(violations, []);
});

test('game and studio consume the same local contracts', async () => {
  const project = await loadGoldenProject('hals-smoke');
  const snapshot = runInputScript(createGameSession(project.session), project.inputs);
  assert.equal(snapshot.levelId, 'hals-smoke');
  assert.equal(snapshot.state, 'won');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/package-boundaries.test.js packages/testkit/test/cross-app-contract.test.js`

Expected: FAIL because testkit and boundary checker do not exist.

- [ ] **Step 3: Implement the testkit and import boundary scanner**

Create this exact package identity:

```json
{
  "name": "@franz-lola/render-testkit",
  "version": "0.0.0-monorepo",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.js" },
  "scripts": { "test": "node --test" },
  "dependencies": {
    "@franz-lola/content-model": "0.0.0-monorepo",
    "@franz-lola/game-core": "0.0.0-monorepo"
  },
  "engines": { "node": ">=22.14.0" }
}
```

The boundary scanner parses relative and package import specifiers in `apps/*/src/**/*.{js,svelte}`. It rejects paths entering another `apps/*` directory and requires shared imports to use `@franz-lola/*`. It ignores test fixtures only when they live in `packages/testkit`.

The golden fixture contains a minimal valid level, deterministic seed, exact input sequence, and expected final checksum. Do not depend on browser APIs. Update the workspace contract to the final seven-package Foundation list:

```js
assert.deepEqual(topology.packages, [
  '@franz-lola/content-model',
  '@franz-lola/game',
  '@franz-lola/game-core',
  '@franz-lola/pixel-renderer',
  '@franz-lola/publisher',
  '@franz-lola/render-testkit',
  '@franz-lola/studio',
]);
```

- [ ] **Step 4: Finalize root scripts**

Use these root command boundaries:

```json
{
  "test:structure": "node --test test/*.test.js",
  "test:packages": "npm run test --workspaces --if-present",
  "test": "npm run test:structure && npm run test:packages",
  "build": "npm run build --workspace @franz-lola/pixel-renderer && npm run build --workspace @franz-lola/game && npm run build --workspace @franz-lola/studio",
  "test:browser": "npm run test:browser --workspace @franz-lola/pixel-renderer && npm run test:browser --workspace @franz-lola/game && npm run test:e2e --workspace @franz-lola/studio",
  "verify:foundation": "npm test && npm run build && npm run benchmark:assert --workspace @franz-lola/pixel-renderer && npm run test:browser",
  "verify": "npm run verify:foundation"
}
```

- [ ] **Step 5: Replace CI with the unified gate**

`.github/workflows/ci.yml` must check out once, set up Node 22 with root npm cache, run `npm ci --ignore-scripts`, install Chromium once, run `npm run verify`, and upload renderer/game/studio artifacts on failure. No workspace may run `npm ci` from a nested directory.

- [ ] **Step 6: Run the complete foundation verification twice**

Run:

```bash
npm ci --ignore-scripts
npm run verify:foundation
npm run verify:foundation
git diff --check
git status --short
```

Expected: both full runs pass from the same root lock; workspace contract reports the seven exact packages, one lockfile, no external renderer pin, and no app-to-app import.

- [ ] **Step 7: Commit the foundation gate**

```bash
git add packages/testkit tools/check-package-boundaries.mjs test package.json package-lock.json .github/workflows/ci.yml
git diff --cached --check
git commit -m "ci: verify the complete Franz and Lola workspace"
```

## Foundation Completion Gate

Before starting the shared-rendering plan, verify all of the following:

```bash
npm ci --ignore-scripts
npm run verify:foundation
npm run deploy --workspace @franz-lola/publisher -- --dry-run --outdir .wrangler-dry-run
node tools/migrate-content-catalog.mjs --check
git diff --check main...HEAD
git status -sb
```

Expected outcome: the game, renderer, studio, and publisher are independently functional inside one workspace; all authored content is canonical and checksummed; no live deployment, D1 migration, repository archive, or URL change has happened yet.
