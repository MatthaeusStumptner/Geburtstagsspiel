import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioHistory } from '../src/studio/history.js';

test('undo and redo restore complete cross-workspace snapshots', () => {
  const history = new StudioHistory();
  const before = { level: { name: 'Alt' }, objects: [{ id: 'lamp', color: '#fff' }], characters: [] };
  const after = { level: { name: 'Neu' }, objects: [{ id: 'lamp', color: '#f00' }], characters: [{ id: 'franz' }] };
  assert.equal(history.record('Inhalt bearbeiten', before, after), true);
  assert.deepEqual(history.undo(), { label: 'Inhalt bearbeiten', snapshot: before });
  assert.deepEqual(history.redo(), { label: 'Inhalt bearbeiten', snapshot: after });
});

test('coalesces continuous changes with the same context and clears redo after a new edit', () => {
  const history = new StudioHistory({ coalesceWindow: 500 });
  history.record('Farbe ändern', { color: '#000' }, { color: '#111' }, { key: 'object:lamp:color', now: 100 });
  history.record('Farbe ändern', { color: '#111' }, { color: '#222' }, { key: 'object:lamp:color', now: 300 });
  assert.equal(history.past.length, 1);
  assert.deepEqual(history.undo().snapshot, { color: '#000' });
  history.record('Name ändern', { name: 'A' }, { name: 'B' }, { key: 'object:lamp:name', now: 900 });
  assert.equal(history.canRedo, false);
});

test('ignores no-op changes and enforces its configured limit', () => {
  const history = new StudioHistory({ limit: 2 });
  assert.equal(history.record('Nichts', { value: 1 }, { value: 1 }), false);
  history.record('Eins', { value: 0 }, { value: 1 }, { coalesce: false });
  history.record('Zwei', { value: 1 }, { value: 2 }, { coalesce: false });
  history.record('Drei', { value: 2 }, { value: 3 }, { coalesce: false });
  assert.deepEqual(history.past.map((entry) => entry.label), ['Zwei', 'Drei']);
});
