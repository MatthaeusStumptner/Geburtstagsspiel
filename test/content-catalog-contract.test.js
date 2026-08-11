import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  assertSourceManifest,
  migrateContentCatalog,
} from '../tools/migrate-content-catalog.mjs';
import {
  jsonValueSha256,
  readContentCatalog,
  stableStringifyJsonValue,
} from '../tools/content-checksums.mjs';

const execFileAsync = promisify(execFile);
const rootUrl = new URL('../', import.meta.url);

async function temporaryRoot(testContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'franz-lola-content-catalog-'));
  testContext.after(async () => {
    const resolved = path.resolve(root);
    const temporaryDirectory = `${path.resolve(os.tmpdir())}${path.sep}`;
    assert.equal(resolved.startsWith(temporaryDirectory), true, resolved);
    assert.equal(path.basename(resolved).startsWith('franz-lola-content-catalog-'), true, resolved);
    await rm(resolved, { recursive: true, force: true });
  });
  return { root, url: pathToFileURL(`${root}${path.sep}`) };
}

async function captureFailure(operation) {
  let failure;
  try {
    await operation;
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof Error, 'operation must reject');
  return failure;
}

async function treeSnapshot(directoryUrl) {
  const entries = [];
  async function walk(url, prefix = '') {
    const children = (await readdir(url, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of children) {
      const childUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        entries.push({ relative: `${relative}/`, type: 'directory' });
        await walk(childUrl, `${relative}/`);
      } else {
        const metadata = await stat(childUrl);
        entries.push({ relative, value: await readFile(childUrl, 'utf8'), mtimeMs: metadata.mtimeMs });
      }
    }
  }
  await walk(directoryUrl);
  return entries;
}

test('canonical levels preserve every source JSON value', async () => {
  const report = JSON.parse(await readFile(new URL('../docs/migration/content-checksums.json', import.meta.url), 'utf8'));
  assert.equal(report.levels.length, 9);
  for (const level of report.levels) {
    assert.equal(level.sourceValueSha256, level.canonicalValueSha256, level.id);
  }
});

test('stable JSON hashes ignore object key order but preserve array order', () => {
  const left = { z: [3, 2, 1], a: { second: true, first: 'Franz & Lola' } };
  const right = { a: { first: 'Franz & Lola', second: true }, z: [3, 2, 1] };
  assert.equal(stableStringifyJsonValue(left), '{"a":{"first":"Franz & Lola","second":true},"z":[3,2,1]}');
  assert.equal(jsonValueSha256(left), jsonValueSha256(right));
  assert.notEqual(jsonValueSha256(left), jsonValueSha256({ ...right, z: [1, 2, 3] }));
});

test('canonical catalog exposes every authored level and reusable studio object', async () => {
  const catalog = await readContentCatalog(rootUrl);
  assert.deepEqual(Object.fromEntries(Object.entries(catalog).map(([type, documents]) => [type, documents.length])), {
    levels: 9,
    characters: 0,
    tilesets: 0,
    blocks: 0,
    animations: 0,
    cutscenes: 0,
    objects: 16,
    events: 0,
  });
  assert.deepEqual(catalog.levels.map((level) => level.id), [
    'bschuett', 'dom', 'dreifluesseeck', 'hals', 'home', 'oberhaus', 'tabakfabrik', 'uni', 'zauberberg',
  ]);
  assert.deepEqual(catalog.objects.map((object) => object.id), [
    'bench', 'brahmahof-mailbox', 'cathedral-bell', 'concert-speaker', 'factory-steam', 'kingfisher',
    'lola-stick', 'music-note', 'oberhaus-flag', 'river-spark', 'sign', 'stage-lights', 'text-block',
    'tree', 'university-book', 'zauberberg-note',
  ]);
});

