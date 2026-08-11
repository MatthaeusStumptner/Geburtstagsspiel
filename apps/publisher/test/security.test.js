import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedLogin, safeReturnUrl, signToken, verifyToken } from '../src/security.js';

const secret = '0123456789abcdef0123456789abcdef';
const env = {
  ALLOWED_GITHUB_LOGINS: 'MatthaeusStumptner, Freundin',
  EDITOR_ORIGIN: 'https://matthaeusstumptner.github.io',
  EDITOR_PATH_PREFIX: '/Pacman_clone_level_editor/',
};

test('signed sessions reject tampering and expiration', async () => {
  const valid = await signToken({ type: 'publisher-session', login: 'Freundin', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  assert.equal((await verifyToken(valid, secret, 'publisher-session')).login, 'Freundin');
  assert.equal(await verifyToken(`${valid}x`, secret, 'publisher-session'), null);
  const expired = await signToken({ type: 'publisher-session', login: 'Freundin', exp: 1 }, secret);
  assert.equal(await verifyToken(expired, secret, 'publisher-session'), null);
});

test('return URLs and editor logins use exact allowlists', () => {
  assert.equal(isAllowedLogin('freundin', env), true);
  assert.equal(isAllowedLogin('freundin-admin', env), false);
  assert.equal(safeReturnUrl('https://matthaeusstumptner.github.io/Pacman_clone_level_editor/?x=1#secret', env), 'https://matthaeusstumptner.github.io/Pacman_clone_level_editor/?x=1');
  assert.equal(safeReturnUrl('https://evil.example/Pacman_clone_level_editor/', env), null);
  assert.equal(safeReturnUrl('javascript:alert(1)', env), null);
});
