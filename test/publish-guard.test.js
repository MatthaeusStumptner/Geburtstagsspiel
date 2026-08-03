import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublishedLevelPaths, assertPublisherPullRequest } from '../scripts/publish-guard.mjs';

function pullRequest(overrides = {}) {
  return {
    user: { login: 'franz-lola-publisher[bot]', type: 'Bot' },
    head: { ref: 'publisher/hals-123', repo: { full_name: 'MatthaeusStumptner/Geburtstagsspiel' } },
    base: { repo: { full_name: 'MatthaeusStumptner/Geburtstagsspiel' } },
    ...overrides,
  };
}

test('publishing guard accepts only the exact configured app bot in the same repository', () => {
  assert.doesNotThrow(() => assertPublisherPullRequest(pullRequest(), 'franz-lola-publisher[bot]'));
  assert.throws(() => assertPublisherPullRequest(pullRequest({ user: { login: 'someone-else', type: 'User' } }), 'franz-lola-publisher[bot]'), /Publishing-App/);
  assert.throws(() => assertPublisherPullRequest(pullRequest({ head: { ref: 'feature/hals', repo: { full_name: 'MatthaeusStumptner/Geburtstagsspiel' } } }), 'franz-lola-publisher[bot]'), /publisher\//);
  assert.throws(() => assertPublisherPullRequest(pullRequest({ head: { ref: 'publisher/hals', repo: { full_name: 'attacker/fork' } } }), 'franz-lola-publisher[bot]'), /demselben Repository/);
});

test('publishing guard rejects every change outside canonical level JSON', () => {
  assert.doesNotThrow(() => assertPublishedLevelPaths(['src/data/levels/hals.level.json']));
  assert.throws(() => assertPublishedLevelPaths(['src/data/levels/hals.level.json', '.github/workflows/deploy.yml']), /ausschließlich Level-JSON/);
  assert.throws(() => assertPublishedLevelPaths(['src/data/levels/..%2Fmain.js.level.json']), /ausschließlich Level-JSON/);
  assert.throws(() => assertPublishedLevelPaths([]), /keine Dateien/);
});
