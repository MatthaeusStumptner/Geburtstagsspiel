import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkWorkspaceContract } from '../tools/check-workspace-contract.mjs';

test('reports the game-workspace topology without mutating it', async () => {
  const result = await checkWorkspaceContract(new URL('../', import.meta.url));
  assert.deepEqual(result.lockfiles, ['package-lock.json']);
  assert.deepEqual(result.externalRendererPins, ['apps/game/package.json']);
  assert.deepEqual(result.violations, ['external renderer pins are forbidden']);
  assert.deepEqual(result.packages, ['@franz-lola/game']);
});

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
