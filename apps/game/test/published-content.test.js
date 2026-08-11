import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentPublicationPath, validateContentDocument } from '@franz-lola/content-model';

const contentDirectories = {
  character: 'characters',
  tileset: 'tilesets',
  block: 'blocks',
  animation: 'animations',
  cutscene: 'cutscenes',
  object: 'objects',
  event: 'events',
};

test('every optional published library document is canonical and self-contained', async () => {
  for (const [type, directory] of Object.entries(contentDirectories)) {
    const absolute = fileURLToPath(new URL(`../../../content/${directory}/`, import.meta.url));
    const filenames = await readdir(absolute).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error));
    for (const filename of filenames.filter((name) => name.endsWith(`.${type}.json`))) {
      const raw = JSON.parse(await readFile(resolve(absolute, filename), 'utf8'));
      const result = validateContentDocument(raw);
      assert.equal(result.ok, true, `${filename}: ${result.errors.join(' ')}`);
      assert.equal(raw.type, type);
      assert.equal(contentPublicationPath(raw.type, raw.id), `content/${directory}/${filename}`);
      assert.ok(raw.document && typeof raw.document === 'object');
    }
  }
});
