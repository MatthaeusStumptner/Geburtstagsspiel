import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { importPrivateKey, workflowProgress } from '../src/github.js';

test('GitHub App keys work in both generated PKCS#1 and PKCS#8 PEM formats', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  for (const type of ['pkcs1', 'pkcs8']) {
    const pem = privateKey.export({ type, format: 'pem' }).toString();
    const imported = await importPrivateKey(pem);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', imported, new TextEncoder().encode('franz-und-lola'));
    assert.ok(signature.byteLength > 0, `${type} key should sign a JWT payload`);
  }
});

test('maps active GitHub validation steps to human-readable progress', () => {
  const result = workflowProgress({ status: 'in_progress' }, [{ steps: [
    { name: 'Checkout proposed content', status: 'completed', conclusion: 'success' },
    { name: 'Run full game test suite', status: 'in_progress', conclusion: null },
  ] }], 'validation');
  assert.equal(result.phase, 'validation-tests');
  assert.equal(result.progress, 49);
  assert.match(result.detail, /automatischen Spiel- und Inhaltstests/);
  assert.equal(result.completedSteps, 1);
});

test('maps GitHub Pages deployment jobs and has a useful queued fallback', () => {
  const running = workflowProgress({ status: 'in_progress' }, [{ steps: [
    { name: 'Build game bundle', status: 'completed', conclusion: 'success' },
    { name: 'Upload artifact', status: 'in_progress', conclusion: null },
  ] }], 'deploy');
  assert.equal(running.phase, 'deploy-artifact');
  assert.equal(running.progress, 93);
  const queued = workflowProgress({ status: 'queued' }, [], 'deploy');
  assert.equal(queued.phase, 'deploy-queued');
  assert.equal(queued.progress, 68);
});
