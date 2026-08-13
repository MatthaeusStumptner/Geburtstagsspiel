import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as gate from '../e2e/rendering-gate-runner.js';

test('scenario failure still finalizes the standard WebM and writes a failed summary before aggregate throw', async () => {
  assert.equal(typeof gate.runCapturedScenario, 'function');
  assert.equal(typeof gate.completeRenderingGate, 'function');
  const directory = await mkdtemp(join(tmpdir(), 'franz-lola-rendering-failure-'));
  const rawVideo = join(directory, 'playwright-generated.webm');
  const summaryPath = join(directory, 'summary.json');
  await writeFile(rawVideo, Buffer.alloc(24_000, 7));
  let closed = false;
  try {
    const failed = await gate.runCapturedScenario({
      scenario: { name: 'forced-failure', backend: 'webgl2' },
      artifactDir: directory,
      execute: async () => { throw new Error('forced post-capture assertion failure'); },
      close: async () => { closed = true; },
      video: { path: async () => rawVideo },
      measureVideo: async (path) => ({ path, bytes: 24_000, durationSeconds: 5.25 }),
    });
    assert.equal(closed, true);
    assert.equal(failed.status, 'failed');
    assert.match(failed.error.message, /forced post-capture/);
    assert.equal(failed.video.path, join(directory, 'forced-failure.webm'));

    await assert.rejects(gate.completeRenderingGate({
      summaryPath,
      summary: { runId: 'review-red', scenarios: [failed] },
    }), AggregateError);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    assert.equal(summary.status, 'failed');
    assert.equal(summary.scenarios[0].video.path, join(directory, 'forced-failure.webm'));
    assert.match(summary.scenarios[0].error.message, /forced post-capture/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
