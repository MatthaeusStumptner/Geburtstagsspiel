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
  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(state) || !Object.hasOwn(state, 'continuation') && !Object.hasOwn(state, 'legacyFallback')) {
    return session.restore(state, options);
  }
  const continuation = isObject(state.continuation) ? state.continuation : {};
  const legacyFallback = isObject(state.legacyFallback) ? state.legacyFallback : {};
  const restoreState = { ...legacyFallback, ...continuation };
  if (!Number.isFinite(continuation.elapsed) && Object.hasOwn(legacyFallback, 'elapsed')) {
    restoreState.elapsed = legacyFallback.elapsed;
  }
  return session.restore(restoreState, options);
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
