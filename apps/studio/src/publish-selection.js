function remoteDocument(record) {
  return record?.level ?? record?.content ?? record?.document ?? null;
}

function sameEmbeddedDocument(localDocument, storedDocument) {
  if (!localDocument?.document || !storedDocument?.document) return false;
  return JSON.stringify(localDocument.document) === JSON.stringify(storedDocument.document);
}

export function publicationChange(localDocument, remoteRecord, { embeddedBaseline = false } = {}) {
  if (!remoteRecord) return !embeddedBaseline;
  const storedDocument = remoteDocument(remoteRecord);
  const documentChanged = !storedDocument || JSON.stringify(localDocument) !== JSON.stringify(storedDocument);
  const revision = Number(remoteRecord.revision);
  const publishedRevision = remoteRecord.publishedRevision == null ? null : Number(remoteRecord.publishedRevision);
  const unpublishedRevision = Number.isInteger(revision) && revision !== publishedRevision;
  if (embeddedBaseline && revision === 1 && publishedRevision == null
    && sameEmbeddedDocument(localDocument, storedDocument)) return false;
  const migratedEmbeddedBaseline = embeddedBaseline && revision === 1 && publishedRevision == null && !documentChanged;
  return documentChanged || unpublishedRevision && !migratedEmbeddedBaseline;
}

function publishedRecord(record, reference, releaseId) {
  if (!reference || !Number.isInteger(Number(reference.revision))) return record;
  const publishedRevision = Number(reference.revision);
  return {
    ...record,
    publishedRevision,
    status: Number(record.revision) === publishedRevision ? 'published' : 'draft',
    publicationId: null,
    ...(releaseId ? { publishedCommit: `live:${releaseId}` } : {}),
  };
}

export function reconcilePublicationRecords({ drafts = [], items = [] } = {}, publication = {}) {
  const draftReferences = new Map((publication.drafts ?? []).map((entry) => [entry.id, entry]));
  const itemReferences = new Map((publication.items ?? []).map((entry) => [`${entry.type}:${entry.id}`, entry]));
  const releaseId = String(publication.releaseId ?? '').trim();
  return {
    drafts: drafts.map((record) => publishedRecord(record, draftReferences.get(record.id), releaseId)),
    items: items.map((record) => publishedRecord(record, itemReferences.get(`${record.type}:${record.id}`), releaseId)),
  };
}

export function visiblePublishCandidates(candidates, { showAll = false, selectedKeys = [] } = {}) {
  if (showAll) return candidates;
  const selected = new Set(selectedKeys);
  return candidates.filter((entry) => entry.changed || entry.conflict || selected.has(entry.key));
}