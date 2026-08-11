import { access, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateContentDocument, validateLevelDocument } from '@franz-lola/content-model';
import {
  CONTENT_CATALOG_LAYOUT,
  jsonValueSha256,
  readContentCatalog,
  stableStringifyJsonValue,
} from './content-checksums.mjs';

const LEVEL_IDS = Object.freeze([
  'bschuett', 'dom', 'dreifluesseeck', 'hals', 'home', 'oberhaus', 'tabakfabrik', 'uni', 'zauberberg',
]);
const OBJECT_IDS = Object.freeze([
  'music-note', 'zauberberg-note', 'stage-lights', 'kingfisher', 'tree', 'bench', 'sign', 'text-block',
  'brahmahof-mailbox', 'concert-speaker', 'university-book', 'factory-steam', 'river-spark', 'oberhaus-flag',
  'cathedral-bell', 'lola-stick',
]);
const EXPECTED_COUNTS = Object.freeze({
  levels: 9,
  characters: 0,
  tilesets: 0,
  blocks: 0,
  animations: 0,
  cutscenes: 0,
  objects: 16,
  events: 0,
});

export const EXPECTED_SOURCE_MANIFEST = Object.freeze({
  sourcePaths: Object.freeze([
    'apps/game/src/data/levels/bschuett.level.json',
    'apps/game/src/data/levels/dom.level.json',
    'apps/game/src/data/levels/dreifluesseeck.level.json',
    'apps/game/src/data/levels/hals.level.json',
    'apps/game/src/data/levels/home.level.json',
    'apps/game/src/data/levels/oberhaus.level.json',
    'apps/game/src/data/levels/tabakfabrik.level.json',
    'apps/game/src/data/levels/uni.level.json',
    'apps/game/src/data/levels/zauberberg.level.json',
    'apps/studio/src/data/passau-levels.json',
    'apps/studio/src/object-library.js',
  ]),
  counts: Object.freeze({ levels: 9, studioLevels: 9, objects: 16 }),
  valueSha256: Object.freeze({
    levels: 'c53c35f2f266a560706a4dd06a69fb5ed678a630f6faaeabbc502a47d06a8b1d',
    studioLevels: '8d846f6d03a132edbd62188543b5008e024d233ac82da1db4883a884a4e90bcd',
    objects: 'e4645e201e6cfd4ae992783ef8f849c55144a6b9c0b31b8d168be8635e18c77c',
  }),
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const canonicalId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
const rootPath = (rootUrl) => rootUrl instanceof URL ? fileURLToPath(rootUrl) : path.resolve(String(rootUrl));
const relativePath = (value) => value.replaceAll('\\', '/');

async function exists(absolute) {
  try { await access(absolute); return true; } catch { return false; }
}

function sameValue(left, right) {
  return stableStringifyJsonValue(left) === stableStringifyJsonValue(right);
}

function assertSourcePaths(actual, expected = EXPECTED_SOURCE_MANIFEST.sourcePaths) {
  if (!sameValue(actual, expected)) {
    throw new Error(`Source paths differ from the recorded manifest: ${JSON.stringify(actual)}`);
  }
}

export function assertSourceManifest(actual, expected = EXPECTED_SOURCE_MANIFEST) {
  assertSourcePaths(actual.sourcePaths, expected.sourcePaths);
  if (!sameValue(actual.counts, expected.counts)) {
    throw new Error(`Source counts differ from the recorded manifest: ${JSON.stringify(actual.counts)}`);
  }
  if (!sameValue(actual.valueSha256, expected.valueSha256)) {
    throw new Error(`Manifest hashes differ from the recorded source values: ${JSON.stringify(actual.valueSha256)}`);
  }
}

function reusableObjectDocument(asset) {
  return {
    kind: 'franz-lola-content',
    schemaVersion: 2,
    type: 'object',
    id: asset.id,
    name: asset.name,
    description: asset.description,
    document: clone(asset),
    dependencies: [],
    references: [],
  };
}

async function inspectLegacySourceLayout(root) {
  const gameDirectory = path.join(root, 'apps/game/src/data/levels');
  const gameNames = (await readdir(gameDirectory).catch((error) => error?.code === 'ENOENT' ? [] : Promise.reject(error)))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const sourcePaths = gameNames.map((name) => relativePath(path.relative(root, path.join(gameDirectory, name))));
  const studioCatalogPath = path.join(root, 'apps/studio/src/data/passau-levels.json');
  const objectModulePath = path.join(root, 'apps/studio/src/object-library.js');
  if (await exists(studioCatalogPath)) sourcePaths.push(relativePath(path.relative(root, studioCatalogPath)));
  if (await exists(objectModulePath)) sourcePaths.push(relativePath(path.relative(root, objectModulePath)));
  sourcePaths.sort();
  return { gameDirectory, gameNames, studioCatalogPath, objectModulePath, sourcePaths };
}

async function inspectLegacySources(root, layout) {
  const { gameDirectory, gameNames, studioCatalogPath, objectModulePath, sourcePaths } = layout;
  const levels = await Promise.all(gameNames.map(async (name) => JSON.parse(await readFile(path.join(gameDirectory, name), 'utf8'))));
  const studioCatalog = JSON.parse(await readFile(studioCatalogPath, 'utf8'));
  const module = await import(`${pathToFileURL(objectModulePath).href}?content-migration`);
  const objects = clone(module.DEFAULT_OBJECT_ASSETS ?? []);
  const studioLevels = Array.isArray(studioCatalog?.levels) ? studioCatalog.levels : [];
  const manifest = {
    sourcePaths,
    counts: { levels: levels.length, studioLevels: studioLevels.length, objects: objects.length },
    valueSha256: {
      levels: jsonValueSha256(levels),
      studioLevels: jsonValueSha256(studioLevels),
      objects: jsonValueSha256(objects),
    },
  };
  return { levels, studioLevels, objects, manifest };
}

function assertIds(values, expected, label) {
  const ids = values.map((value) => value?.id);
  if (ids.some((id) => !canonicalId(id))) throw new Error(`${label} contains invalid IDs: ${JSON.stringify(ids)}`);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains colliding IDs: ${JSON.stringify(ids)}`);
  if (!sameValue([...ids].sort(), [...expected].sort())) throw new Error(`${label} IDs differ from the recorded manifest: ${JSON.stringify(ids)}`);
}

function validateSources(source) {
  assertSourceManifest(source.manifest);
  assertIds(source.levels, LEVEL_IDS, 'Game levels');
  assertIds(source.studioLevels, LEVEL_IDS, 'Studio levels');
  assertIds(source.objects, OBJECT_IDS, 'Studio objects');
  source.levels.forEach((level) => {
    const result = validateLevelDocument(level);
    if (!result.ok) throw new Error(`Invalid game level ${level?.id ?? '<unknown>'}: ${result.errors.join(' ')}`);
  });
  source.studioLevels.forEach((level) => {
    const result = validateLevelDocument(level);
    if (!result.ok) throw new Error(`Invalid studio level ${level?.id ?? '<unknown>'}: ${result.errors.join(' ')}`);
  });
  source.objects.forEach((asset) => {
    const result = validateContentDocument(reusableObjectDocument(asset));
    if (!result.ok) throw new Error(`Invalid reusable studio object ${asset?.id ?? '<unknown>'}: ${result.errors.join(' ')}`);
  });
}

function catalogCounts(catalog) {
  return Object.fromEntries(CONTENT_CATALOG_LAYOUT.map(({ key }) => [key, catalog[key].length]));
}

function reportEntries(source, catalog) {
  const levelSource = new Map(source.levels.map((level) => [level.id, level]));
  const objectSource = new Map(source.objects.map((asset) => [asset.id, asset]));
  return {
    levels: catalog.levels.map((level) => ({
      type: 'level',
      id: level.id,
      sourcePath: `apps/game/src/data/levels/${level.id}.level.json`,
      canonicalPath: `content/levels/${level.id}.level.json`,
      sourceValueSha256: jsonValueSha256(levelSource.get(level.id)),
      canonicalValueSha256: jsonValueSha256(level),
    })),
    objects: catalog.objects.map((document) => ({
      type: 'object',
      id: document.id,
      sourcePath: 'apps/studio/src/object-library.js#DEFAULT_OBJECT_ASSETS',
      canonicalPath: `content/objects/${document.id}.object.json`,
      sourceValueSha256: jsonValueSha256(objectSource.get(document.id)),
      canonicalValueSha256: jsonValueSha256(document.document),
    })),
  };
}

function buildReport(source, catalog) {
  const entries = reportEntries(source, catalog);
  return {
    schemaVersion: 1,
    recordedAt: '2026-08-11',
    sourceManifest: clone(EXPECTED_SOURCE_MANIFEST),
    counts: catalogCounts(catalog),
    levels: entries.levels,
    characters: [],
    tilesets: [],
    blocks: [],
    animations: [],
    cutscenes: [],
    objects: entries.objects,
    events: [],
  };
}

function verifyReport(report, catalog) {
  if (report?.schemaVersion !== 1) throw new Error('Migration report schemaVersion must be 1.');
  if (!sameValue(report.sourceManifest, EXPECTED_SOURCE_MANIFEST)) throw new Error('Migration report source manifest differs from the recorded manifest.');
  const counts = catalogCounts(catalog);
  if (!sameValue(counts, EXPECTED_COUNTS) || !sameValue(report.counts, EXPECTED_COUNTS)) {
    throw new Error(`Canonical content counts differ from the manifest: ${JSON.stringify(counts)}`);
  }
  if (jsonValueSha256(catalog.levels) !== EXPECTED_SOURCE_MANIFEST.valueSha256.levels) {
    throw new Error('Canonical level manifest hash differs from the recorded source values.');
  }
  if (jsonValueSha256(OBJECT_IDS.map((id) => catalog.objects.find((document) => document.id === id)?.document)) !== EXPECTED_SOURCE_MANIFEST.valueSha256.objects) {
    throw new Error('Canonical object manifest hash differs from the recorded source values.');
  }
  for (const [key, documents] of [['levels', catalog.levels], ['objects', catalog.objects]]) {
    const byId = new Map(documents.map((document) => [document.id, document]));
    if (report[key]?.length !== documents.length) throw new Error(`Migration report ${key} count differs from canonical content.`);
    for (const entry of report[key]) {
      const document = byId.get(entry.id);
      const value = key === 'objects' ? document?.document : document;
      if (!document || entry.canonicalValueSha256 !== jsonValueSha256(value)) {
        throw new Error(`Migration report checksum differs for ${entry.type}:${entry.id}.`);
      }
      if (entry.sourceValueSha256 !== entry.canonicalValueSha256) {
        throw new Error(`Source and canonical JSON values differ for ${entry.type}:${entry.id}.`);
      }
    }
  }
  return counts;
}

async function optionalMetadata(absolute) {
  try {
    return await lstat(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function canonicalWriteTargets(source) {
  const targets = Object.fromEntries(CONTENT_CATALOG_LAYOUT.map(({ key }) => [key, []]));
  targets.levels = source.levels.map((level) => `${level.id}.level.json`);
  targets.objects = source.objects.map((asset) => `${asset.id}.object.json`);
  for (const { key } of CONTENT_CATALOG_LAYOUT.filter(({ key }) => !['levels', 'objects'].includes(key))) {
    targets[key] = ['.gitkeep'];
  }
  for (const [key, names] of Object.entries(targets)) {
    const foldedNames = names.map((name) => name.toLowerCase());
    if (new Set(foldedNames).size !== foldedNames.length) {
      throw new Error(`Canonical target names collide case-insensitively in content/${key}: ${JSON.stringify(names)}`);
    }
  }
  return targets;
}

async function assertReportTargetAvailable(root, reportPath) {
  const reportDirectory = path.dirname(reportPath);
  const metadata = await optionalMetadata(reportDirectory);
  if (!metadata) return;
  if (!metadata.isDirectory()) throw new Error(`Canonical report directory is not a directory: ${relativePath(path.relative(root, reportDirectory))}`);
  const target = path.basename(reportPath).toLowerCase();
  const collision = (await readdir(reportDirectory)).find((name) => name.toLowerCase() === target);
  if (collision) throw new Error(`--write refuses to overwrite canonical report target: ${relativePath(path.relative(root, path.join(reportDirectory, collision)))}`);
}

async function assertContentTargetsAvailable(root, targets) {
  const contentRoot = path.join(root, 'content');
  const contentMetadata = await optionalMetadata(contentRoot);
  if (!contentMetadata) return;
  if (!contentMetadata.isDirectory()) throw new Error('Canonical content root is not a directory: content');
  const rootEntries = await readdir(contentRoot, { withFileTypes: true });
  for (const { key } of CONTENT_CATALOG_LAYOUT) {
    const directoryEntry = rootEntries.find((entry) => entry.name.toLowerCase() === key.toLowerCase());
    if (!directoryEntry) continue;
    if (directoryEntry.name !== key || !directoryEntry.isDirectory()) {
      throw new Error(`Canonical directory collision at content/${directoryEntry.name}`);
    }
    const directory = path.join(contentRoot, directoryEntry.name);
    const planned = new Set(targets[key].map((name) => name.toLowerCase()));
    const collision = (await readdir(directory)).find((name) => {
      const folded = name.toLowerCase();
      return folded.endsWith('.json') || planned.has(folded);
    });
    if (collision) throw new Error(`--write refuses a collision in content/${key}: ${collision}`);
  }
}

export async function assertCanonicalWriteTargets(rootUrl, source) {
  const root = rootPath(rootUrl);
  const reportPath = path.join(root, 'docs/migration/content-checksums.json');
  const targets = canonicalWriteTargets(source);
  await assertReportTargetAvailable(root, reportPath);
  await assertContentTargetsAvailable(root, targets);
}

export async function writeCanonicalCatalog(rootUrl, source) {
  const root = rootPath(rootUrl);
  const reportPath = path.join(root, 'docs/migration/content-checksums.json');
  await assertCanonicalWriteTargets(root, source);
  for (const { key } of CONTENT_CATALOG_LAYOUT) {
    await mkdir(path.join(root, 'content', key), { recursive: true });
  }
  await mkdir(path.dirname(reportPath), { recursive: true });
  for (const level of source.levels) {
    await writeFile(path.join(root, 'content/levels', `${level.id}.level.json`), `${JSON.stringify(level, null, 2)}\n`, 'utf8');
  }
  for (const asset of source.objects) {
    const document = reusableObjectDocument(asset);
    await writeFile(path.join(root, 'content/objects', `${asset.id}.object.json`), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  }
  for (const { key } of CONTENT_CATALOG_LAYOUT.filter(({ key }) => !['levels', 'objects'].includes(key))) {
    await writeFile(path.join(root, 'content', key, '.gitkeep'), '', 'utf8');
  }
  const catalog = await readContentCatalog(pathToFileURL(`${root}${path.sep}`));
  const report = buildReport(source, catalog);
  verifyReport(report, catalog);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { mode: 'write', state: 'written', counts: report.counts, report };
}

export async function migrateContentCatalog(rootUrl, { mode } = {}) {
  if (!['check', 'write'].includes(mode)) throw new Error('Usage: node tools/migrate-content-catalog.mjs --check|--write');
  const root = rootPath(rootUrl);
  const reportPath = path.join(root, 'docs/migration/content-checksums.json');
  if (mode === 'write') {
    const sourceLayout = await inspectLegacySourceLayout(root);
    assertSourcePaths(sourceLayout.sourcePaths);
    const source = await inspectLegacySources(root, sourceLayout);
    validateSources(source);
    return writeCanonicalCatalog(root, source);
  }
  if (!(await exists(reportPath))) {
    const sourceLayout = await inspectLegacySourceLayout(root);
    assertSourcePaths(sourceLayout.sourcePaths);
    const source = await inspectLegacySources(root, sourceLayout);
    validateSources(source);
    return { mode: 'check', state: 'ready', counts: clone(EXPECTED_COUNTS), sourceManifest: source.manifest };
  }
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const catalog = await readContentCatalog(pathToFileURL(`${root}${path.sep}`));
  return { mode: 'check', state: 'verified', counts: verifyReport(report, catalog), report };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const mode = process.argv.length === 3 && process.argv[2] === '--check'
    ? 'check'
    : process.argv.length === 3 && process.argv[2] === '--write'
      ? 'write'
      : '';
  const result = await migrateContentCatalog(new URL('../', import.meta.url), { mode });
  console.log(JSON.stringify({ mode: result.mode, state: result.state, counts: result.counts }));
}
