# Publisher, Offline, and Production Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing GitHub App/D1 publisher while making publication resumable and understandable, deploy game and studio atomically from the monorepo, add safe offline behavior, migrate live data, and cut over without losing drafts or breaking OAuth.

**Architecture:** The Cloudflare Worker remains the only privileged component and validates content through the shared content-model package. One GitHub Pages artifact contains game at the repository root and studio under `/studio/`; separate service-worker policies prevent cache interference. Production migration uses additive D1 changes, dual-origin transition support, dry runs, checksums, and explicit rollback gates.

**Tech Stack:** Cloudflare Workers, Wrangler 4, D1/SQLite, GitHub App OAuth, GitHub REST API, GitHub Actions, GitHub Pages, Svelte 5, IndexedDB, Service Worker, Node test runner, Playwright.

## Global Constraints

- Requires all preceding Monorepo, Shared Rendering, and Guided Studio plans.
- Keep the current worker name `franz-lola-publisher` and D1 database `franz-lola-publisher-level-db` with binding `LEVEL_DB`.
- Keep all existing secrets: `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`, `SESSION_SECRET`, `ALLOWED_GITHUB_LOGINS`.
- Do not expose GitHub App credentials or publisher session tokens to service workers, caches, logs, or stored project documents.
- Keep `GITHUB_OWNER=MatthaeusStumptner`, `GITHUB_REPO=Geburtstagsspiel`, and `GITHUB_BASE_BRANCH=main`.
- New studio URL: `https://matthaeusstumptner.github.io/Geburtstagsspiel/studio/`.
- Game URL remains `https://matthaeusstumptner.github.io/Geburtstagsspiel/`.
- D1 migrations are additive/rebuild-with-copy only; never drop production data without a verified copy and count/hash proof.
- Offline publication is forbidden; offline authoring remains available.
- API, OAuth, publication status, D1 sync, and non-versioned manifests are never cache-first.
- Old repositories are archived only after an explicit final user approval following live verification.
- Every task uses TDD and ends with a separate reviewable commit.

---

## Planned File Structure

```text
apps/publisher/migrations/0003_publication_resume_and_events.sql
apps/publisher/src/publication-state.js
apps/publisher/src/content-store.js
apps/publisher/src/github.js
apps/publisher/src/index.js
apps/studio/src/publication/publication-client.js
apps/studio/src/publication/publication-progress.js
apps/studio/src/platform/register-studio-service-worker.js
apps/studio/scripts/generate-service-worker.mjs
apps/game/scripts/generate-service-worker.mjs
tools/assemble-pages.mjs
tools/generate-build-manifest.mjs
tools/rehearse-production-migration.mjs
test/pages-artifact.test.js
.github/workflows/ci.yml
.github/workflows/deploy.yml
.github/workflows/deploy-publisher.yml
.github/workflows/publish-content.yml
```

### Task 1: Move publisher validation and repository paths to shared content-model

**Files:**
- Modify: `apps/publisher/src/level-publication.js`
- Modify: `apps/publisher/src/github.js`
- Modify: `apps/publisher/src/index.js`
- Modify: `apps/publisher/test/level-publication.test.js`
- Modify: `apps/publisher/test/github.test.js`
- Modify: `apps/publisher/test/worker.test.js`
- Modify: `apps/publisher/package.json`

**Interfaces:**
- Consumes: `parseLevelDocument`, `parseContentDocument`, `contentPublicationPath`, and `resolveProjectDependencies` from `@franz-lola/content-model`.
- Produces: publisher reads/writes only canonical `content/*` paths and accepts all declared types including `event`.

- [ ] **Step 1: Write failing canonical-path tests**

```js
test('publishes canonical monorepo paths for every content type', () => {
  assert.deepEqual([
    publicationPath({ type: 'level', id: 'hals' }),
    publicationPath({ type: 'character', id: 'franz' }),
    publicationPath({ type: 'tileset', id: 'passau' }),
    publicationPath({ type: 'block', id: 'wasser' }),
    publicationPath({ type: 'animation', id: 'franz-walk' }),
    publicationPath({ type: 'cutscene', id: 'hals-intro' }),
    publicationPath({ type: 'object', id: 'eisvogel' }),
    publicationPath({ type: 'event', id: 'eisvogel-sichtung' }),
  ], [
    'content/levels/hals.level.json',
    'content/characters/franz.character.json',
    'content/tilesets/passau.tileset.json',
    'content/blocks/wasser.block.json',
    'content/animations/franz-walk.animation.json',
    'content/cutscenes/hals-intro.cutscene.json',
    'content/objects/eisvogel.object.json',
    'content/events/eisvogel-sichtung.event.json',
  ]);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/publisher/test/level-publication.test.js apps/publisher/test/github.test.js`

Expected: FAIL because current paths target `src/data/*` and event is not supported.

- [ ] **Step 3: Delete duplicated validation logic**

