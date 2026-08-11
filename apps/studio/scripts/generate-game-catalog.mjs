import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { jsonValueSha256, readContentCatalog } from '../../../tools/content-checksums.mjs';

const STUDIO_LEVEL_ORDER = Object.freeze([
  'home', 'hals', 'oberhaus', 'dom', 'dreifluesseeck', 'uni', 'bschuett', 'tabakfabrik', 'zauberberg',
]);
const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = resolve(studioRoot, '../..');
const outputPath = resolve(studioRoot, 'src/data/content-catalog.generated.json');
const catalog = await readContentCatalog(pathToFileURL(`${monorepoRoot}${sep}`));
const levelsById = new Map(catalog.levels.map((level) => [level.id, level]));
const levels = STUDIO_LEVEL_ORDER.map((id) => levelsById.get(id));
if (levels.some((level) => !level)) throw new Error('Root content does not match the Studio level order manifest.');
const document = {
  kind: 'franz-lola-level-catalog',
  schemaVersion: 1,
  generatedFrom: 'content/levels/*.level.json',
  sourceHash: jsonValueSha256(levels),
  ...catalog,
  levels,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`Generated studio catalog with ${document.levels.length} levels and ${document.objects.length} reusable objects from root content: ${outputPath}`);
