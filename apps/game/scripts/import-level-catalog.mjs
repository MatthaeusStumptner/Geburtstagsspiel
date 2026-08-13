import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { jsonValueSha256, readContentCatalog } from '../../../tools/content-checksums.mjs';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = resolve(gameRoot, '../..');
const outputPath = resolve(gameRoot, 'src/data/level-catalog.generated.json');
const catalog = await readContentCatalog(pathToFileURL(`${monorepoRoot}${sep}`));
const document = {
  kind: 'franz-lola-level-catalog',
  schemaVersion: 1,
  generatedFrom: 'content/levels/*.level.json',
  sourceHash: jsonValueSha256(catalog.levels),
  levels: catalog.levels,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`Generated game catalog with ${document.levels.length} levels from root content: ${outputPath}`);
