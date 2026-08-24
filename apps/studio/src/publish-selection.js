function remoteDocument(record) {
  return record?.level ?? record?.content ?? record?.document ?? null;
}

export function publicationChange(localDocument, remoteRecord, { embeddedBaseline = false } = {}) {
  if (!remoteRecord) return !embeddedBaseline;
  const storedDocument = remoteDocument(remoteRecord);
  const documentChanged = !storedDocument || JSON.stringify(localDocument) !== JSON.stringify(storedDocument);
  const revision = Number(remoteRecord.revision);
  const publishedRevision = remoteRecord.publishedRevision == null ? null : Number(remoteRecord.publishedRevision);
  const unpublishedRevision = Number.isInteger(revision) && revision !== publishedRevision;
  const migratedEmbeddedBaseline = embeddedBaseline && revision === 1 && publishedRevision == null && !documentChanged;
  return documentChanged || unpublishedRevision && !migratedEmbeddedBaseline;
}

export function visiblePublishCandidates(candidates, { showAll = false, selectedKeys = [] } = {}) {
  if (showAll) return candidates;
  const selected = new Set(selectedKeys);
  return candidates.filter((entry) => entry.changed || entry.conflict || selected.has(entry.key));
}