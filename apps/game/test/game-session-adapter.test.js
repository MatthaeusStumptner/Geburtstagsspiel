import assert from 'node:assert/strict';
import test from 'node:test';
import { createLevelDocument } from '@franz-lola/content-model';
import {
  createBrowserGameSession,
  restoreBrowserGameSession,
  saveBrowserGameSession,
  setDebugPlayerPosition,
} from '../src/game/game-session-adapter.js';
import { publishedLevel } from '../src/game/level-catalog.js';

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
test('browser restore bridge preserves every exact continuation field through the published 12-second event', () => {
  const level = publishedLevel('dom');
  level.actors.player.behavior = { controller: 'stationary' };
  level.gameplay.difficulties.normal = {
    ...level.gameplay.difficulties.normal,
    catCount: 0,
    grace: 20,
  };
  const uninterrupted = createBrowserGameSession({ level, difficulty: 'normal' });
  const source = createBrowserGameSession({ level, difficulty: 'normal' });
  for (const session of [uninterrupted, source]) {
    session.queueInput('right');
    session.step(1 / 120);
    session.step(1 / 120);
    session.queueInput('up');
  }

  const continuation = saveBrowserGameSession(source);
  const rounded = source.snapshot();
  const legacyFallback = {
    player: {
      x: rounded.player.x,
      y: rounded.player.y,
      direction: rounded.player.dir.name,
      nextDirection: rounded.player.nextDir.name,
    },
    cats: rounded.cats,
    pellets: rounded.pellets,
    powerUps: rounded.powerUps,
    unlockedEvents: rounded.unlockedEvents,
    score: rounded.score,
    lives: rounded.lives,
    elapsed: rounded.elapsed,
    powerTimer: rounded.powerTimer,
    graceTimer: rounded.graceTimer,
    hitTimer: rounded.hitTimer,
    state: rounded.state,
  };
  const browserPayload = JSON.parse(JSON.stringify({ continuation, legacyFallback }));
  assert.notEqual(browserPayload.continuation.elapsed, browserPayload.legacyFallback.elapsed);

  const restored = createBrowserGameSession({ level, difficulty: 'normal' });
  restoreBrowserGameSession(restored, browserPayload);
  assert.deepEqual(saveBrowserGameSession(restored), browserPayload.continuation);

  const continueToOrganEvent = (session) => {
    for (let tick = 1; tick <= 1500; tick += 1) {
      const snapshot = session.step(1 / 120);
      const eventIds = snapshot.events.filter(({ type }) => type === 'level-event').map(({ id }) => id);
      if (eventIds.length) return { tick, eventIds, score: snapshot.score, elapsed: snapshot.elapsed };
    }
    assert.fail('published 12-second event did not fire');
  };
  const expected = continueToOrganEvent(uninterrupted);
  const actual = continueToOrganEvent(restored);
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual.eventIds, ['orgelakkord']);
  assert.equal(actual.score, 180);
});

test('browser restore bridge uses legacy elapsed only when exact continuation elapsed is absent', () => {
  const level = adapterLevel();
  const restored = createBrowserGameSession({ level, difficulty: 'normal' });
  const snapshot = restoreBrowserGameSession(restored, {
    continuation: { score: 75 },
    legacyFallback: { score: 20, elapsed: 4.25 },
  });
  assert.equal(snapshot.score, 75);
  assert.equal(snapshot.elapsed, 4.25);
});
