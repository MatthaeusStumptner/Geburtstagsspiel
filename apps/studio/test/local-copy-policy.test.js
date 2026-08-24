import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseAutomaticLocalCopies,
  createLocalSafetyCopy,
  isAutomaticLocalCopy,
} from '../src/local-copy-policy.js';

test('recognizes only automatic local-copy IDs, not intentional duplicates', () => {
  assert.equal(isAutomaticLocalCopy('note-lokale-kopie'), true);
  assert.equal(isAutomaticLocalCopy('note-lokale-kopie-lokale-kopie'), true);
  assert.equal(isAutomaticLocalCopy('note-kopie'), false);
  assert.equal(isAutomaticLocalCopy('lokale-kopie-notiz'), false);
});

test('collapses copy chains to one unpublished local safety copy', () => {
  const result = collapseAutomaticLocalCopies([
    { id: 'note', name: 'Musiknote' },
    { id: 'note-lokale-kopie', name: 'Musiknote · lokale Kopie', color: '#111111' },
    { id: 'note-lokale-kopie-lokale-kopie', name: 'Musiknote · lokale Kopie · lokale Kopie', color: '#222222' },
    { id: 'note-kopie', name: 'Bewusste Kopie' },
  ]);

  assert.deepEqual(result.entries.map((entry) => entry.id), ['note', 'note-kopie', 'note-lokale-sicherung']);
  assert.deepEqual(result.removed, ['note-lokale-kopie', 'note-lokale-kopie-lokale-kopie']);
  assert.equal(result.entries.at(-1).name, 'Musiknote · lokale Sicherung');
  assert.equal(result.entries.at(-1).color, '#222222');
  assert.equal(result.entries.at(-1).localOnly, true);
  assert.equal(result.entries.at(-1).sourceId, 'note');
});

test('creates a stable local-only safety copy for a canonical cloud item', () => {
  const source = { id: 'postler', name: 'Postler', color: '#55d9dd' };
  const copy = createLocalSafetyCopy(source, 'postler');
  assert.deepEqual(copy, {
    id: 'postler-lokale-sicherung',
    name: 'Postler · lokale Sicherung',
    color: '#55d9dd',
    localOnly: true,
    sourceId: 'postler',
  });
  assert.notStrictEqual(copy, source);
});
