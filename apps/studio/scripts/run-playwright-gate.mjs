import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startIsolatedStudioServer } from './studio-gate-server.mjs';

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const playwrightCli = resolve(studioRoot, '..', '..', 'node_modules', '@playwright', 'test', 'cli.js');
const publisherUrl = 'https://franz-lola-publisher.test.workers.dev';
const runId = `run-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${process.pid}`;

function runPlaywright(args, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [playwrightCli, 'test', ...args], { cwd: studioRoot, env, stdio: 'inherit' });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => code === 0 ? resolveRun() : rejectRun(new Error(`Playwright exited with ${signal ?? code}`)));
  });
}

let studioServer;

try {
  process.env.VITE_PUBLISHER_URL = publisherUrl;
  studioServer = await startIsolatedStudioServer({ env: process.env });
  const { baseUrl, port } = studioServer;
  process.stdout.write(`[studio-browser] runId=${runId} port=${port} serverPid=${studioServer.pid}\n`);
  await runPlaywright(process.argv.slice(2), {
    ...process.env,
    PLAYWRIGHT_BASE_URL: baseUrl,
    PLAYWRIGHT_EXTERNAL_SERVER: '1',
    STUDIO_GATE_RUN_ID: runId,
    STUDIO_GATE_PORT: String(port),
    VITE_PUBLISHER_URL: publisherUrl,
  });
} finally {
  const cleanup = await studioServer?.close();
  if (cleanup) process.stdout.write(`[studio-browser] cleanup port=${studioServer.port} code=${cleanup.code} forced=${cleanup.forced} portClosed=${cleanup.portClosed}\n`);
}