import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const components = join(process.cwd(), 'src', 'components');
const sources = readdirSync(components).filter((name) => name.endsWith('.svelte'))
  .map((name) => ({ name, source: readFileSync(join(components, name), 'utf8') }));

function inputTags(type) {
  return sources.flatMap(({ name, source }) => [...source.matchAll(new RegExp(`<input[^>]*type=["']${type}["'][^>]*>`, 'g'))]
    .map((match) => ({ name, tag: match[0] })));
}

test('all continuous color and range settings update on input rather than blur', () => {
  for (const type of ['color', 'range']) {
    const tags = inputTags(type);
    assert.ok(tags.length > 0, `${type} controls expected`);
    tags.forEach(({ name, tag }) => assert.match(tag, /(?:oninput|bind:value)=/, `${name}: ${tag}`));
  }
});

test('global object template settings expose stable UI hooks for end-to-end coverage', () => {
  const source = sources.find(({ name }) => name === 'ObjectWorkspace.svelte').source;
  ['name', 'width', 'height', 'color'].forEach((setting) => {
    assert.match(source, new RegExp(`data-asset-setting=["']${setting}["'][^>]*oninput=`), setting);
  });
  assert.match(source, /data-instance-setting=["']color["'][^>]*oninput=/);
});
