export function assertPublisherPullRequest(pullRequest, expectedBot) {
  if (!pullRequest || !expectedBot) throw new Error('Publishing-Prüfung ist nicht vollständig konfiguriert.');
  if (pullRequest.user?.login !== expectedBot || pullRequest.user?.type !== 'Bot') {
    throw new Error(`Nur die konfigurierte Publishing-App darf automatisch veröffentlichen; erhalten: ${pullRequest.user?.login ?? 'unbekannt'}.`);
  }
  if (!pullRequest.head?.ref?.startsWith('publisher/')) throw new Error('Publishing-Branches müssen mit publisher/ beginnen.');
  if (pullRequest.head?.repo?.full_name !== pullRequest.base?.repo?.full_name) throw new Error('Publishing muss aus demselben Repository stammen.');
}

export function assertPublishedLevelPaths(changedFiles) {
  if (!changedFiles.length) throw new Error('Der Publishing-PR enthält keine Dateien.');
  const invalid = changedFiles.filter((path) => !/^src\/data\/levels\/[a-z0-9][a-z0-9-]*\.level\.json$/.test(path));
  if (invalid.length) throw new Error(`Automatische Veröffentlichung darf ausschließlich Level-JSON ändern: ${invalid.join(', ')}`);
}