Keep request size/safe-object parsing in the worker, but delegate content semantics and target path generation to content-model. Validate the complete dependency closure server-side against exact D1 revisions before creating a GitHub branch.

- [ ] **Step 4: Update repository reads**

`listPublishedLevels` lists `content/levels`; `bootstrapDrafts` reads those files; content bootstrap enumerates canonical content directories. Reject symlinks, directories, unknown suffixes, uppercase/unsafe IDs, and any path not returned by `contentPublicationPath`.

- [ ] **Step 5: Verify publisher behavior**

Run:

```bash
npm test --workspace @franz-lola/publisher
npm run deploy --workspace @franz-lola/publisher -- --dry-run --outdir .wrangler-dry-run
```

- [ ] **Step 6: Commit canonical publisher paths**

```bash
git add apps/publisher
git diff --cached --check
git commit -m "refactor: publish canonical monorepo content"
```

### Task 2: Add additive D1 support for events, request idempotency, and resumable phases

**Files:**
- Create: `apps/publisher/migrations/0003_publication_resume_and_events.sql`
- Create: `apps/publisher/src/publication-state.js`
- Create: `apps/publisher/test/publication-state.test.js`
- Create: `apps/publisher/test/fixtures/publication.js`
- Modify: `apps/publisher/src/content-store.js`
- Modify: `apps/publisher/src/draft-store.js`
- Modify: `apps/publisher/test/content-store.test.js`
- Modify: `apps/publisher/test/draft-store.test.js`

**Interfaces:**
- Consumes: existing tables `level_drafts`, `level_revisions`, `publications`, `publication_levels`, `content_items`, `content_revisions`, `content_dependencies`, and `publication_items`.
- Produces: `publicationKey(snapshot)`, `createOrReusePublication`, `advancePublication`, and stored fields `request_key`, `phase`, `detail`, `snapshot_json`.

- [ ] **Step 1: Write failing idempotency and migration tests**

```js
import { eventDocument, snapshot } from './fixtures/publication.js';

test('the same immutable snapshot reuses one publication', async () => {
  const first = await createOrReusePublication(db, { login: 'matti', snapshot });
  const second = await createOrReusePublication(db, { login: 'matti', snapshot: structuredClone(snapshot) });
  assert.equal(second.id, first.id);
  assert.equal(second.reused, true);
});

test('a legacy database migrates rows and accepts event content', async () => {
  const before = await databaseCounts(db);
  await applyMigration(db, '0003_publication_resume_and_events.sql');
  const after = await databaseCounts(db);
  assert.deepEqual(after.legacy, before.legacy);
  await saveContentItem(db, eventDocument, { expectedRevision: 0, login: 'matti' });
  assert.equal((await readContentItem(db, 'event', eventDocument.id)).content.type, 'event');
});
```

`fixtures/publication.js` exports a deeply frozen version-2 `eventDocument` and a complete immutable `snapshot` containing level, event, object, and dependency revisions plus their SHA-256 values. Existing D1 helpers create `db` from migrations 0001 and 0002 before the migration test; no global or production database is touched.

- [ ] **Step 2: Verify RED on a real local D1 database**

Run:

```bash
npm run db:migrate:local --workspace @franz-lola/publisher
node --test apps/publisher/test/publication-state.test.js apps/publisher/test/content-store.test.js
```

Expected: FAIL because event violates the old CHECK constraint and publication request keys do not exist.

- [ ] **Step 3: Write the data-preserving SQL migration**

The migration must:

```sql
PRAGMA foreign_keys = OFF;

CREATE TABLE content_items_v2 (
  content_type TEXT NOT NULL CHECK (content_type IN ('character','tileset','block','animation','cutscene','object','event')),
  id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  document_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','publishing','published','deleted')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_revision INTEGER,
  published_commit_sha TEXT,
  published_document_json TEXT,
  publication_id INTEGER,
  deleted_at TEXT,
  PRIMARY KEY (content_type, id)
);
INSERT INTO content_items_v2 SELECT * FROM content_items;
DROP TABLE content_items;
ALTER TABLE content_items_v2 RENAME TO content_items;
CREATE INDEX content_items_updated_at ON content_items (updated_at DESC);
CREATE INDEX content_items_type_status ON content_items (content_type, status, updated_at DESC);

ALTER TABLE publications ADD COLUMN request_key TEXT;
ALTER TABLE publications ADD COLUMN phase TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE publications ADD COLUMN detail TEXT NOT NULL DEFAULT '';
ALTER TABLE publications ADD COLUMN snapshot_json TEXT;
CREATE UNIQUE INDEX publications_request_key ON publications(request_key) WHERE request_key IS NOT NULL;

PRAGMA foreign_keys = ON;
```

Before accepting the migration, run `PRAGMA foreign_key_check` and assert zero rows. Test a populated legacy fixture, not only an empty database.

- [ ] **Step 4: Implement canonical snapshot keys**

