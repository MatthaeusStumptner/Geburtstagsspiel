import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { checkPackageBoundaries } from '../tools/check-package-boundaries.mjs';

async function withWorkspace(files, run) {
  const root = await mkdtemp(path.join(tmpdir(), 'franz-lola-boundaries-'));
  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const file = path.join(root, relativePath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, source);
    }
    await run(pathToFileURL(`${root}${path.sep}`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('applications do not import another application source tree', async () => {
  const violations = await checkPackageBoundaries(new URL('../', import.meta.url));
  assert.deepEqual(violations, []);
});

test('scanner resolves static, export-from, and dynamic relative app imports', async () => {
  await withWorkspace({
    'apps/game/src/static.js': "import value from '../../studio/src/value.js';\n",
    'apps/game/src/exported.svelte': "<script>export { value } from '../../publisher/src/value.js';</script>\n",
    'apps/game/src/dynamic.js': "const module = import('../../studio/src/lazy.js');\n",
    'apps/game/src/test/fixtures.js': "export { value } from '../../../publisher/src/value.js';\n",
  }, async (rootUrl) => {
    assert.deepEqual(await checkPackageBoundaries(rootUrl), [
      'apps/game/src/dynamic.js: imports another application source tree: apps/studio/src/lazy.js',
      'apps/game/src/exported.svelte: imports another application source tree: apps/publisher/src/value.js',
      'apps/game/src/static.js: imports another application source tree: apps/studio/src/value.js',
      'apps/game/src/test/fixtures.js: imports another application source tree: apps/publisher/src/value.js',
    ]);
  });
});

test('scanner requires workspace packages to use the @franz-lola scope', async () => {
  await withWorkspace({
    'apps/game/src/bad.js': "import '../../../packages/game-core/src/index.js';\n",
    'apps/game/src/good.js': "import { createGameSession } from '@franz-lola/game-core';\nimport { mount } from 'svelte';\n",
  }, async (rootUrl) => {
    assert.deepEqual(await checkPackageBoundaries(rootUrl), [
      'apps/game/src/bad.js: imports shared source without @franz-lola/*: packages/game-core/src/index.js',
    ]);
  });
});

test('scanner rejects another application package and ignores import-like comments', async () => {
  await withWorkspace({
    'apps/studio/package.json': '{"name":"@franz-lola/studio"}\n',
    'apps/game/src/commented.js': "// import '../../studio/src/commented.js';\nconst text = \"import('../../studio/src/string.js')\";\n",
    'apps/game/src/package.svelte': "<script>\n  const studio = import(\n    '@franz-lola/studio'\n  );\n</script>\n",
  }, async (rootUrl) => {
    assert.deepEqual(await checkPackageBoundaries(rootUrl), [
      'apps/game/src/package.svelte: imports another application package: @franz-lola/studio',
    ]);
  });
});