import assert from 'node:assert/strict';
import test from 'node:test';

import { startIsolatedStudioServer } from '../scripts/studio-gate-server.mjs';

test('isolated Studio Vite child reports an OS port and exits without leaving it reachable', async () => {
  const server = await startIsolatedStudioServer({ readinessTimeoutMs: 30_000 });
  let cleanup;
  try {
    assert.ok(Number.isInteger(server.port) && server.port > 0);
    assert.notEqual(server.port, 5173, 'isolated Studio server must not use Vite default port');
    assert.ok(Number.isInteger(server.pid) && server.pid > 0);

    const response = await fetch(server.baseUrl);
    assert.equal(response.status, 200);
  } finally {
    cleanup = await server.close();
  }
  assert.equal(cleanup.code, 0);
  assert.equal(cleanup.portClosed, true);
  await assert.rejects(fetch(server.baseUrl, { signal: AbortSignal.timeout(1_000) }));
});