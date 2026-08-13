import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractEmbeddedContentDocuments } from '@franz-lola/content-model';

const TABLES = { character: 'characters', tileset: 'tilesets', block: 'blocks', animation: 'animations', cutscene: 'cutscenes', object: 'assets', event: 'events' };
const quote = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;

function wrangler(args, { quiet = false } = {}) {
  const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `wrangler exit ${result.status}`);
  if (!quiet && result.stdout.trim()) process.stdout.write(result.stdout);
  return result.stdout;
}

const raw = wrangler(['d1', 'execute', 'LEVEL_DB', '--remote', '--command', "SELECT id, document_json FROM level_drafts WHERE deleted_at IS NULL ORDER BY id", '--json'], { quiet: true });
const rows = JSON.parse(raw)?.[0]?.results ?? [];
if (!rows.length) throw new Error('Remote D1 enthält keine Level-Entwürfe.');
const documents = [...new Map(rows.flatMap((row) => extractEmbeddedContentDocuments(JSON.parse(row.document_json)))
  .map((document) => [`${document.type}:${document.id}`, document])).values()];
const now = new Date().toISOString();

for (let offset = 0; offset < documents.length; offset += 40) {
  const file = join(tmpdir(), `franz-lola-content-backfill-${process.pid}-${offset}.sql`);
  const sql = documents.slice(offset, offset + 40).flatMap((content) => {
    const table = TABLES[content.type];
    const json = JSON.stringify(content);
    return [
      `INSERT OR IGNORE INTO ${table} (id, display_name, description, document_json, revision, status, updated_by, updated_at) VALUES (${quote(content.id)}, ${quote(content.name.slice(0, 160))}, ${quote(content.description.slice(0, 500))}, ${quote(json)}, 1, 'draft', 'embedded-level-migration', ${quote(now)});`,
      `INSERT OR IGNORE INTO entity_revisions (content_type, content_id, revision, document_json, created_by, created_at, action) SELECT ${quote(content.type)}, ${quote(content.id)}, 1, ${quote(json)}, 'embedded-level-migration', ${quote(now)}, 'embedded-backfill' WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ${quote(content.id)} AND revision = 1 AND document_json = ${quote(json)});`,
    ];
  }).join('\n');
  writeFileSync(file, `${sql}\n`, 'utf8');
  try { wrangler(['d1', 'execute', 'LEVEL_DB', '--remote', '--file', file, '--yes']); }
  finally { unlinkSync(file); }
}

const counts = wrangler(['d1', 'execute', 'LEVEL_DB', '--remote', '--command', "SELECT json_object('characters',(SELECT count(*) FROM characters),'tilesets',(SELECT count(*) FROM tilesets),'blocks',(SELECT count(*) FROM blocks),'animations',(SELECT count(*) FROM animations),'cutscenes',(SELECT count(*) FROM cutscenes),'assets',(SELECT count(*) FROM assets),'events',(SELECT count(*) FROM events)) AS counts", '--json'], { quiet: true });
console.log(JSON.parse(counts)?.[0]?.results?.[0]?.counts ?? '{}');
