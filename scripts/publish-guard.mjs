export function assertPublisherPullRequest(pullRequest, expectedBot) {
  if (!pullRequest || !expectedBot) throw new Error('Publishing-Prüfung ist nicht vollständig konfiguriert.');
  if (pullRequest.user?.login !== expectedBot || pullRequest.user?.type !== 'Bot') {
    throw new Error(`Nur die konfigurierte Publishing-App darf automatisch veröffentlichen; erhalten: ${pullRequest.user?.login ?? 'unbekannt'}.`);
  }
  if (!pullRequest.head?.ref?.startsWith('publisher/')) throw new Error('Publishing-Branches müssen mit publisher/ beginnen.');
  if (pullRequest.head?.repo?.full_name !== pullRequest.base?.repo?.full_name) throw new Error('Publishing muss aus demselben Repository stammen.');
}

const PUBLISHED_CONTENT_PATHS = Object.freeze([
  /^src\/data\/levels\/[a-z0-9][a-z0-9-]*\.level\.json$/,
  /^src\/data\/library\/characters\/[a-z0-9][a-z0-9-]*\.character\.json$/,
  /^src\/data\/library\/tilesets\/[a-z0-9][a-z0-9-]*\.tileset\.json$/,
  /^src\/data\/library\/blocks\/[a-z0-9][a-z0-9-]*\.block\.json$/,
  /^src\/data\/library\/animations\/[a-z0-9][a-z0-9-]*\.animation\.json$/,
  /^src\/data\/library\/cutscenes\/[a-z0-9][a-z0-9-]*\.cutscene\.json$/,
  /^src\/data\/library\/objects\/[a-z0-9][a-z0-9-]*\.object\.json$/,
]);

export function assertPublishedContentPaths(changedFiles) {
  if (!changedFiles.length) throw new Error('Der Publishing-PR enthält keine Dateien.');
  const invalid = changedFiles.filter((path) => !PUBLISHED_CONTENT_PATHS.some((pattern) => pattern.test(path)));
  if (invalid.length) throw new Error(`Automatische Veröffentlichung darf ausschließlich kanonische Content-JSON ändern: ${invalid.join(', ')}`);
}

export const assertPublishedLevelPaths = assertPublishedContentPaths;
