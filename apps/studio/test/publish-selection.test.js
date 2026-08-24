import test from 'node:test';
import assert from 'node:assert/strict';

test('publish review shows one changed level instead of the unchanged cross-level catalog', async () => {
  const helpers = await import('../src/publish-selection.js').catch(() => ({}));
  const publicationChange = helpers.publicationChange ?? (() => true);
  const visiblePublishCandidates = helpers.visiblePublishCandidates ?? ((candidates) => candidates);
  const unchangedLevel = { id: 'home', revision: 3, publishedRevision: 3, level: { id: 'home' } };
  const changedLevel = { id: 'zauberberg', revision: 5, publishedRevision: 4, level: { id: 'zauberberg', decorations: ['musiknote'] } };
  const placedNote = { type: 'object', id: 'zauberberg-music-note', content: { type: 'object', id: 'zauberberg-music-note' } };
  const candidates = [
    { key: 'level:zauberberg', changed: publicationChange(changedLevel.level, changedLevel) },
    { key: 'level:home', changed: publicationChange(unchangedLevel.level, unchangedLevel) },
    { key: 'object:zauberberg-music-note', changed: publicationChange(placedNote.content, null, { embeddedBaseline: true }) },
  ];

  assert.deepEqual(visiblePublishCandidates(candidates).map((entry) => entry.key), ['level:zauberberg']);
});
