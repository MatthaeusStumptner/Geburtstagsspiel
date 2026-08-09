export function migrateSave(parsed, {
  saveVersion,
  difficulties,
  levels,
  powerUpCount,
}) {
  if (parsed.version >= 6) {
    return {
      ...parsed,
      version: saveVersion,
    };
  }

  const legacy = { ...parsed };
  if (parsed.version === 2) {
    legacy.language = 'dialect';
    legacy.selectedLevelId = 'hals';
    legacy.completedLevelIds = [];
  }
  if (parsed.version <= 3) {
    legacy.difficulty = 'normal';
    legacy.graceTimer = 0;
  }

  const config = difficulties[legacy.difficulty] ?? difficulties.normal;
  const savedPellets = Array.isArray(legacy.pellets) ? legacy.pellets : [];
  const savedPowerPellets = Array.isArray(legacy.powerPellets) ? legacy.powerPellets : [];
  const oldRemaining = savedPellets.length + savedPowerPellets.length;
  const oldTotal = Math.max(oldRemaining, Math.floor(Number(legacy.levelTreatTotal) || oldRemaining));
  const collectedPowerUps = Math.max(0, powerUpCount - savedPowerPellets.length);
  const collectedGuttis = Math.max(0, oldTotal - oldRemaining - collectedPowerUps);
  const completedIds = new Set(Array.isArray(legacy.completedLevelIds) ? legacy.completedLevelIds : []);
  const legacyStats = legacy.levelStats && typeof legacy.levelStats === 'object' ? legacy.levelStats : {};
  const migratedStats = Object.fromEntries(levels.map((item) => {
    const stats = legacyStats[item.id] && typeof legacyStats[item.id] === 'object'
      ? legacyStats[item.id]
      : {};
    const completed = completedIds.has(item.id) || Boolean(stats.completed);
    const currentLevel = item.id === legacy.selectedLevelId;
    const previousBest = Math.max(0, Math.floor(Number(stats.bestTreats) || 0));
    const adjustedBest = currentLevel
      ? Math.max(collectedGuttis, previousBest - collectedPowerUps)
      : previousBest;
    return [item.id, {
      ...stats,
      treatsTotal: stats.attempts || completed || currentLevel ? config.treatTarget : 0,
      bestTreats: completed ? config.treatTarget : Math.min(config.treatTarget, adjustedBest),
      completed,
    }];
  }));

  return {
    ...legacy,
    version: saveVersion,
    rebalanceTreats: true,
    migratedTreatsCollected: Math.min(config.treatTarget, collectedGuttis),
    levelTreatTotal: config.treatTarget,
    levelStats: migratedStats,
    levelRunScore: Math.max(0, Math.floor(Number(legacy.levelRunScore) || 0)),
  };
}
