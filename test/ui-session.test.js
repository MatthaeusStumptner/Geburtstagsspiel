import assert from 'node:assert/strict';
import test from 'node:test';
import { createUiSession } from '../src/ui/ui-session.js';

test('UI session merges section snapshots without leaking state between sections', () => {
  const session = createUiSession({
    settings: { language: 'standard' },
    onboarding: { open: true },
    hud: { score: '000120' },
    map: { selectedId: 'dom' },
  });

  session.patch('settings', { open: true, difficulty: 'hard' });
  session.patch('hud', { globalProgress: 44 });
  session.patch('map', { selectionOpen: true });
  session.patch('sceneTransition', { active: true, phase: 'covering' });
  const snapshot = session.snapshot();

  assert.equal(snapshot.settings.open, true);
  assert.equal(snapshot.settings.language, 'standard');
  assert.equal(snapshot.settings.difficulty, 'hard');
  assert.equal(snapshot.onboarding.open, true);
  assert.equal(snapshot.hud.score, '000120');
  assert.equal(snapshot.hud.globalProgress, 44);
  assert.equal(snapshot.map.selectedId, 'dom');
  assert.equal(snapshot.map.selectionOpen, true);
  assert.equal(snapshot.overlay.open, false);
  assert.equal(snapshot.sceneTransition.active, true);
  assert.equal(snapshot.sceneTransition.phase, 'covering');
});

test('UI session exposes engine commands through one explicit boundary', () => {
  const session = createUiSession();
  const calls = [];
  session.registerCommands({ chooseLevel: (id) => calls.push(id) });

  session.command('chooseLevel', 'dom');
  assert.deepEqual(calls, ['dom']);
  assert.throws(() => session.command('missing'), /Unknown UI command/);
});
