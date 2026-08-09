import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateSave } from '../src/platform/save-migrations.js';

const options = {
  saveVersion: 10,
  difficulties: {
    normal: { treatTarget: 110 },
  },
  levels: [{ id: 'hals' }, { id: 'dom' }],
  powerUpCount: 4,
};

test('recent saves gain the new schema version without changing their round', () => {
  const legacy = { version: 6, selectedLevelId: 'dom', score: 420, pellets: ['1,1'] };
  assert.deepEqual(migrateSave(legacy, options), { ...legacy, version: 10, audioOutputProfile: 'speaker', startupBootSeen: true });
  const previous = { version: 7, selectedLevelId: 'hals', concertUnlocked: true };
  assert.deepEqual(migrateSave(previous, options), { ...previous, version: 10, audioOutputProfile: 'speaker', startupBootSeen: true });
  const lastRelease = { version: 8, selectedLevelId: 'dom', concertUnlocked: true };
  assert.deepEqual(migrateSave(lastRelease, options), { ...lastRelease, version: 10, audioOutputProfile: 'speaker', startupBootSeen: true });
  const configured = { version: 9, audioOutputProfile: 'headphones', startupBootSeen: false };
  assert.deepEqual(migrateSave(configured, options), { ...configured, version: 10 });
});

test('older saves receive canonical progress data and Gutti-only balancing', () => {
  const migrated = migrateSave({
    version: 2,
    difficulty: 'normal',
    levelTreatTotal: 40,
    pellets: Array(20).fill('1,1'),
    powerPellets: Array(2).fill('2,2'),
    levelStats: {},
  }, options);

  assert.equal(migrated.version, 10);
  assert.equal(migrated.language, 'dialect');
  assert.equal(migrated.selectedLevelId, 'hals');
  assert.equal(migrated.rebalanceTreats, true);
  assert.equal(migrated.migratedTreatsCollected, 16);
  assert.equal(migrated.levelStats.hals.treatsTotal, 110);
  assert.equal(migrated.levelStats.dom.treatsTotal, 0);
});
