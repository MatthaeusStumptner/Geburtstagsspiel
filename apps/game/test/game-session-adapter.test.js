import assert from 'node:assert/strict';
import test from 'node:test';
import { createLevelDocument } from '@franz-lola/content-model';
import {
  createBrowserGameSession,
  restoreBrowserGameSession,
  saveBrowserGameSession,
  setDebugPlayerPosition,
} from '../src/game/game-session-adapter.js';

function adapterLevel() {
  return createLevelDocument({
    kind: 'franz-lola-level',
    schemaVersion: 1,
    id: 'game-session-adapter',
    board: { columns: 9, rows: 9, tileSize: 24, tunnelRows: [], walls: [] },
    actors: {
      player: { x: 4, y: 4, behavior: { controller: 'stationary' } },
      cats: [],
    },
    collectibles: { powerUps: [] },
    gameplay: {
      pelletSeed: 73,
      treatTargets: { easy: 1, normal: 1, hard: 1 },
      difficulties: { normal: { catCount: 0, grace: 0 } },
    },
    events: [{
      id: 'visited-global',
      scope: 'global',
      name: { standard: 'Besucht', dialect: 'Bsuacht' },
      message: { standard: 'Schon gefunden', dialect: 'Scho gfundn' },
      reward: 300,
      trigger: { type: 'zone', zones: [{ x: 5, y: 5, width: 1, height: 1 }] },
      visual: { type: 'custom', x: 5, y: 5, label: '!' },
    }],
  });
}

test('the browser session adapter passes persisted unlocked events into the core', () => {
  const session = createBrowserGameSession({
    level: adapterLevel(),
    difficulty: 'normal',
    unlockedEvents: new Set(['visited-global']),
  });
  setDebugPlayerPosition(session, { x: 5, y: 5 });

  const snapshot = session.step(1 / 120);

  assert.equal(snapshot.score, 0);
  assert.deepEqual(snapshot.events, []);
  assert.deepEqual(snapshot.unlockedEvents, ['visited-global']);
});

test('debug player positioning persists through the session without mirror score or event effects', () => {
  const session = createBrowserGameSession({
    level: adapterLevel(),
    difficulty: 'normal',
    unlockedEvents: ['visited-global'],
  });
  session.restore({
    score: 80,
    activeEventId: 'visited-global',
    activeEventTimer: 2,
  });

  const positioned = setDebugPlayerPosition(session, { x: 5, y: 5 });

  assert.deepEqual({ x: positioned.player.x, y: positioned.player.y }, { x: 5, y: 5 });
  assert.equal(positioned.score, 80);
  assert.deepEqual(positioned.events, []);
  assert.deepEqual(positioned.unlockedEvents, ['visited-global']);
  assert.equal(positioned.activeEventId, 'visited-global');
  assert.equal(positioned.activeEventTimer, 2);

  const next = session.step(1 / 120);
  assert.deepEqual({ x: next.player.x, y: next.player.y }, { x: 5, y: 5 });
  assert.equal(next.score, 80);
  assert.deepEqual(next.events, []);
});

test('debug event evaluation awards a newly visited event inside the core exactly once', () => {
  const session = createBrowserGameSession({
    level: adapterLevel(),
    difficulty: 'normal',
    unlockedEvents: [],
  });

  const positioned = setDebugPlayerPosition(session, { x: 5, y: 5 }, { evaluateEvents: true });

  assert.equal(positioned.score, 300);
  assert.deepEqual(positioned.events.map((event) => event.type), ['level-event']);
  assert.deepEqual(positioned.unlockedEvents, ['visited-global']);

  const next = session.step(1 / 120);
  assert.equal(next.score, 300);
  assert.deepEqual(next.events, []);
});
test('browser adapter round-trips the core continuation payload without storage ownership', () => {
  const source = createBrowserGameSession({ level: adapterLevel(), difficulty: 'normal' });
  source.queueInput('right');
  source.step(0.005);
  const payload = saveBrowserGameSession(source);
  const restored = createBrowserGameSession({ level: adapterLevel(), difficulty: 'normal' });
  restoreBrowserGameSession(restored, JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(restored.step(0.004), source.step(0.004));
  assert.deepEqual(restored.snapshot(), source.snapshot());
});
