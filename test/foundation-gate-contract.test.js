import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const rootUrl = new URL('../', import.meta.url);

function workflowTopology(source) {
  const workflow = parseYaml(source);
  assert.ok(workflow && typeof workflow === 'object', 'CI workflow must parse as a mapping');
  assert.ok(workflow.jobs && typeof workflow.jobs === 'object', 'CI workflow must define jobs');
  const jobs = Object.values(workflow.jobs);
  const steps = jobs.flatMap((job) => Array.isArray(job?.steps) ? job.steps : []);
  return { workflow, jobs, steps };
}

function workflowSteps(source) {
  return workflowTopology(source).steps;
}

test('root verify command executes every planned package, build, benchmark, and browser boundary', async () => {
  const root = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.fromEntries([
    'test:structure', 'test:packages', 'test:presentation-parity', 'test', 'build', 'test:browser', 'verify:foundation', 'verify',
  ].map((name) => [name, root.scripts[name]])), {
    'test:structure': 'node --test test/*.test.js',
    'test:packages': 'npm run test --workspaces --if-present',
    'test:presentation-parity': 'node --test packages/testkit/test/presentation-parity.test.js',
    test: 'npm run test:structure && npm run test:packages',
    build: 'npm run build --workspace @franz-lola/pixel-renderer && npm run build --workspace @franz-lola/game && npm run build --workspace @franz-lola/studio',
    'test:browser': 'npm run test:browser --workspace @franz-lola/pixel-renderer && npm run test:browser --workspace @franz-lola/game && npm run test:e2e --workspace @franz-lola/studio && npm run test:visual --workspace @franz-lola/studio && npm run test:rendering --workspace @franz-lola/studio',
    'verify:foundation': 'npm test && npm run build && npm run benchmark:assert --workspace @franz-lola/pixel-renderer && npm run test:browser',
    verify: 'npm run verify:foundation',
  });

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'franz-lola-foundation-gate-'));
  try {
    const scripts = Object.fromEntries(Object.entries(root.scripts).filter(([name]) => [
      'test:structure', 'test:packages', 'test', 'build', 'test:browser', 'verify:foundation', 'verify',
    ].includes(name)));
    await writeFile(path.join(temporaryRoot, 'package.json'), JSON.stringify({
      private: true,
      type: 'module',
      workspaces: ['apps/*', 'packages/*'],
      scripts,
    }));
    await writeFile(path.join(temporaryRoot, 'record.mjs'), "import { appendFileSync } from 'node:fs';\nappendFileSync(new URL('./trace.log', import.meta.url), `${process.argv[2]}\\n`);\n");
    await mkdir(path.join(temporaryRoot, 'test'));
    await writeFile(path.join(temporaryRoot, 'test', 'structure.test.js'), "import { appendFileSync } from 'node:fs';\nimport test from 'node:test';\ntest('structure', () => appendFileSync(new URL('../trace.log', import.meta.url), 'structure\\n'));\n");

    const workspaces = [
      ['apps/game', '@franz-lola/game', ['test', 'build', 'test:browser']],
      ['apps/publisher', '@franz-lola/publisher', ['test']],
      ['apps/studio', '@franz-lola/studio', ['test', 'build', 'test:e2e', 'test:visual', 'test:rendering']],
      ['packages/content-model', '@franz-lola/content-model', ['test']],
      ['packages/game-core', '@franz-lola/game-core', ['test']],
      ['packages/pixel-renderer', '@franz-lola/pixel-renderer', ['test', 'build', 'benchmark:assert', 'test:browser']],
      ['packages/testkit', '@franz-lola/render-testkit', ['test']],
    ];
    for (const [directory, name, names] of workspaces) {
      const workspace = path.join(temporaryRoot, directory);
      await mkdir(workspace, { recursive: true });
      await writeFile(path.join(workspace, 'package.json'), JSON.stringify({
        name,
        version: '0.0.0-monorepo',
        scripts: Object.fromEntries(names.map((script) => [script, `node ../../record.mjs ${script}:${name}`])),
      }));
    }

    const command = process.platform === 'win32' ? process.env.ComSpec : 'npm';
    const arguments_ = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run verify'] : ['run', 'verify'];
    const result = spawnSync(command, arguments_, {
      cwd: temporaryRoot,
      encoding: 'utf8',
      timeout: 60_000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const trace = (await readFile(path.join(temporaryRoot, 'trace.log'), 'utf8')).trim().split(/\r?\n/);
    assert.deepEqual(trace.slice(-9), [
      'build:@franz-lola/pixel-renderer',
      'build:@franz-lola/game',
      'build:@franz-lola/studio',
      'benchmark:assert:@franz-lola/pixel-renderer',
      'test:browser:@franz-lola/pixel-renderer',
      'test:browser:@franz-lola/game',
      'test:e2e:@franz-lola/studio',
      'test:visual:@franz-lola/studio',
      'test:rendering:@franz-lola/studio',
    ]);
    assert.equal(trace.length, 16, JSON.stringify(trace));
    assert.deepEqual(new Set(trace.filter((entry) => entry.startsWith('test:@'))), new Set(workspaces.map(([, name]) => `test:${name}`)));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('CI runs the root gate once and retains each browser surface on failure', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assertCriticalCiTopology(workflow);
  const steps = workflowSteps(workflow);
  assert.equal(steps.filter(({ uses }) => uses?.startsWith('actions/checkout@')).length, 1);
  const nodeSteps = steps.filter(({ uses }) => uses?.startsWith('actions/setup-node@'));
  assert.equal(nodeSteps.length, 1);
  assert.equal(nodeSteps[0].with['node-version'], 22);
  assert.equal(nodeSteps[0].with.cache, 'npm');
  assert.equal(nodeSteps[0].with['cache-dependency-path'], 'package-lock.json');
  assert.deepEqual(steps.filter(({ run }) => run === 'npm ci --ignore-scripts').map(({ run }) => run), ['npm ci --ignore-scripts']);
  assert.deepEqual(steps.filter(({ run }) => run?.includes('playwright install')).map(({ run }) => run), ['npx playwright install --with-deps chromium']);
  assert.deepEqual(steps.filter(({ run }) => run === 'npm run verify').map(({ run }) => run), ['npm run verify']);
  assert.equal(steps.some(({ ['working-directory']: directory }) => directory), false);

  const artifacts = steps.filter(({ uses }) => uses?.startsWith('actions/upload-artifact@'));
  assert.equal(artifacts.length, 3);
  assert.deepEqual(artifacts.map(({ if: condition }) => condition), ['always()', 'always()', 'always()']);
  assert.deepEqual(artifacts.map(({ with: inputs }) => [inputs.name, String(inputs.path).trim().split(/\r?\n/)]), [
    ['renderer-browser-artifacts', ['packages/pixel-renderer/output/playwright/renderer']],
    ['game-browser-artifacts', ['apps/game/output/playwright/game']],
    ['studio-browser-artifacts', ['apps/studio/test-results', 'apps/studio/output/playwright']],
  ]);
  assert.deepEqual(artifacts.map(({ with: inputs }) => inputs['if-no-files-found']), ['error', 'error', 'error']);
});

function assertCriticalCiTopology(source) {
  const { workflow, jobs, steps } = workflowTopology(source);
  assert.equal(steps.filter(({ uses }) => uses?.startsWith('actions/checkout@')).length, 1);
  const occurrences = (pattern) => steps.reduce((count, { run }) => (
    count + [...String(run ?? '').matchAll(pattern)].length
  ), 0);
  assert.equal(occurrences(/\bnpm\s+ci\b/g), 1);
  assert.equal(occurrences(/\b(?:npx\s+)?playwright\s+install\b/g), 1);
  assert.equal(occurrences(/\bnpm\s+run\s+verify(?=\s|$|[;&|])/g), 1);
  assert.equal(steps.filter(({ run }) => String(run ?? '').trim() === 'npm ci --ignore-scripts').length, 1);
  assert.equal(steps.filter(({ run }) => String(run ?? '').trim() === 'npx playwright install --with-deps chromium').length, 1);
  assert.equal(steps.filter(({ run }) => String(run ?? '').trim() === 'npm run verify').length, 1);
  assert.equal(Boolean(workflow.defaults?.run?.['working-directory']), false);
  assert.equal(jobs.some((job) => job?.defaults?.run?.['working-directory']), false);
  assert.equal(steps.some(({ ['working-directory']: directory }) => directory), false);
}

function withAdditionalJob(source, body) {
  return `${source}\n  adversarial:\n    runs-on: ubuntu-latest\n${body}\n`;
}

test('CI contract traverses every job when counting critical steps', async (context) => {
  const source = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const duplicates = [
    ['checkout', '      - uses: actions/checkout@v4'],
    ['locked install', '      - run: npm ci --ignore-scripts'],
    ['Chromium install', '      - run: npx playwright install --with-deps chromium'],
    ['root verify', '      - run: npm run verify'],
  ];
  for (const [name, step] of duplicates) {
    await context.test(name, () => {
      const mutated = withAdditionalJob(source, `    steps:\n${step}`);
      assert.throws(() => assertCriticalCiTopology(mutated));
    });
  }
});

test('CI contract rejects working-directory defaults and step overrides in any job', async (context) => {
  const source = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const jobs = [
    ['job default', '    defaults:\n      run:\n        working-directory: apps/game\n    steps:\n      - run: echo hidden'],
    ['step override', '    steps:\n      - run: echo hidden\n        working-directory: apps/studio'],
  ];
  for (const [name, body] of jobs) {
    await context.test(name, () => {
      assert.throws(() => assertCriticalCiTopology(withAdditionalJob(source, body)));
    });
  }
});

test('CI contract rejects a nested install hidden in a shell command', async () => {
  const source = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const mutated = withAdditionalJob(source, '    steps:\n      - run: cd apps/game && npm ci --ignore-scripts');
  assert.throws(() => assertCriticalCiTopology(mutated));
});
test('Pages deploy uploads the game workspace build and content publishing still dispatches it', async () => {
  const [deploySource, publishSource, rootPackage, gamePackage, studioReadme, publisherReadme] = await Promise.all([
    readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/publish-content.yml', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../apps/game/package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../apps/studio/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../apps/publisher/README.md', import.meta.url), 'utf8'),
  ]);
  const { workflow: deployWorkflow, steps: deploySteps } = workflowTopology(deploySource);
  const buildEnvironment = deployWorkflow.jobs.build.env;
  const build = deploySteps.filter(({ run }) => run === 'npm run build');
  const upload = deploySteps.filter(({ uses }) => uses?.startsWith('actions/upload-pages-artifact@'));
  assert.equal(build.length, 1, 'deploy must run the root build once');
  assert.equal(upload.length, 1, 'deploy must upload one Pages artifact');
  assert.match(rootPackage.scripts.build, /npm run build --workspace @franz-lola\/game(?:\s|$)/);
  assert.match(rootPackage.scripts.build, /npm run build --workspace @franz-lola\/studio(?:\s|$)/);
  assert.match(gamePackage.scripts.build, /(?:^|&&\s*)vite build(?:\s|&&|$)/);
  assert.deepEqual(buildEnvironment, {
    VITE_PUBLISHER_URL: '${{ vars.VITE_PUBLISHER_URL }}',
  });
  assert.doesNotMatch(JSON.stringify(buildEnvironment), /secrets\.|https?:\/\//i);
  assert.match(studioReadme, /\.\.\/publisher\/README\.md/);
  assert.match(studioReadme, /VITE_PUBLISHER_URL/);
  assert.match(publisherReadme, /VITE_PUBLISHER_URL/);
  assert.equal(upload[0].with.path, 'apps/game/dist');

  const dispatch = workflowSteps(publishSource).filter(({ run }) => String(run ?? '').includes('gh workflow run'));
  assert.equal(dispatch.length, 1, 'content publishing must dispatch one deployment');
  assert.equal(dispatch[0].run, 'gh workflow run deploy.yml --ref main');
});
