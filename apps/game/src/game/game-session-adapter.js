import { createGameSession } from '@franz-lola/game-core';

export function createBrowserGameSession({ level, difficulty, seed = level.gameplay.pelletSeed, unlockedEvents = [] }) {
  return createGameSession({
    level,
    difficulty,
    seed,
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

const DEBUG_DIRECTIONS = new Set(['up', 'down', 'left', 'right', 'none']);
const DEBUG_CAT_POSITION_KEYS = new Set(['id', 'x', 'y', 'direction']);

export function setDebugCatPositions(session, positions) {
  if (!session || typeof session.snapshot !== 'function' || typeof session.restore !== 'function') {
    throw new TypeError('Cat debug positioning requires a game session.');
  }
  const currentCats = session.snapshot().cats;
  if (!Array.isArray(positions) || positions.length !== currentCats.length) {
    throw new TypeError('Cat debug positions must match the active cat count.');
  }
  const ids = new Set();
  const cats = positions.map((position, index) => {
    const expectedId = currentCats[index].id ?? 'cat-' + (index + 1);
    if (!position || typeof position !== 'object' || Array.isArray(position)
      || Object.keys(position).some((key) => !DEBUG_CAT_POSITION_KEYS.has(key))
      || typeof position.x !== 'number' || !Number.isFinite(position.x)
      || typeof position.y !== 'number' || !Number.isFinite(position.y)
      || position.direction !== undefined && !DEBUG_DIRECTIONS.has(position.direction)
      || position.id !== undefined && position.id !== expectedId
      || position.id !== undefined && ids.has(position.id)) {
      throw new TypeError('Every cat debug position must be finite and match its active cat.');
    }
    if (position.id !== undefined) ids.add(position.id);
    return {
      ...currentCats[index],
      x: position.x,
      y: position.y,
      previousX: position.x,
      previousY: position.y,
      direction: position.direction ?? 'none',
    };
  });
  return session.restore({ cats });
}
