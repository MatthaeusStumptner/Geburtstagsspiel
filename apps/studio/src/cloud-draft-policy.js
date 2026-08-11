export function planCloudDraftAdoption(localLevel, remoteDraft, localSync = {}) {
  if (!remoteDraft?.level || remoteDraft.level.id !== localLevel?.id) return null;
  const differs = JSON.stringify(localLevel) !== JSON.stringify(remoteDraft.level);
  return {
    level: remoteDraft.level,
    preserveLocalBackup: localSync.dirty === true && differs,
    sync: { baseRevision: remoteDraft.revision, dirty: false, source: 'cloud' },
  };
}
