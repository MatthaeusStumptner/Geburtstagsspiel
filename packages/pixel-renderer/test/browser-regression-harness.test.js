import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function runHarness(argument) {
  return spawnSync(process.execPath, [join(projectRoot, 'scripts', 'browser-regression.mjs'), argument], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });
}

function combinedOutput(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

test('fails on a browser console error emitted after capture and scenario evaluation', { timeout: 70_000 }, () => {
  const result = runHarness('--inject-late-console-error');

  assert.equal(result.signal, null, combinedOutput(result));
  assert.notEqual(result.status, 0, 'late console error must fail the browser regression');
  assert.match(combinedOutput(result), /late injected console error/);
  assert.match(combinedOutput(result), /must not emit unexpected browser messages/);
});

test('fails on a context-loss event emitted after capture and scenario evaluation', { timeout: 70_000 }, () => {
  const result = runHarness('--inject-late-context-loss');

  assert.equal(result.signal, null, combinedOutput(result));
  assert.notEqual(result.status, 0, 'late context loss must fail the browser regression');
  assert.match(combinedOutput(result), /must not lose its WebGL context/);
});

test('accepts real pacer sequences below the 121-presentation ceiling', { timeout: 70_000 }, () => {
  const result = runHarness('--pacer-open-window');

  assert.equal(result.signal, null, combinedOutput(result));
  assert.equal(result.status, 0, combinedOutput(result));
  assert.match(combinedOutput(result), /pacer=120\/120\/120/);
});
