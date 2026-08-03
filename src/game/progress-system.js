export const GLOBAL_GUTTIS_PER_LEVEL = 70;

export function levelProgressGuttis(stats, completed = false) {
  if (completed || stats?.completed) return GLOBAL_GUTTIS_PER_LEVEL;
  const best = Math.max(0, Number(stats?.bestTreats) || 0);
  const total = Math.max(0, Number(stats?.treatsTotal) || 0);
  if (!total) return 0;
  return Math.min(GLOBAL_GUTTIS_PER_LEVEL, Math.round((best / total) * GLOBAL_GUTTIS_PER_LEVEL));
}

export function aggregateProgress(levelIds, completedIds, statsByLevel) {
  const completed = completedIds instanceof Set ? completedIds : new Set(completedIds);
  return {
    completedLevels: levelIds.filter((id) => completed.has(id)).length,
    totalLevels: levelIds.length,
    treatsFound: levelIds.reduce((sum, id) => sum + levelProgressGuttis(statsByLevel[id], completed.has(id)), 0),
    treatsTotal: levelIds.length * GLOBAL_GUTTIS_PER_LEVEL,
  };
}
