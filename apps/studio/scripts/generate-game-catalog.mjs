import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { storyContent } from '../src/story-content.js';

const sourcePath = resolve(process.argv[2] ?? 'src/data/passau-levels.json');
const outputPath = resolve(process.argv[3] ?? 'src/data/passau-levels.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
if (source?.kind !== 'franz-lola-level-catalog' || !Array.isArray(source.levels)) {
  throw new Error('Die Quelle ist kein Franz-und-Lola-Levelkatalog.');
}

const levels = source.levels.map((level) => {
  const story = storyContent(level.id, level.actors.player);
  const events = (level.events ?? []).filter((event) => event.id !== story.event?.id);
  return {
    ...level,
    decorations: story.decorations,
    theme: { ...level.theme, elements: (level.theme.elements ?? []).filter((element) => element.id !== 'stage-note'), edgeEffects: story.edgeEffects ?? [] },
    actors: { ...level.actors, cats: level.actors.cats.map((cat, index) => ({ ...cat, ...(story.catEffects?.[index] ? { effects: story.catEffects[index] } : {}) })) },
    events: [...events, ...(story.event ? [story.event] : [])],
    cutscenes: story.cutscene ? [story.cutscene] : [],
  };
});

const geometryFingerprint = JSON.stringify(levels.map((level) => ({ id: level.id, board: level.board, location: level.location, theme: level.theme.id })));
const catalog = {
  ...source,
  generatedFrom: 'Pacman_clone_level_editor/src/data/passau-levels.json + src/story-content.js',
  sourceHash: createHash('sha256').update(geometryFingerprint).digest('hex'),
  levels,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`Katalog mit ${levels.length} Leveln und individuellen Cutscenes: ${outputPath}`);
