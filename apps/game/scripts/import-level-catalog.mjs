import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLevelDocument } from '@franz-lola/content-model';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(process.argv[2] ?? '');
const outputDirectory = resolve(projectRoot, 'src/data/levels');

if (!process.argv[2]) {
  throw new Error('Aufruf: npm run levels:import -- <passau-levels.json>');
}

const catalog = JSON.parse(await readFile(sourcePath, 'utf8'));
if (catalog?.kind !== 'franz-lola-level-catalog' || !Array.isArray(catalog.levels)) {
  throw new Error('Die Eingabedatei ist kein Franz-und-Lola-Levelkatalog.');
}

await mkdir(outputDirectory, { recursive: true });
const ids = new Set();
for (const [mapOrder, input] of catalog.levels.entries()) {
  const result = validateLevelDocument(input);
  if (!result.ok) throw new Error(`${input?.id ?? `Level ${mapOrder + 1}`}: ${result.errors.join(' ')}`);
  if (ids.has(result.value.id)) throw new Error(`Doppelte Level-ID: ${result.value.id}`);
  ids.add(result.value.id);
  const level = {
    ...result.value,
    source: { ...result.value.source, mapOrder },
  };
  const destination = resolve(outputDirectory, `${level.id}.level.json`);
  if (!destination.startsWith(`${outputDirectory}\\`) && !destination.startsWith(`${outputDirectory}/`)) {
    throw new Error(`Unsicherer Levelpfad: ${destination}`);
  }
  await writeFile(destination, `${JSON.stringify(level, null, 2)}\n`, 'utf8');
}

console.log(`${ids.size} Level nach ${outputDirectory} importiert.`);
