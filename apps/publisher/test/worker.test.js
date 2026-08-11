import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = {
  SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  EDITOR_ORIGIN: 'https://matthaeusstumptner.github.io',
  EDITOR_PATH_PREFIX: '/Pacman_clone_level_editor/',
  ALLOWED_GITHUB_LOGINS: 'freundin',
  GITHUB_APP_CLIENT_ID: 'client-id',
  GITHUB_APP_CLIENT_SECRET: 'client-secret',
  GITHUB_APP_ID: '123',
  GITHUB_INSTALLATION_ID: '456',
  GITHUB_APP_PRIVATE_KEY: 'test-private-key',
  LEVEL_DB: { prepare() {}, batch() {} },
};

test('health response carries locked-down security headers', async () => {
  const response = await worker.fetch(new Request('https://publisher.example/health'), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('API rejects foreign origins and missing editor sessions', async () => {
  const foreign = await worker.fetch(new Request('https://publisher.example/api/me', { headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(foreign.status, 403);
  const anonymous = await worker.fetch(new Request('https://publisher.example/api/me', { headers: { Origin: env.EDITOR_ORIGIN } }), env);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('Access-Control-Allow-Origin'), env.EDITOR_ORIGIN);
});

test('health reports missing secrets and D1 binding before accepting traffic', async () => {
  const response = await worker.fetch(new Request('https://publisher.example/health'), {});
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.deepEqual(body.missingBindings, ['LEVEL_DB']);
  assert.ok(body.missingSecrets.includes('SESSION_SECRET'));
});

test('OAuth login accepts only the exact editor return path', async () => {
  const rejected = await worker.fetch(new Request('https://publisher.example/auth/login?return_to=https://evil.example/'), env);
  assert.equal(rejected.status, 400);
  const accepted = await worker.fetch(new Request(`https://publisher.example/auth/login?return_to=${encodeURIComponent(`${env.EDITOR_ORIGIN}${env.EDITOR_PATH_PREFIX}`)}`), env);
  assert.equal(accepted.status, 302);
  assert.equal(new URL(accepted.headers.get('Location')).hostname, 'github.com');
  assert.match(accepted.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
});
