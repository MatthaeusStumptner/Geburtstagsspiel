import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);

function workflowSteps(source) {
  const lines = source.split(/\r?\n/);
  const stepsStart = lines.findIndex((line) => line.trim() === 'steps:');
  assert.notEqual(stepsStart, -1, 'CI workflow must define jobs.*.steps');
  const stepsIndent = lines[stepsStart].length - lines[stepsStart].trimStart().length;
  const itemPrefix = `${' '.repeat(stepsIndent + 2)}- `;
  const propertyPrefix = ' '.repeat(stepsIndent + 4);
  const nestedPrefix = ' '.repeat(stepsIndent + 6);
  const multilinePrefix = ' '.repeat(stepsIndent + 8);
  const blocks = [];
  for (let index = stepsStart + 1; index < lines.length;) {
    if (lines[index] && !lines[index].startsWith(itemPrefix.slice(0, -2))) break;
    if (!lines[index].startsWith(itemPrefix)) { index += 1; continue; }
    const start = index;
    index += 1;
    while (index < lines.length && !lines[index].startsWith(itemPrefix)
      && (!lines[index] || lines[index].startsWith(propertyPrefix))) index += 1;
    blocks.push(lines.slice(start, index));
  }
  return blocks.map((block) => {
    const step = { with: {} };
    const first = block[0].slice(itemPrefix.length);
    const [firstKey, ...firstValue] = first.split(':');
    step[firstKey] = firstValue.join(':').trim();
    let section = null;
    for (let index = 1; index < block.length; index += 1) {
      const line = block[index];
      const property = new RegExp(`^${propertyPrefix}([\\w-]+):\\s*(.*)$`).exec(line);
      if (property) {
        section = property[1] === 'with' ? 'with' : null;
        if (!section) step[property[1]] = property[2].trim();
        continue;
      }
      const nested = new RegExp(`^${nestedPrefix}([\\w-]+):\\s*(.*)$`).exec(line);
      if (!nested || section !== 'with') continue;
      if (nested[2] !== '|') step.with[nested[1]] = nested[2].trim();
      else {
        const values = [];
        while (index + 1 < block.length && block[index + 1].startsWith(multilinePrefix)) {
          values.push(block[++index].trim());
        }
        step.with[nested[1]] = values;
      }
    }
    return step;
  });
}

test('root verify command executes every planned package, build, benchmark, and browser boundary', async () => {
  const root = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.fromEntries([
    'test:structure', 'test:packages', 'test', 'build', 'test:browser', 'verify:foundation', 'verify',
  ].map((name) => [name, root.scripts[name]])), {
    'test:structure': 'node --test test/*.test.js',
    'test:packages': 'npm run test --workspaces --if-present',
    test: 'npm run test:structure && npm run test:packages',
    build: 'npm run build --workspace @franz-lola/pixel-renderer && npm run build --workspace @franz-lola/game && npm run build --workspace @franz-lola/studio',
    'test:browser': 'npm run test:browser --workspace @franz-lola/pixel-renderer && npm run test:browser --workspace @franz-lola/game && npm run test:e2e --workspace @franz-lola/studio',
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
      ['apps/studio', '@franz-lola/studio', ['test', 'build', 'test:e2e']],
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
    assert.deepEqual(trace.slice(-7), [
      'build:@franz-lola/pixel-renderer',
      'build:@franz-lola/game',
      'build:@franz-lola/studio',
      'benchmark:assert:@franz-lola/pixel-renderer',
      'test:browser:@franz-lola/pixel-renderer',
      'test:browser:@franz-lola/game',
      'test:e2e:@franz-lola/studio',
    ]);
    assert.equal(trace.length, 14, JSON.stringify(trace));
    assert.deepEqual(new Set(trace.filter((entry) => entry.startsWith('test:@'))), new Set(workspaces.map(([, name]) => `test:${name}`)));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('CI runs the root gate once and retains each browser surface on failure', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const steps = workflowSteps(workflow);
  assert.equal(steps.filter(({ uses }) => uses?.startsWith('actions/checkout@')).length, 1);
  const nodeSteps = steps.filter(({ uses }) => uses?.startsWith('actions/setup-node@'));
  assert.equal(nodeSteps.length, 1);
  assert.equal(nodeSteps[0].with['node-version'], '22');
  assert.equal(nodeSteps[0].with.cache, 'npm');
  assert.equal(nodeSteps[0].with['cache-dependency-path'], 'package-lock.json');
  assert.deepEqual(steps.filter(({ run }) => run === 'npm ci --ignore-scripts').map(({ run }) => run), ['npm ci --ignore-scripts']);
  assert.deepEqual(steps.filter(({ run }) => run?.includes('playwright install')).map(({ run }) => run), ['npx playwright install --with-deps chromium']);
  assert.deepEqual(steps.filter(({ run }) => run === 'npm run verify').map(({ run }) => run), ['npm run verify']);
  assert.equal(steps.some(({ ['working-directory']: directory }) => directory), false);

  const artifacts = steps.filter(({ uses }) => uses?.startsWith('actions/upload-artifact@'));
  assert.equal(artifacts.length, 3);
  assert.deepEqual(artifacts.map(({ if: condition }) => condition), ['failure()', 'failure()', 'failure()']);
  assert.deepEqual(artifacts.map(({ with: inputs }) => [inputs.name, inputs.path]), [
    ['renderer-browser-artifacts', ['packages/pixel-renderer/output/playwright/renderer']],
    ['game-browser-artifacts', ['apps/game/output/playwright/game']],
    ['studio-browser-artifacts', ['apps/studio/test-results']],
  ]);
});