Sort document references and recursively stable-stringify the immutable snapshot; hash with SHA-256. The key includes project ID, project revision, each document revision/content checksum, content-model version, and renderer contract. It excludes timestamps, current user, UI selection, and polling state.

- [ ] **Step 5: Store phase transitions transactionally**

Allowed phases are `upload`, `validation`, `merge`, `deploy`, `published`, `failed`. Reject backward transitions except explicit `failed -> validation` retry with the same request key. Store the last human-readable detail and updated timestamp in the same transaction.

- [ ] **Step 6: Verify migration, FK integrity, and idempotency**

Run:

```bash
npm run db:migrate:local --workspace @franz-lola/publisher
npm test --workspace @franz-lola/publisher
npm run deploy --workspace @franz-lola/publisher -- --dry-run --outdir .wrangler-dry-run
```

- [ ] **Step 7: Commit D1 migration and state model**

```bash
git add apps/publisher/migrations apps/publisher/src apps/publisher/test
git diff --cached --check
git commit -m "feat: resume idempotent content publications"
```

### Task 3: Make GitHub PR validation and status mapping monorepo-aware

**Files:**
- Modify: `apps/publisher/src/github.js`
- Modify: `apps/publisher/test/github.test.js`
- Modify: `apps/publisher/src/index.js`
- Modify: `apps/publisher/test/worker.test.js`
- Create: `apps/publisher/test/publication-lifecycle.test.js`
- Create: `apps/publisher/test/fixtures/github-publication.js`
- Create: `apps/publisher/test/fixtures/successful-monorepo-publication.json`

**Interfaces:**
- Consumes: publication request key, canonical files, GitHub App token, monorepo workflow runs.
- Produces: `createPublication`, `publicationStatus`, and structured progress with exact monorepo phases.

- [ ] **Step 1: Write failing lifecycle mapping tests**

```js
import {
  createGithubPublicationFixture,
  replayGithubFixture,
} from './fixtures/github-publication.js';

test('maps monorepo validation, merge, pages build, and deployment to stable progress', async () => {
  const states = await replayGithubFixture('successful-monorepo-publication.json');
  assert.deepEqual(states.map(({ phase, progress }) => [phase, progress]), [
    ['upload', 22], ['validation', 49], ['merge', 64], ['deploy', 89], ['published', 100],
  ]);
});

test('reuses the request branch and PR for the same open publication', async () => {
  const { env, request, github } = createGithubPublicationFixture();
  await createPublication(env, request);
  const second = await createPublication(env, request);
  assert.equal(second.number, 42);
  assert.equal(second.reused, true);
  assert.equal(github.createdPullRequests.length, 1);
});
```

`github-publication.js` loads JSON fixtures relative to `import.meta.url`, injects a fake GitHub transport with deterministic branch/PR/workflow/deployment responses, and exposes every mutation counter. `successful-monorepo-publication.json` contains the exact five backend phase transitions asserted above, keyed by stable workflow/job IDs rather than labels.

- [ ] **Step 2: Verify RED**

Run: `node --test apps/publisher/test/github.test.js apps/publisher/test/publication-lifecycle.test.js`

Expected: FAIL because current step names target the old game-only workflow.

- [ ] **Step 3: Update changed-file and workflow contracts**

Publisher branches may modify only canonical `content/**` JSON paths. Relevant workflow names become `Test Franz and Lola monorepo`, `Validate and publish studio content`, and `Deploy Franz and Lola Pages`. Progress matching uses stable job/step IDs added in Task 7, not translated display labels.

- [ ] **Step 4: Keep GitHub details optional for novice UI**

Return `actionsUrl` and `prUrl` as optional diagnostics, but always return `state`, `phase`, `phaseLabel`, `progress`, `detail`, `checkedAt`, and published `gameUrl`/`studioUrl` on success.

- [ ] **Step 5: Verify worker lifecycle**

Run:

```bash
node --test apps/publisher/test/github.test.js apps/publisher/test/publication-lifecycle.test.js apps/publisher/test/worker.test.js
npm test --workspace @franz-lola/publisher
```

- [ ] **Step 6: Commit monorepo publication status**

```bash
git add apps/publisher/src apps/publisher/test
git diff --cached --check
git commit -m "feat: report monorepo publication progress"
```

### Task 4: Connect guided PublicationSession to resumable publisher progress

**Files:**
- Create: `apps/studio/src/publication/publication-client.js`
- Create: `apps/studio/src/publication/publication-progress.js`
- Create: `apps/studio/test/publication-progress.test.js`
- Modify: `apps/studio/src/publisher-client.js`
- Modify: `apps/studio/src/session/publication-session.svelte.js`
- Modify: `apps/studio/src/components/PublishWorkspace.svelte`
- Modify: `apps/studio/src/components/guide/PublishPreflight.svelte`
- Modify: `apps/studio/e2e/guided-workflow.spec.js`

