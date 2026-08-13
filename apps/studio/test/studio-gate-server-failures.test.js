import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { startIsolatedStudioServer } from '../scripts/studio-gate-server.mjs';

test('isolated Studio server propagates a child that exits before readiness', async () => {
  const childPath = fileURLToPath(new URL('./fixtures/server-exits-early.mjs', import.meta.url));
  await assert.rejects(
    startIsolatedStudioServer({ childPath, readinessTimeoutMs: 2_000 }).then(async (server) => {
      await server.close();
      throw new Error('injected early-exit child was not used');
    }),
    /exited before readiness/,
  );
});

test('isolated Studio server exactly terminates an owned child that ignores shutdown', async () => {
  const childPath = fileURLToPath(new URL('./fixtures/server-ignores-shutdown.mjs', import.meta.url));
  const server = await startIsolatedStudioServer({ childPath, readinessTimeoutMs: 2_000, shutdownTimeoutMs: 100 });
  const cleanup = await server.close();
  assert.equal(cleanup.forced, true);
  assert.equal(cleanup.portClosed, true);
});
