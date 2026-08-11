import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contentPublicationPath,
  validateContentDocument,
  validateLevelDocument,
} from '@franz-lola/content-model';

export const CONTENT_CATALOG_LAYOUT = Object.freeze([
  Object.freeze({ key: 'levels', type: 'level', extension: 'level' }),
  Object.freeze({ key: 'characters', type: 'character', extension: 'character' }),
  Object.freeze({ key: 'tilesets', type: 'tileset', extension: 'tileset' }),
  Object.freeze({ key: 'blocks', type: 'block', extension: 'block' }),
  Object.freeze({ key: 'animations', type: 'animation', extension: 'animation' }),
  Object.freeze({ key: 'cutscenes', type: 'cutscene', extension: 'cutscene' }),
  Object.freeze({ key: 'objects', type: 'object', extension: 'object' }),
  Object.freeze({ key: 'events', type: 'event', extension: 'event' }),
]);

function stableJson(value, stack) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON values may contain only finite numbers.');
    return JSON.stringify(value);
  }
  if (!value || typeof value !== 'object' || typeof value.toJSON === 'function') {
    throw new TypeError('Only plain JSON values can be hashed.');
  }
  if (stack.has(value)) throw new TypeError('Cyclic values are not valid JSON.');
  stack.add(value);
  let result;
  if (Array.isArray(value)) {
    result = `[${value.map((entry) => stableJson(entry, stack)).join(',')}]`;
  } else {
    const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key], stack)}`);
    result = `{${entries.join(',')}}`;
  }
  stack.delete(value);
  return result;
}

export function stableStringifyJsonValue(value) {
  return stableJson(value, new Set());
}

export function jsonValueSha256(value) {
  return createHash('sha256').update(stableStringifyJsonValue(value), 'utf8').digest('hex');
}

function rootPath(rootUrl) {
  if (rootUrl instanceof URL) return fileURLToPath(rootUrl);
  return path.resolve(String(rootUrl));
}

async function readTypeDirectory(root, layout) {
  const directory = path.join(root, 'content', layout.key);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Canonical content directory is missing: content/${layout.key}`);
    throw error;
  }
  const suffix = `.${layout.extension}.json`;
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
  const documents = [];
  const ids = new Set();
  for (const filename of filenames) {
    if (!filename.endsWith(suffix)) throw new Error(`Unexpected JSON file in content/${layout.key}: ${filename}`);
    const raw = JSON.parse(await readFile(path.join(directory, filename), 'utf8'));
    const validation = layout.type === 'level' ? validateLevelDocument(raw) : validateContentDocument(raw);
    if (!validation.ok) throw new Error(`Invalid canonical ${layout.type} ${filename}: ${validation.errors.join(' ')}`);
    if (layout.type !== 'level' && raw.type !== layout.type) {
      throw new Error(`Canonical type mismatch in content/${layout.key}/${filename}: ${String(raw.type)}`);
    }
    if (ids.has(raw.id)) throw new Error(`Duplicate canonical ${layout.type} id: ${raw.id}`);
    ids.add(raw.id);
    const expectedPath = contentPublicationPath({ type: layout.type, id: raw.id });
    if (expectedPath !== `content/${layout.key}/${filename}`) {
      throw new Error(`Canonical path mismatch: expected ${expectedPath}, found content/${layout.key}/${filename}`);
    }
    documents.push(raw);
  }
  return documents.sort((left, right) => left.id.localeCompare(right.id));
}

export async function readContentCatalog(rootUrl) {
  const root = rootPath(rootUrl);
  return Object.fromEntries(await Promise.all(CONTENT_CATALOG_LAYOUT.map(async (layout) => [
    layout.key,
    await readTypeDirectory(root, layout),
  ])));
}