**Interfaces:**
- Consumes: immutable preflight snapshot and Worker endpoints.
- Produces: stored resumable reference `{ publicationId, requestKey, projectId, projectRevision }` and eight user-facing phases.

- [ ] **Step 1: Write failing reload/resume tests**

```js
test('reload resumes an unfinished publication without submitting again', async () => {
  storage.setItem('franz-lola-publication-v1', JSON.stringify({ publicationId: 42, requestKey: 'abc', projectId: 'hals', projectRevision: 8 }));
  const session = createPublicationSession({ client, storage });
  await session.resume();
  assert.equal(client.publishCalls, 0);
  assert.equal(client.statusCalls, 1);
  assert.equal(session.snapshot().phase, 'validation');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/studio/test/publication-progress.test.js`

Expected: FAIL because resume state does not exist.

- [ ] **Step 3: Map local and server phases into eight stable steps**

```js
export const PUBLICATION_STEPS = Object.freeze([
  'draft-save', 'dependencies', 'playability', 'preview',
  'upload', 'validation', 'deploy', 'published',
]);
```

Local preflight owns the first four. The Worker owns upload onward. Persist only non-secret publication reference data. Clear it after confirmed published/failed acknowledgement, not immediately after navigation.

- [ ] **Step 4: Provide actionable error categories**

Map `content`, `conflict`, `authentication`, `validation`, `deployment`, `offline`, and `owner-action` to exact user actions. Examples: select issue, reload shared version, sign in again, retry checks, open details, wait for connection, or contact owner. Never present an endless spinner without `checkedAt` and elapsed time.

- [ ] **Step 5: Verify real UI polling and reload**

Run:

```bash
node --test apps/studio/test/publication-progress.test.js apps/studio/test/publisher-client.test.js
npm run test:e2e --workspace @franz-lola/studio -- --grep "publish|resume|offline|conflict"
```

E2E closes/reloads the page during validation, resumes publication 42, observes progress through deployment, and confirms no second POST `/api/publish`.

- [ ] **Step 6: Commit resumable publication UI**

```bash
git add apps/studio/src/publication apps/studio/src/publisher-client.js apps/studio/src/session/publication-session.svelte.js apps/studio/src/components apps/studio/test apps/studio/e2e
git diff --cached --check
git commit -m "feat: resume guided publication progress"
```

### Task 5: Assemble one atomic GitHub Pages artifact and build manifest

