import { createGameSession } from '@franz-lola/game-core';

export function createBrowserGameSession({ level, difficulty, unlockedEvents = [] }) {
  return createGameSession({
    level,
    difficulty,
    seed: level.gameplay.pelletSeed,
    unlockedEvents,
  });
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
