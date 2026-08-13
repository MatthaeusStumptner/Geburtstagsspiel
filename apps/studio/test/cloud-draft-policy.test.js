import test from 'node:test';
import assert from 'node:assert/strict';
import { planCloudDraftAdoption } from '../src/cloud-draft-policy.js';
import { createStarterLevel } from '../src/editor-state.js';

test('automatically adopts the shared level over an unmarked legacy browser draft', () => {
  const local = createStarterLevel();
  local.name.standard = 'Alter Browser-Entwurf';
  const remote = { id: local.id, revision: 12, level: { ...createStarterLevel(), name: { standard: 'Gemeinsamer Stand', dialect: 'Gemeinsamer Stand' } } };
  const plan = planCloudDraftAdoption(local, remote, { source: 'legacy', dirty: false });
  assert.equal(plan.level.name.standard, 'Gemeinsamer Stand');
  assert.equal(plan.preserveLocalBackup, false);
  assert.deepEqual(plan.sync, { baseRevision: 12, dirty: false, source: 'cloud' });
});

test('preserves only explicit edits made after a known base revision', () => {
  const local = createStarterLevel();
  local.name.standard = 'Bewusste lokale Änderung';
  const remote = { id: local.id, revision: 13, level: createStarterLevel() };
  assert.equal(planCloudDraftAdoption(local, remote, { baseRevision: 12, dirty: true, source: 'local' }).preserveLocalBackup, true);
  assert.equal(planCloudDraftAdoption(remote.level, remote, { baseRevision: 12, dirty: true, source: 'local' }).preserveLocalBackup, false);
});
