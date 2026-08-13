import { extractEmbeddedContentDocuments, validateContentDocument } from '@franz-lola/content-model';
import { contentTable, listContentItems } from './content-store.js';

const CHUNK_SIZE = 40;

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

export async function backfillEmbeddedContent(db, drafts, { login = 'embedded-level-migration' } = {}) {
  const existing = await listContentItems(db);
  const missing = embeddedContentBackfillPlan(drafts, existing);
  const now = new Date().toISOString();
  for (let offset = 0; offset < missing.length; offset += CHUNK_SIZE) {
    const statements = [];
    for (const input of missing.slice(offset, offset + CHUNK_SIZE)) {
      const validation = validateContentDocument(input);
      if (!validation.ok) throw new Error(validation.errors.join(' '));
      const content = validation.value;
      const documentJson = JSON.stringify(content);
      const table = contentTable(content.type);
      statements.push(
        db.prepare(`/* backfill-content */ INSERT OR IGNORE INTO ${table}
          (id, display_name, description, document_json, revision, status, updated_by, updated_at)
          VALUES (?, ?, ?, ?, 1, 'draft', ?, ?)`)
          .bind(content.id, content.name.slice(0, 160), content.description.slice(0, 500), documentJson, String(login).slice(0, 160), now),
        db.prepare(`/* backfill-content-revision */ INSERT OR IGNORE INTO entity_revisions
          (content_type, content_id, revision, document_json, created_by, created_at, action)
          SELECT ?, ?, 1, ?, ?, ?, 'embedded-backfill'
           WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND revision = 1 AND document_json = ?)`)
          .bind(content.type, content.id, documentJson, String(login).slice(0, 160), now, content.id, documentJson),
      );
    }
    if (statements.length) await db.batch(statements);
  }
  return { inserted: missing.length, items: await listContentItems(db, { includeContent: true }) };
}
