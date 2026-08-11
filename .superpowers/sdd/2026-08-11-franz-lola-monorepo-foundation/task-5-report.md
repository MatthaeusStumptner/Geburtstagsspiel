# Task 5 Report — Shared content model and schema v2

## Status

Implemented on `codex/franz-lola-monorepo` from base `b68e56eca139280f5f61a4cb5e1af69bdcadd6ee`.

Task 5 now has one owning package, `@franz-lola/content-model`, for level/content normalization, validation, JSON schemas, schema migration, publication paths, and project dependency closure. Renderer, game, studio, and publisher declare and use the content-model boundary directly. No authored content values were moved or changed.

## Contract delivered

- Added the private workspace package `@franz-lola/content-model@0.0.0-monorepo` with root and schema exports.
- Moved the level/content parser implementations, both JSON schemas, and their parser/schema tests out of pixel-renderer.
- Exported:
  - `MIN_CONTENT_SCHEMA_VERSION = 1`
  - `CONTENT_SCHEMA_VERSION = 2`
  - the exact reusable `CONTENT_TYPES` list ending in `event`
  - migration, parsing, validation, publication-path, level-format, and dependency-closure APIs required by the brief.
- Preserved legacy level-wrapper compatibility even though `level` is intentionally not part of the exact reusable `CONTENT_TYPES` constant: existing `type: 'level'` documents, validation, creation, and publication-path behavior remain supported through the internal supported-type set and schema discriminator.
- Added reusable event normalization through the existing level-event normalizer and the strict path `src/data/library/events/<id>.event.json`.
- Added schema-v2 `references` with an event-aware type discriminator while retaining legacy `dependencies`.
- `migrateContentDocument`:
  - accepts only non-array objects with integer versions 1–2;
  - clones every accepted input;
  - upgrades v1 to v2 and adds explicit empty `references` when absent;
  - clones v2 without changing values;
  - fails closed with a version-specific error for missing, fractional, string, old, or future versions.
- `validateContentDocument` accepts current v1 documents through immutable migration and returns a canonical v2 value. `parseContentDocument` explicitly migrates before current-schema validation.
- `resolveProjectDependencies` indexes by `type:id`, sorts roots and adjacency lists with locale-independent code-unit ordering, deduplicates nodes, emits dependencies before dependents, preserves/report missing edges with their owner, and emits explicit deterministic cycle paths.
- Pixel-renderer re-exports its former public model APIs for compatibility but owns no duplicate parser/validator implementation. Its effect/profile normalization dependencies now originate in content-model.
- Publisher no longer depends on pixel-renderer. Game and studio keep renderer dependencies for rendering/simulation and use content-model directly for model APIs.
- The root lock contains one local content-model workspace link and one root `package-lock.json`.

## TDD evidence

RED was captured before any production package/module existed:

```text
node --test packages/content-model/test/project-dependencies.test.js packages/content-model/test/schema-migration.test.js
ERR_MODULE_NOT_FOUND: packages/content-model/src/project-dependencies.js
ERR_MODULE_NOT_FOUND: packages/content-model/src/index.js
tests 2, pass 0, fail 2
```

Focused GREEN after the minimal implementation:

```text
node --test packages/content-model/test/project-dependencies.test.js packages/content-model/test/schema-migration.test.js
tests 9, pass 9, fail 0
```

An integration RED then exposed the publisher fixture’s missing new `event` sample. Adding only that canonical sample made the publisher suite GREEN at 18/18.

Mutation/self-review coverage:

- wrong min/current version, mutating legacy input, omitting v1 `references`, accepting a future version, or changing the event path/type causes migration/schema tests to fail;
- removing dependency ordering, adjacency sorting, missing-edge reporting, deduplication, or cycle paths causes closure tests to fail;
- redirecting consumers through renderer or dropping a direct dependency causes root topology tests or production builds to fail.

## Verification

Commands run successfully:

```text
npm install --ignore-scripts
node --test packages/content-model/test/schema-migration.test.js packages/content-model/test/project-dependencies.test.js
npm test --workspace @franz-lola/content-model       # 32/32
npm test --workspace @franz-lola/pixel-renderer      # 84/84
npm test --workspace @franz-lola/game                # 100/100
npm test --workspace @franz-lola/studio              # 88/88
npm test --workspace @franz-lola/publisher           # 18/18
npm run test:structure                                # 5/5
npm run build --workspace @franz-lola/pixel-renderer
npm run build --workspace @franz-lola/game
npm run build --workspace @franz-lola/studio
npm ls @franz-lola/content-model @franz-lola/pixel-renderer --workspaces
git diff --check
```

The final package topology reported by the root contract is:

```text
@franz-lola/content-model
@franz-lola/game
@franz-lola/pixel-renderer
@franz-lola/publisher
@franz-lola/studio
```

## Scope audit

- No files under authored game/studio content data were changed.
- No D1, GitHub, deployment, archive, or remote mutation was performed.
- No UI, simulation, or rendering behavior was redesigned.
- Publisher dependency pins and root overrides remain unchanged.
- Schema/format ownership moved; Task 6’s authored catalog movement remains untouched.

## ACL fallback note

The required first `apply_patch` modification succeeded for new RED tests. The next patch, which needed to read existing files in the linked worktree, failed with the known Windows sandbox error `helper_unknown_error: apply deny-read ACLs`; invoking the local patch wrapper also returned `Zugriff verweigert`.

After those failures, only the brief-authorized fallback was used: every source/destination was resolved to an absolute path, checked to remain under the exact Task 5 worktree, and checked for expected existence; moves used exact `git mv` targets, and subsequent edits used exact-once guarded string replacement or an `apply_patch`-created `.next` file copied over the exact guarded target. No wildcard, recursive, broad-root, or unrelated-path write was used. Temporary `.next` files were removed immediately after their guarded replacement.

## Concerns

No blocking concerns. The deliberate compatibility nuance is that public `CONTENT_TYPES` now follows the brief’s exact reusable-only list and therefore excludes `level`, while legacy level content wrappers remain accepted and mapped so current documents do not regress.
