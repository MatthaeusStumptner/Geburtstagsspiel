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

test('embedded live object is unchanged when only derived library metadata differs', async () => {
  const { publicationChange } = await import('../src/publish-selection.js');
  const remote = {
    revision: 1,
    publishedRevision: null,
    content: {
      kind: 'franz-lola-content', schemaVersion: 1, type: 'object', id: 'zauberberg-note',
      name: 'Musiknote', description: 'Objekt aus Zauberberg',
      document: { id: 'zauberberg-note', name: 'Musiknote', description: 'Wiederverwendbares Objekt.' },
      dependencies: [], references: [],
    },
  };
  const restoredLibraryEntry = { ...remote.content, description: 'Wiederverwendbares Objekt.' };

  assert.equal(publicationChange(restoredLibraryEntry, remote, { embeddedBaseline: true }), false);
});

test('successful publication immediately reconciles matching cloud revisions', async () => {
  const helpers = await import('../src/publish-selection.js');
  const { publicationChange } = helpers;
  const reconcilePublicationRecords = helpers.reconcilePublicationRecords ?? ((records) => records);
  const level = { id: 'zauberberg', decorations: ['musiknote'] };
  const object = { kind: 'franz-lola-content', schemaVersion: 1, type: 'object', id: 'musiknote', name: 'Musiknote', description: '', document: { id: 'musiknote' }, dependencies: [], references: [] };
  const records = {
    drafts: [{ id: 'zauberberg', revision: 5, publishedRevision: 4, status: 'draft', level }],
    items: [{ type: 'object', id: 'musiknote', revision: 3, publishedRevision: 2, status: 'draft', content: object }],
  };

  const reconciled = reconcilePublicationRecords(records, {
    releaseId: 'release-42',
    drafts: [{ id: 'zauberberg', revision: 5 }],
    items: [{ type: 'object', id: 'musiknote', revision: 3 }],
  });

  assert.equal(publicationChange(level, reconciled.drafts[0]), false);
  assert.equal(publicationChange(object, reconciled.items[0]), false);
  assert.equal(reconciled.drafts[0].publishedCommit, 'live:release-42');
  assert.equal(reconciled.items[0].status, 'published');
});
