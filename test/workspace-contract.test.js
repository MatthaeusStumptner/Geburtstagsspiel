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
