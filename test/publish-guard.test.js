import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublishedContentPaths, assertPublisherPullRequest } from '../scripts/publish-guard.mjs';

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

test('publishing guard accepts every canonical content type and nothing else', () => {
  const allowed = [
    'src/data/levels/hals.level.json',
    'src/data/library/characters/postler.character.json',
    'src/data/library/tilesets/innstadt.tileset.json',
    'src/data/library/blocks/ziegel.block.json',
    'src/data/library/animations/winken.animation.json',
    'src/data/library/cutscenes/servus.cutscene.json',
    'src/data/library/objects/briefkasten.object.json',
  ];
  assert.doesNotThrow(() => assertPublishedContentPaths(allowed));
  assert.throws(() => assertPublishedContentPaths([...allowed, '.github/workflows/deploy.yml']), /kanonische Content-JSON/);
  assert.throws(() => assertPublishedContentPaths(['src/data/levels/..%2Fmain.js.level.json']), /kanonische Content-JSON/);
  assert.throws(() => assertPublishedContentPaths(['src/data/library/characters/postler.object.json']), /kanonische Content-JSON/);
  assert.throws(() => assertPublishedContentPaths([]), /keine Dateien/);
});
