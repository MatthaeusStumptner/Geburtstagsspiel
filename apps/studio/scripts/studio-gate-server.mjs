import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const childScript = resolve(studioRoot, 'scripts', 'studio-vite-child.mjs');

function delay(delayMs) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
}

function waitForReady(child, timeoutMs) {
  return new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => finish(new Error(`Studio Vite child did not become ready within ${timeoutMs}ms.`)), timeoutMs);
    const onError = (error) => finish(error);
    const onExit = (code, signal) => finish(new Error(`Studio Vite child exited before readiness with ${signal ?? code}.`));
    const onMessage = (message) => {
      if (message?.type === 'error') finish(new Error(`Studio Vite child failed: ${message.message}`));
      if (message?.type === 'ready') {
        try {
          assert.ok(Number.isInteger(message.port) && message.port > 0, 'Studio Vite child sent an invalid port.');
          finish(null, message.port);
        } catch (error) {
          finish(error);
        }
      }
    };
    function finish(error, port) {
      clearTimeout(timer);
      child.off('error', onError);
      child.off('exit', onExit);
      child.off('message', onMessage);
      if (error) rejectReady(error); else resolveReady(port);
    }
    child.once('error', onError);
    child.once('exit', onExit);
    child.on('message', onMessage);
  });
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForReachability(url, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await isReachable(url) === expected) return true;
    await delay(50);
  } while (Date.now() < deadline);
  return false;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => finish(null), timeoutMs);
    const onExit = (code, signal) => finish({ code, signal });
    function finish(result) {
      clearTimeout(timer);
      child.off('exit', onExit);
      resolveExit(result);
    }
    child.once('exit', onExit);
  });
}

export async function startIsolatedStudioServer({
  readinessTimeoutMs = 120_000,
  shutdownTimeoutMs = 5_000,
  env = process.env,
  childPath = childScript,
} = {}) {
  for (const [name, value] of Object.entries({ readinessTimeoutMs, shutdownTimeoutMs })) {
    if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be finite and positive.`);
  }

  const child = spawn(process.execPath, [childPath], {
    cwd: studioRoot,
    env,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    windowsHide: true,
  });

  let port;
  try {
    port = await waitForReady(child, readinessTimeoutMs);
    const baseUrl = `http://127.0.0.1:${port}`;
    assert.equal(await waitForReachability(baseUrl, true, readinessTimeoutMs), true, 'Studio Vite child never became HTTP-ready.');

    let closePromise;
    return {
      pid: child.pid,
      port,
      baseUrl,
      close() {
        closePromise ??= (async () => {
          let forced = false;
          if (child.connected) child.send({ type: 'shutdown' });
          let outcome = await waitForExit(child, shutdownTimeoutMs);
          if (!outcome) {
            forced = true;
            child.kill('SIGTERM');
            outcome = await waitForExit(child, shutdownTimeoutMs);
          }
          assert.ok(outcome, 'Studio Vite child did not exit after exact-process termination.');
          const portClosed = await waitForReachability(baseUrl, false, shutdownTimeoutMs);
          assert.equal(portClosed, true, `Studio Vite child left port ${port} reachable.`);
          if (!forced) assert.equal(outcome.code, 0, `Studio Vite child exited with ${outcome.signal ?? outcome.code}.`);
          return { ...outcome, forced, portClosed };
        })();
        return closePromise;
      },
    };
  } catch (error) {
    child.kill('SIGTERM');
    await waitForExit(child, shutdownTimeoutMs);
    throw error;
  }
}
