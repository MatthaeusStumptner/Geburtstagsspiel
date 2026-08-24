import { extractEmbeddedContentDocuments, validateContentDocument } from '@franz-lola/content-model';
import { contentTable, listContentItems } from './content-store.js';

export function embeddedContentBackfillPlan(drafts, existingItems = []) {
  const existing = new Set(existingItems.map((item) => `${item.type}:${item.id}`));
  const candidates = new Map();
  for (const draft of drafts) {
    for (const content of extractEmbeddedContentDocuments(draft.level ?? draft.document ?? draft)) {
      candidates.set(`${content.type}:${content.id}`, content);
    }
  }
  return [...candidates.entries()].filter(([key]) => !existing.has(key)).map(([, content]) => content);
}

export function embeddedContentBackfillStatements(db, inputs, { login = 'embedded-level-migration', now = new Date().toISOString() } = {}) {
  const recordsByType = new Map();
  for (const input of inputs) {
    const validation = validateContentDocument(input);
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const content = validation.value;
    const records = recordsByType.get(content.type) ?? [];
    records.push({
      id: content.id,
      name: content.name.slice(0, 160),
      description: content.description.slice(0, 500),
      documentJson: JSON.stringify(content),
    });
    recordsByType.set(content.type, records);
  }
  const editor = String(login).slice(0, 160);
  const statements = [];
  for (const [type, records] of recordsByType) {
    const table = contentTable(type);
    const recordsJson = JSON.stringify(records);
    statements.push(
      db.prepare(`/* backfill-content-bulk */ INSERT OR IGNORE INTO ${table}
        (id, display_name, description, document_json, revision, status, updated_by, updated_at)
        SELECT json_extract(value, '$.id'), json_extract(value, '$.name'), json_extract(value, '$.description'),
               json_extract(value, '$.documentJson'), 1, 'draft', ?, ?
          FROM json_each(?)`)
        .bind(editor, now, recordsJson),
      db.prepare(`/* backfill-content-revisions-bulk */ INSERT OR IGNORE INTO entity_revisions
        (content_type, content_id, revision, document_json, created_by, created_at, action)
        SELECT ?, json_extract(entry.value, '$.id'), 1, json_extract(entry.value, '$.documentJson'), ?, ?, 'embedded-backfill'
          FROM json_each(?) AS entry
         WHERE EXISTS (
           SELECT 1 FROM ${table}
            WHERE id = json_extract(entry.value, '$.id')
              AND revision = 1
              AND document_json = json_extract(entry.value, '$.documentJson')
         )`)
        .bind(type, editor, now, recordsJson),
    );
  }
  return statements;
}

export async function backfillEmbeddedContent(db, drafts, { login = 'embedded-level-migration' } = {}) {
  const existing = await listContentItems(db);
  const missing = embeddedContentBackfillPlan(drafts, existing);
  const now = new Date().toISOString();
  const statements = embeddedContentBackfillStatements(db, missing, { login, now });
  if (statements.length) await db.batch(statements);
  return { inserted: missing.length, items: await listContentItems(db, { includeContent: true }) };
}