test('write mode fails closed on source path, count, or manifest hash drift', () => {
  const expected = {
    sourcePaths: ['game/a.level.json', 'studio/catalog.json'],
    counts: { levels: 1, objects: 2 },
    valueSha256: { levels: 'level-hash', objects: 'object-hash' },
  };
  assert.doesNotThrow(() => assertSourceManifest(expected, structuredClone(expected)));
  assert.throws(() => assertSourceManifest({ ...expected, sourcePaths: ['game/a.level.json'] }, expected), /source paths/i);
  assert.throws(() => assertSourceManifest({ ...expected, counts: { levels: 2, objects: 2 } }, expected), /source counts/i);
  assert.throws(() => assertSourceManifest({ ...expected, valueSha256: { levels: 'changed', objects: 'object-hash' } }, expected), /manifest hashes/i);
});

test('check mode validates the migrated catalog without writing', async () => {
  const reportUrl = new URL('../docs/migration/content-checksums.json', import.meta.url);
  const before = {
    content: await treeSnapshot(new URL('../content/', import.meta.url)),
    report: await readFile(reportUrl, 'utf8'),
    reportMtimeMs: (await stat(reportUrl)).mtimeMs,
  };
  const result = await migrateContentCatalog(rootUrl, { mode: 'check' });
  assert.deepEqual(result.counts, { levels: 9, characters: 0, tilesets: 0, blocks: 0, animations: 0, cutscenes: 0, objects: 16, events: 0 });
  assert.deepEqual({
    content: await treeSnapshot(new URL('../content/', import.meta.url)),
    report: await readFile(reportUrl, 'utf8'),
    reportMtimeMs: (await stat(reportUrl)).mtimeMs,
  }, before);
});

test('catalog migrator CLI rejects unknown modes', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ['tools/migrate-content-catalog.mjs', '--dry-run'], { cwd: new URL('../', import.meta.url) }),
    /--check|--write/,
  );
});
test('a late canonical directory conflict leaves the entire target root untouched', async (testContext) => {
  const migration = await import('../tools/migrate-content-catalog.mjs');
  const catalog = await readContentCatalog(rootUrl);
  const source = { levels: catalog.levels, objects: catalog.objects.map((entry) => entry.document) };
  const temporary = await temporaryRoot(testContext);
  await mkdir(path.join(temporary.root, 'content'), { recursive: true });
  await writeFile(path.join(temporary.root, 'content/events'), 'occupied by a file\n', 'utf8');
  const before = await treeSnapshot(temporary.url);

  const failure = await captureFailure(migration.writeCanonicalCatalog(temporary.url, source));
  assert.deepEqual(await treeSnapshot(temporary.url), before);
  assert.match(failure.message, /content[/\\]events|canonical directory/i);
});

test('case-variant canonical JSON collisions fail closed without mutation', async (testContext) => {
  const migration = await import('../tools/migrate-content-catalog.mjs');
  const catalog = await readContentCatalog(rootUrl);
  const source = { levels: catalog.levels, objects: catalog.objects.map((entry) => entry.document) };
  const temporary = await temporaryRoot(testContext);
  await mkdir(path.join(temporary.root, 'content/levels'), { recursive: true });
  await writeFile(path.join(temporary.root, 'content/levels/HOME.LEVEL.JSON'), '{"sentinel":true}\n', 'utf8');
  const before = await treeSnapshot(temporary.url);

  const failure = await captureFailure(migration.writeCanonicalCatalog(temporary.url, source));
  assert.deepEqual(await treeSnapshot(temporary.url), before);
  assert.match(failure.message, /HOME\.LEVEL\.JSON|non-empty canonical directory/i);
});

test('post-migration write rejects missing source paths before importing Studio consumers', async (testContext) => {
  const temporary = await temporaryRoot(testContext);
  const studioSource = path.join(temporary.root, 'apps/studio/src');
  await mkdir(studioSource, { recursive: true });
  await writeFile(path.join(temporary.root, 'package.json'), '{"type":"module"}\n', 'utf8');
  await writeFile(
    path.join(studioSource, 'object-library.js'),
    "import './data/content-catalog.generated.json' with { type: 'json' };\nexport const DEFAULT_OBJECT_ASSETS = [];\n",
    'utf8',
  );
  const before = await treeSnapshot(temporary.url);

  const failure = await captureFailure(migrateContentCatalog(temporary.url, { mode: 'write' }));
  assert.deepEqual(await treeSnapshot(temporary.url), before);
  assert.match(failure.message, /source paths differ/i);
});
