import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const workflowPath = path.join(root, '.github/workflows/publish-content.yml');
const workflow = await readFile(workflowPath, 'utf8');

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function sectionRange(source, keys) {
  const lines = source.split(/\r?\n/);
  assert.equal(lines.some((line) => line.includes('\t')), false, 'workflow YAML must not use tab indentation');
  let range = { start: 0, end: lines.length, indent: -2 };
  for (const key of keys) {
    const indent = range.indent + 2;
    const prefix = `${' '.repeat(indent)}${key}:`;
    const matches = [];
    for (let index = range.start; index < range.end; index += 1) {
      if (lines[index].startsWith(prefix) && /^\s*$|^\s*#/.test(lines[index].slice(prefix.length))) matches.push(index);
    }
    assert.equal(matches.length, 1, `expected exactly one YAML section ${keys.join('.')}`);
    const start = matches[0] + 1;
    let end = range.end;
    for (let index = start; index < range.end; index += 1) {
      if (!lines[index].trim()) continue;
      const childIndent = lines[index].length - lines[index].trimStart().length;
      if (childIndent <= indent) { end = index; break; }
    }
    range = { start, end, indent };
  }
  return { lines, ...range };
}

function yamlList(source, keys) {
  const { lines, start, end, indent } = sectionRange(source, keys);
  const itemPrefix = `${' '.repeat(indent + 2)}- `;
  const values = lines.slice(start, end).filter((line) => line.trim()).map((line) => {
    assert.equal(line.startsWith(itemPrefix), true, `${keys.join('.')} must contain only scalar list entries`);
    return unquote(line.slice(itemPrefix.length));
  });
  assert.ok(values.length > 0, `${keys.join('.')} must not be empty`);
  return values;
}

function namedStep(source, name) {
  const { lines, start, end, indent } = sectionRange(source, ['jobs', 'validate-and-publish', 'steps']);
  const stepIndent = indent + 2;
  const namePrefix = `${' '.repeat(stepIndent)}- name: `;
  const matchingStarts = [];
  for (let index = start; index < end; index += 1) {
    if (lines[index].startsWith(namePrefix) && unquote(lines[index].slice(namePrefix.length)) === name) matchingStarts.push(index);
  }
  assert.equal(matchingStarts.length, 1, `expected exactly one workflow step named ${name}`);
  const stepStart = matchingStarts[0];
  let stepEnd = end;
  for (let index = stepStart + 1; index < end; index += 1) {
    if (lines[index].startsWith(`${' '.repeat(stepIndent)}- `)) { stepEnd = index; break; }
  }
  const property = (key) => {
    const prefix = `${' '.repeat(stepIndent + 2)}${key}:`;
    const values = lines.slice(stepStart + 1, stepEnd)
      .filter((line) => line.startsWith(prefix))
      .map((line) => unquote(line.slice(prefix.length)));
    assert.ok(values.length <= 1, `step ${name} repeats ${key}`);
    return values[0];
  };
  return { run: property('run'), workingDirectory: property('working-directory') };
}

function matchesWorkflowPath(pattern, candidate) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const expression = escaped.replaceAll('**', '\0').replaceAll('*', '[^/]*').replaceAll('\0', '.*');
  return new RegExp(`^${expression}$`).test(candidate);
}

test('publisher workflow triggers for every canonical content type and rejects noncanonical paths', () => {
  const patterns = yamlList(workflow, ['on', 'pull_request', 'paths']);
  const canonical = [
    'content/levels/hals.level.json',
    'content/characters/postler.character.json',
    'content/tilesets/innstadt.tileset.json',
    'content/blocks/ziegel.block.json',
    'content/animations/winken.animation.json',
    'content/cutscenes/servus.cutscene.json',
    'content/objects/briefkasten.object.json',
    'content/events/eisvogel.event.json',
  ];
  for (const candidate of canonical) {
    assert.equal(patterns.some((pattern) => matchesWorkflowPath(pattern, candidate)), true, candidate);
  }
  for (const candidate of [
    'src/data/levels/hals.level.json',
    'content/events/eisvogel.object.json',
    'content/events/nested/eisvogel.event.json',
    'content/unknown/anything.json',
  ]) {
    assert.equal(patterns.some((pattern) => matchesWorkflowPath(pattern, candidate)), false, candidate);
  }
});

test('trusted publishing guard command resolves from its workflow working directory', async () => {
  const step = namedStep(workflow, 'Verify publisher identity and changed paths');
  const command = step.run?.trim().split(/\s+/) ?? [];
  assert.deepEqual(command.slice(0, 1), ['node']);
  assert.equal(command.length, 2, 'publishing guard must be a single Node script command');
  const workingDirectory = path.resolve(root, step.workingDirectory ?? '.');
  const script = path.resolve(workingDirectory, command[1]);
  assert.equal(path.relative(root, script).replaceAll('\\', '/'), 'apps/game/scripts/validate-publish-pr.mjs');
  await access(script);
  await execFileAsync(process.execPath, ['--check', script], { cwd: workingDirectory });
});
