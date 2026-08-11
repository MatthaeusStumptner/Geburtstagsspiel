import { createGameSession } from '@franz-lola/game-core';

export function createBrowserGameSession({ level, difficulty, unlockedEvents = [] }) {
  return createGameSession({
    level,
    difficulty,
    seed: level.gameplay.pelletSeed,
    unlockedEvents,
  });
}

export function saveBrowserGameSession(session) {
  if (!session || typeof session.save !== 'function') throw new TypeError('Die Game-Session kann nicht gespeichert werden.');
  return session.save();
}

export function restoreBrowserGameSession(session, state, options) {
  if (!session || typeof session.restore !== 'function') throw new TypeError('Die Game-Session kann nicht wiederhergestellt werden.');
  return session.restore(state, options);
}

export function setDebugPlayerPosition(session, { x, y }, { evaluateEvents = false } = {}) {
  return session.restore({
    player: {
      x,
      y,
      direction: 'none',
      nextDirection: 'none',
    },
  }, { evaluateEvents });
}
