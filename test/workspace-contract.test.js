import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkWorkspaceContract } from '../tools/check-workspace-contract.mjs';

test('reports the game-workspace topology without mutating it', async () => {
  const result = await checkWorkspaceContract(new URL('../', import.meta.url));
  assert.deepEqual(result.lockfiles, ['package-lock.json']);
  assert.deepEqual(result.externalRendererPins, []);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.packages, [
    '@franz-lola/game',
    '@franz-lola/pixel-renderer',
    '@franz-lola/publisher',
    '@franz-lola/studio',
  ]);
});

test('the game workspace keeps its public commands', async () => {
  const game = JSON.parse(await readFile(new URL('../apps/game/package.json', import.meta.url), 'utf8'));
  assert.equal(game.name, '@franz-lola/game');
  assert.equal(game.scripts.verify, 'npm test && npm run build && npm run test:browser');
  assert.equal(game.dependencies['@franz-lola/pixel-renderer'], '0.0.0-monorepo');
  const result = await checkWorkspaceContract(new URL('../', import.meta.url));
  assert.deepEqual(result.packages, [
    '@franz-lola/game',
    '@franz-lola/pixel-renderer',
    '@franz-lola/publisher',
    '@franz-lola/studio',
  ]);
  assert.deepEqual(result.externalRendererPins, []);
  assert.deepEqual(result.violations, []);
});
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
  assert.deepEqual(result.packages, [
    '@franz-lola/game',
    '@franz-lola/pixel-renderer',
    '@franz-lola/publisher',
    '@franz-lola/studio',
  ]);
  assert.deepEqual(result.externalRendererPins, []);
  assert.deepEqual(result.violations, []);
});
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

test('root overrides preserve publisher dependency resolutions', async () => {
  const root = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const resolvedVersion = (name) => Object.entries(lock.packages)
    .find(([location]) => location === `node_modules/${name}` || location.endsWith(`/node_modules/${name}`))?.[1].version;
  assert.deepEqual(root.overrides, { wrangler: '4.118.0', undici: '7.29.0' });
  assert.equal(resolvedVersion('wrangler'), '4.118.0');
  assert.equal(resolvedVersion('undici'), '7.29.0');
});