**Files:**
- Create: `tools/assemble-pages.mjs`
- Create: `tools/generate-build-manifest.mjs`
- Create: `test/pages-artifact.test.js`
- Modify: `apps/game/vite.config.js`
- Modify: `apps/studio/vite.config.js`
- Modify: root `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `apps/game/dist`, `apps/studio/dist`, root content/catalog contract, current Git commit.
- Produces: `dist/pages`, `dist/pages/studio`, and `dist/pages/build-manifest.json`.

- [ ] **Step 1: Write the failing artifact contract test**

```js
test('assembled Pages contains game, studio, and one matching build manifest', async () => {
  const root = new URL('../dist/pages/', import.meta.url);
  await access(new URL('index.html', root));
  await access(new URL('studio/index.html', root));
  const manifest = JSON.parse(await readFile(new URL('build-manifest.json', root), 'utf8'));
  assert.match(manifest.commit, /^[0-9a-f]{40}$/);
  assert.equal(manifest.content.levelFormat, 1);
  assert.equal(manifest.content.contentSchema, 2);
  assert.equal(manifest.apps.game.path, './');
  assert.equal(manifest.apps.studio.path, './studio/');
  assert.equal(manifest.renderer.contract, 'franz-lola-presentation-frame');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/pages-artifact.test.js`

Expected: FAIL because `dist/pages` does not exist.

- [ ] **Step 3: Keep app builds independent**

Game builds to `apps/game/dist`; studio builds to `apps/studio/dist` with base `./`. Neither writes root `dist`. The assembler deletes only the resolved root `dist/pages` after confirming it is inside the worktree, copies game output to root, copies studio output under `studio/`, and rejects filename collisions.

- [ ] **Step 4: Generate the manifest from code constants**

Import content versions and renderer contract from workspace packages. Resolve Git commit with `git rev-parse HEAD`. Include build timestamp, game/studio paths, service-worker versions, and package contract IDs. Do not hardcode the versions in two places.

- [ ] **Step 5: Add root build command**

```json
{
  "build:apps": "npm run build --workspace @franz-lola/game && npm run build --workspace @franz-lola/studio",
  "build:pages": "npm run build --workspace @franz-lola/pixel-renderer && npm run build:apps && node tools/assemble-pages.mjs && node tools/generate-build-manifest.mjs",
  "build": "npm run build:pages"
}
```

- [ ] **Step 6: Verify artifact links and direct navigation**

Run:

```bash
npm run build:pages
node --test test/pages-artifact.test.js
```

Serve `dist/pages` at `/Geburtstagsspiel/`; open game root, `/studio/`, and a deep studio project route. Assert all JS/CSS/font URLs return 200 and no request escapes the repository prefix.

- [ ] **Step 7: Commit Pages assembly**

```bash
git add tools/assemble-pages.mjs tools/generate-build-manifest.mjs test/pages-artifact.test.js apps/game/vite.config.js apps/studio/vite.config.js package.json .gitignore
git diff --cached --check
git commit -m "build: assemble game and studio Pages artifact"
```

### Task 6: Add isolated game and studio service-worker policies

**Files:**
- Modify: `apps/game/scripts/generate-service-worker.mjs`
- Modify: `apps/game/test/service-worker.test.js`
- Create: `apps/studio/scripts/generate-service-worker.mjs`
- Create: `apps/studio/src/platform/register-studio-service-worker.js`
- Create: `apps/studio/test/service-worker.test.js`
- Create: `apps/studio/src/components/UpdateBanner.svelte`
- Modify: `apps/studio/src/App.svelte`
- Modify: `tools/assemble-pages.mjs`
- Modify: `test/pages-artifact.test.js`

**Interfaces:**
- Consumes: assembled versioned asset manifests and studio unsaved-change state.
- Produces: root game SW that bypasses `/studio/`, scoped studio SW, and explicit safe-update UI.

- [ ] **Step 1: Write failing cache-boundary tests**

```js
test('game service worker never handles studio requests', async () => {
  const result = await dispatchFetch(gameWorker, 'https://example.test/Geburtstagsspiel/studio/assets/app.js');
  assert.equal(result.respondWithCalled, false);
});

test('studio service worker bypasses auth api and publication status', async () => {
  for (const url of [
    'https://franz-lola-publisher.example/auth/login',
    'https://franz-lola-publisher.example/api/me',
    'https://franz-lola-publisher.example/api/publications/42',
  ]) {
    const result = await dispatchFetch(studioWorker, url);
    assert.equal(result.respondWithCalled, false);
  }
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/game/test/service-worker.test.js apps/studio/test/service-worker.test.js`

Expected: game currently scopes the repository root without a studio bypass; studio worker does not exist.

- [ ] **Step 3: Harden game bypass**

Before its exact asset allowlist, return without `respondWith` for paths under `/Geburtstagsspiel/studio/`, navigation/document requests outside game, publisher origins, and all unknown assets. Keep LocalStorage untouched.

- [ ] **Step 4: Generate a studio-only exact asset allowlist**

Place studio worker at `dist/pages/studio/sw.js` and register with scope `./`. Cache only hashed studio JS/CSS/fonts/images and a versioned offline shell. Do not cache OAuth/API/D1/content manifests. Install fails atomically if precache fails; activation deletes only caches with prefix `franz-lola-studio-`.

- [ ] **Step 5: Gate updates on unsaved work**

Registration reports `update-available`. If project is clean, show `Neue Version laden`; if dirty, show `Erst sichern, dann aktualisieren`. `skipWaiting` is sent only after the user action and a successful local save. Controller change reloads exactly once.

- [ ] **Step 6: Run service-worker browser tests**

Run:

```bash
npm run build:pages
node --test apps/game/test/service-worker.test.js apps/studio/test/service-worker.test.js test/pages-artifact.test.js
npm run test:e2e --workspace @franz-lola/studio -- --grep "offline|update"
```

Test first load, controlled reload, offline studio shell, local project editing offline, forbidden offline publish, update with clean project, update with dirty project, and game/studio cache isolation.

- [ ] **Step 7: Commit service-worker isolation**

```bash
git add apps/game/scripts apps/game/test apps/studio/scripts apps/studio/src/platform apps/studio/src/components/UpdateBanner.svelte apps/studio/src/App.svelte apps/studio/test tools/assemble-pages.mjs test/pages-artifact.test.js
git diff --cached --check
git commit -m "feat: isolate game and studio offline caches"
```

### Task 7: Replace separate Actions with monorepo CI, publisher deploy, content publish, and Pages deploy

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`
- Create or replace: `.github/workflows/deploy-publisher.yml`
- Modify: `.github/workflows/publish-content.yml`
- Modify: `apps/game/scripts/validate-publish-pr.mjs`
- Modify: `apps/publisher/src/github.js`
- Create: `test/workflow-contract.test.js`

**Interfaces:**
- Consumes: root scripts, canonical content paths, existing GitHub repository variables/secrets.
- Produces: stable job IDs `workspace-test`, `pages-build`, `content-validation`, `content-merge`, `pages-deploy`, and `publisher-deploy` consumed by progress mapping.

- [ ] **Step 1: Write failing workflow source tests**

```js
test('content publication can modify only canonical content paths and runs the root gate', async () => {
  const workflow = await readFile(new URL('../.github/workflows/publish-content.yml', import.meta.url), 'utf8');
  assert.match(workflow, /content\/\*\*\/\*\.json/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /npm run verify:content/);
  assert.doesNotMatch(workflow, /src\/data/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/workflow-contract.test.js`

Expected: FAIL because workflows still refer to old repositories/paths and separate locks.

- [ ] **Step 3: Define root CI and content verification commands**

`verify` runs all package/unit/build/browser gates. `verify:content` validates changed paths, content schema/dependencies, affected level full simulations, renderer Golden Scenes, game build, studio build, and publisher tests. It may skip unrelated visual authoring journeys but may not skip affected level playthrough.

- [ ] **Step 4: Build and deploy one Pages artifact**

On `main` push/manual dispatch, install once, test once, run `npm run build:pages`, upload `dist/pages`, and deploy. Use concurrency `franz-lola-pages`. The content workflow manually dispatches deploy after its bot-token merge so GitHub token recursion rules cannot suppress publication.

- [ ] **Step 5: Deploy publisher from `apps/publisher`**

Path filters include `apps/publisher/**`, `packages/content-model/**`, root lock/manifest, and the workflow. Run root `npm ci --ignore-scripts`, publisher tests, root audit, remote D1 migrations, then Wrangler deploy from workspace. Keep existing Cloudflare secrets and `PUBLISHER_DEPLOY_ENABLED` gate.

- [ ] **Step 6: Harden publication identity**

The trusted base-branch guard verifies GitHub App bot login, `publisher/` head, exact canonical JSON path allowlist, no workflow/script/package changes, expected base SHA, and max 20 documents. Only then check out proposed content.

- [ ] **Step 7: Verify workflow contracts and local equivalents**

Run:

```bash
node --test test/workflow-contract.test.js apps/game/test/publish-guard.test.js
npm run verify:content
npm run deploy --workspace @franz-lola/publisher -- --dry-run --outdir .wrangler-dry-run
npm run build:pages
```

- [ ] **Step 8: Commit workflows**

```bash
git add .github/workflows apps/game/scripts apps/publisher/src/github.js test/workflow-contract.test.js package.json
git diff --cached --check
git commit -m "ci: publish game studio and content atomically"
```

### Task 8: Rehearse local drafts, D1 data, OAuth return paths, and live content migration

**Files:**
- Create: `tools/rehearse-production-migration.mjs`
- Create: `test/production-migration.test.js`
- Create: `test/fixtures/production-migration/legacy-export.json`
- Create: `test/fixtures/production-migration/legacy-localstorage.json`
- Create: `docs/migration/cutover-report.template.json`
- Modify: `apps/publisher/src/security.js`
- Modify: `apps/publisher/test/security.test.js`
- Modify: `apps/publisher/wrangler.jsonc`
- Modify: `apps/publisher/README.md`

**Interfaces:**
- Consumes: legacy/new studio prefixes, D1 export fixture, content checksums, LocalStorage fixture, Worker config.
- Produces: machine-readable cutover report and temporary dual-prefix OAuth support.

- [ ] **Step 1: Write failing dual-prefix and rehearsal tests**

```js
test('OAuth accepts only the legacy or new editor path during cutover', () => {
  const env = { EDITOR_ORIGIN: 'https://matthaeusstumptner.github.io', EDITOR_PATH_PREFIX: '/Geburtstagsspiel/studio/', EDITOR_LEGACY_PATH_PREFIX: '/Pacman_clone_level_editor/' };
  assert.ok(safeReturnUrl('https://matthaeusstumptner.github.io/Geburtstagsspiel/studio/project/hals/level', env));
  assert.ok(safeReturnUrl('https://matthaeusstumptner.github.io/Pacman_clone_level_editor/', env));
  assert.equal(safeReturnUrl('https://matthaeusstumptner.github.io/evil/', env), null);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test apps/publisher/test/security.test.js test/production-migration.test.js`

Expected: FAIL because only one prefix is supported and rehearsal tool does not exist.

- [ ] **Step 3: Add temporary legacy return support**

`safeReturnUrl` accepts new prefix plus optional exact `EDITOR_LEGACY_PATH_PREFIX`. It still enforces HTTPS, exact origin, no credentials, no encoded path traversal, and maximum URL length. CORS remains origin-based and API authorization remains bearer/session based.

- [ ] **Step 4: Build a read-only rehearsal tool**

The tool reads D1 export JSON/SQL fixture, canonical content hashes, legacy LocalStorage fixtures, source manifest, and Worker config. It writes only a report and returns nonzero for row-count loss, invalid JSON, unresolved dependency, unsupported callback, content hash mismatch, duplicate publication key, or missing build manifest. The two committed synthetic fixtures contain no real login/session values and cover one v2 legacy draft, one published level, one reusable object, one publication, and one intentionally invalid orphan used only by the RED test.

- [ ] **Step 5: Rehearse with production-shaped data**

Export production D1 through the approved Wrangler read/export path without deleting or mutating remote data. Store the export outside Git and redact user/session data before creating a local fixture. Run all migrations locally, foreign-key check, draft/content/publication counts, published revision checksums, and bootstrap against canonical content.

- [ ] **Step 6: Verify rehearsal and worker dry run**

Run:

```bash
node tools/rehearse-production-migration.mjs --input output/redacted-production-fixture.json --output output/cutover-rehearsal.json
node --test test/production-migration.test.js apps/publisher/test/security.test.js
npm run deploy --workspace @franz-lola/publisher -- --dry-run --outdir .wrangler-dry-run
```

Expected report: zero lost rows, zero FK violations, nine canonical levels, every published revision mapped, both allowed return paths valid, and all secrets reported only as present/missing booleans.

- [ ] **Step 7: Commit rehearsal tooling and dual-prefix config**

```bash
git add tools/rehearse-production-migration.mjs test/production-migration.test.js test/fixtures/production-migration docs/migration/cutover-report.template.json apps/publisher/src/security.js apps/publisher/test/security.test.js apps/publisher/wrangler.jsonc apps/publisher/README.md
git diff --cached --check
git commit -m "test: rehearse studio publisher cutover"
```

### Task 9: Run a production-like release candidate and final acceptance matrix

**Files:**
- Create: `apps/studio/e2e/publication-live-contract.spec.js`
- Create: `test/release-candidate.test.js`
- Create: `test/helpers/release-candidate.js`
- Create: `tools/verify-release.mjs`
- Modify: root `package.json`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: design/operations documentation only with measured evidence

**Interfaces:**
- Consumes: full monorepo, dry-run Worker, Pages artifact, redacted migration fixture.
- Produces: `npm run verify:release` and complete screenshots/videos/reports before external mutation.

- [ ] **Step 1: Write the release-candidate contract**

```js
import {
  readAppDiagnostics,
  readBuildManifest,
} from './helpers/release-candidate.js';

test('release candidate uses one commit and compatible contracts everywhere', async () => {
  const manifest = await readBuildManifest();
  const game = await readAppDiagnostics('game');
  const studio = await readAppDiagnostics('studio');
  assert.equal(game.commit, manifest.commit);
  assert.equal(studio.commit, manifest.commit);
  assert.equal(game.rendererContract, studio.rendererContract);
  assert.equal(studio.contentSchema, manifest.content.contentSchema);
});
```

`readBuildManifest()` reads only `dist/build-manifest.json`; `readAppDiagnostics(app)` accepts only `game|studio` and maps `game` to `dist/game/diagnostics.json` and `studio` to `dist/studio/diagnostics.json`. Both parse through content-model-compatible schemas and fail closed on missing/non-string commit or contract fields.

- [ ] **Step 2: Verify RED before wiring diagnostics**

Run: `node --test test/release-candidate.test.js`

Expected: FAIL until both app diagnostics expose build-manifest values.

- [ ] **Step 3: Add release verification command**

```json
{
  "verify:release": "node tools/verify-release.mjs"
}
```

`tools/verify-release.mjs` runs this exact ordered, fail-fast command table with `shell: false`, inherited stdio, and the repository root as `cwd`: `npm ci --ignore-scripts`; `npm run verify`; `npm run build:pages`; `npm run deploy --workspace @franz-lola/publisher -- --dry-run --outdir .wrangler-dry-run`; and `node tools/rehearse-production-migration.mjs --input output/redacted-production-fixture.json --output output/cutover-rehearsal.json`. Resolve `npm.cmd` on Windows and `npm` elsewhere. Throw on spawn errors or nonzero status and never continue to the next command.

- [ ] **Step 4: Run browser acceptance from assembled Pages**

Cover fresh game, saved game, map, active/pause, radar, studio dashboard, guide/expert switch, editor reload, offline edit, online D1 sync against test Worker, GitHub OAuth mock, publication reload/resume, desktop/mobile playtest, and direct `/Geburtstagsspiel/studio/project/hals-neu/level` navigation. Capture five PNGs and one WebM per major scenario.

- [ ] **Step 5: Inspect visual evidence**

Inspect game mobile portrait/landscape, radar at 60/120/175 Hz, studio dashboard, level tooling, sprite timeline, event/cutscene, playtest, publisher progress, offline/update banner, and Reduced Motion. Record no blank frames, stale preview, HUD/canvas overlap, clipped primary action, radar drift, cache leakage, or publication spinner stall.

- [ ] **Step 6: Run final candidate twice**

Run:

```bash
npm run verify:release
npm run verify:release
git diff --check
git status -sb
```

Expected: two green runs on distinct ephemeral ports; exact row/hash/contract evidence; no external production change.

- [ ] **Step 7: Commit release gates and verified documentation**

```bash
git add apps/studio/e2e/publication-live-contract.spec.js test/release-candidate.test.js test/helpers/release-candidate.js tools/verify-release.mjs package.json README.md ARCHITECTURE.md docs
git diff --cached --check
git commit -m "test: prove monorepo release candidate"
```

### Task 10: Perform the controlled live cutover and retire old source repositories

**Files:**
- Modify in monorepo only if final evidence requires: `apps/publisher/wrangler.jsonc`
- Create in old editor repository: minimal redirect `index.html`
- Create: final `docs/migration/2026-08-11-cutover-report.md`
- External state: Cloudflare Worker, D1 migration, GitHub Pages, GitHub App homepage, old repository Pages/archive settings

**Interfaces:**
- Consumes: two green release-candidate runs and explicit user approval for external cutover/archive actions.
- Produces: live game root, live `/studio/`, working publisher, redirect from old editor URL, and archived old source repositories.

- [ ] **Step 1: Stop and obtain explicit final cutover approval**

Present exact candidate commit, complete gate results, migration row counts/hashes, Worker dry-run, screenshots/videos, rollback commit, and the external actions below. Do not deploy, migrate remote D1, redirect, or archive until the user confirms this evidence.

- [ ] **Step 2: Deploy backward-compatible Worker first**

Apply remote D1 migration 0003, run `/health`, verify old and new OAuth return paths, verify D1 counts/FK check through read-only diagnostics, and deploy Worker with:

```text
EDITOR_ORIGIN=https://matthaeusstumptner.github.io
EDITOR_PATH_PREFIX=/Geburtstagsspiel/studio/
EDITOR_LEGACY_PATH_PREFIX=/Pacman_clone_level_editor/
GAME_URL=https://matthaeusstumptner.github.io/Geburtstagsspiel/
```

Do not change or re-enter existing secrets unless `/health` reports a missing binding.

- [ ] **Step 3: Merge and deploy the monorepo Pages candidate**

Merge the reviewed monorepo PR, wait for root CI, build, and Pages deploy. Verify live `build-manifest.json` commit equals merged commit. Test game save restore, studio direct route, GitHub login, local/cloud drafts, testplay, and a non-publishing preflight.

- [ ] **Step 4: Publish one reversible smoke-test content change**

Through the live studio, create a harmless text-only test revision of a designated test draft, publish it, observe all eight phases, confirm the canonical content PR merged, Pages manifest advanced, game shows the revision, and D1 marks the exact snapshot published. Then publish the original text back through the same workflow so history proves rollback.

- [ ] **Step 5: Deploy the old editor redirect**

The old Pages site contains only:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0;url=https://matthaeusstumptner.github.io/Geburtstagsspiel/studio/">
    <link rel="canonical" href="https://matthaeusstumptner.github.io/Geburtstagsspiel/studio/">
    <title>Franz & Lola Studio ist umgezogen</title>
  </head>
  <body><p>Die Levelwerkstatt ist <a href="https://matthaeusstumptner.github.io/Geburtstagsspiel/studio/">hier erreichbar</a>.</p></body>
</html>
```

Verify both automatic and keyboard-link navigation. Keep the legacy OAuth prefix for at least one release cycle.

- [ ] **Step 6: Complete a 24-hour observation window**

Monitor Worker errors, D1 conflicts, publication failures, Pages deployment, game/studio console errors, service-worker update behavior, and live build-manifest consistency. Unchanged healthy state is expected; any content loss, OAuth failure, or cache mismatch triggers rollback to the previous Pages artifact/Worker version while preserving D1.

- [ ] **Step 7: Obtain archive confirmation and archive old source repositories**

After the observation window, show final evidence and ask again before archiving `Pacman_clone_renderer` and `Pacman_clone_level_editor`. Add their final source commits to the cutover report. Archive through GitHub settings/API; do not delete repositories, releases, issues, or Pages redirect history.

- [ ] **Step 8: Remove legacy OAuth prefix in a later reviewed deployment**

After old links and redirect traffic are confirmed stable, remove `EDITOR_LEGACY_PATH_PREFIX`, rerun publisher security/worker tests and Worker dry-run, deploy, and verify new OAuth login. This is a separate small PR/commit, not an unreviewed dashboard edit.

- [ ] **Step 9: Commit the final cutover report**

```bash
git add docs/migration/2026-08-11-cutover-report.md
git diff --cached --check
git commit -m "docs: record Franz and Lola studio cutover"
```

## Final Completion Gate

The product is complete only when:

```text
one canonical source repository
one root lockfile
one local renderer contract
one local game-core simulation
game and studio share the live build commit
radar and studio consume PresentationFrame
guided project reaches revision-bound 100 percent
publisher resumes after reload and publishes canonical content
game/studio service-worker caches remain isolated
existing local and D1 drafts are preserved
old editor URL redirects
old source repositories are archived only after explicit approval
```

Run the post-cutover evidence gate one last time against the merged source:

```bash
npm ci --ignore-scripts
npm run verify:release
git diff --check main...HEAD
git status -sb
```
