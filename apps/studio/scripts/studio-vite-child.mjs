import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let server;
let shuttingDown = false;

function exitOwnedServer(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  server?.httpServer?.closeAllConnections?.();
  server?.httpServer?.close?.();
  setImmediate(() => process.exit(code));
}

process.once('message', (message) => {
  if (message?.type === 'shutdown') exitOwnedServer(0);
});
process.once('disconnect', () => exitOwnedServer(1));

async function reserveEphemeralPort() {
  const probe = createNetServer();
  await new Promise((resolveListen, rejectListen) => {
    probe.once('error', rejectListen);
    probe.listen(0, '127.0.0.1', resolveListen);
  });
  const address = probe.address();
  assert.ok(address && typeof address !== 'string' && address.port > 0, 'Studio Vite child port probe failed.');
  await new Promise((resolveClose, rejectClose) => probe.close((error) => error ? rejectClose(error) : resolveClose()));
  return address.port;
}

try {
  const port = await reserveEphemeralPort();
  server = await createServer({
    root: studioRoot,
    appType: 'spa',
    logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== 'string' && address.port > 0, 'Studio Vite child did not bind an OS-assigned port.');
  process.send?.({ type: 'ready', port: address.port });
} catch (error) {
  process.send?.({ type: 'error', message: error?.message ?? String(error) });
  process.stderr.write(`${error?.stack ?? error}\n`);
  exitOwnedServer(1);
}