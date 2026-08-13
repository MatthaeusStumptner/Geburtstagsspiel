import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assemblePages } from '../scripts/assemble-pages.mjs';

test('Pages artifact exposes Studio at /studio/ without replacing the Game root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'franz-lola-pages-'));
  const gameDist = path.join(root, 'game');
  const studioDist = path.join(root, 'studio-source');
  try {
    await mkdir(path.join(gameDist, 'studio'), { recursive: true });
    await mkdir(path.join(studioDist, 'assets'), { recursive: true });
    await writeFile(path.join(gameDist, 'index.html'), 'game');
    await writeFile(path.join(gameDist, 'studio', 'stale.txt'), 'stale');
    await writeFile(path.join(studioDist, 'index.html'), 'studio');
    await writeFile(path.join(studioDist, 'assets', 'app.js'), 'studio-asset');

    const result = await assemblePages({ gameDist, studioDist });

    assert.equal(result.studioPath, path.join(gameDist, 'studio'));
    assert.equal(await readFile(path.join(gameDist, 'index.html'), 'utf8'), 'game');
    assert.equal(await readFile(path.join(gameDist, 'studio', 'index.html'), 'utf8'), 'studio');
    assert.equal(await readFile(path.join(gameDist, 'studio', 'assets', 'app.js'), 'utf8'), 'studio-asset');
    await assert.rejects(readFile(path.join(gameDist, 'studio', 'stale.txt')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
