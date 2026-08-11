import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

async function javascriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(absolute));
    else if (entry.name.endsWith('.js')) files.push(absolute);
  }
  return files;
}

test('game-core is the only owner of fixed-step simulation and pure game rules', async () => {
  const movedSources = [
    'packages/pixel-renderer/src/cutscene.js',
    'packages/pixel-renderer/src/simulation/fixed-step-loop.js',
    'packages/pixel-renderer/src/simulation/grid-motion.js',
    'packages/pixel-renderer/src/simulation/actor-motion.js',
    'packages/pixel-renderer/src/simulation/profiles.js',
    'packages/pixel-renderer/src/simulation/level-simulation.js',
    'apps/game/src/game/actor-respawn.js',
    'apps/game/src/game/difficulty-config.js',
    'apps/game/src/game/level-cutscene-player.js',
    'apps/game/src/game/progress-system.js',
  ];
  for (const relative of movedSources) {
    await assert.rejects(access(path.join(root, relative)), undefined, `${relative} must be moved, not copied`);
  }

  const sourceFiles = [];
  for (const packageEntry of await readdir(path.join(root, 'packages'), { withFileTypes: true })) {
    if (!packageEntry.isDirectory()) continue;
    const sourceDirectory = path.join(root, 'packages', packageEntry.name, 'src');
    try { await access(sourceDirectory); } catch { continue; }
    sourceFiles.push(...await javascriptFiles(sourceDirectory));
  }
  const fixedStepOwners = [];
  for (const file of sourceFiles) {
    if (/export class FixedStepLoop\b/.test(await readFile(file, 'utf8'))) fixedStepOwners.push(path.relative(root, file).replaceAll('\\', '/'));
  }
  assert.deepEqual(fixedStepOwners, ['packages/game-core/src/simulation/fixed-step-loop.js']);
});

test('game-core source stays free of browser, storage, audio, canvas and wall-clock APIs', async () => {
  const forbidden = /\b(?:window|document|navigator|localStorage|sessionStorage|AudioContext|HTMLCanvasElement|OffscreenCanvas|requestAnimationFrame|cancelAnimationFrame|performance|Date)\b/;
  const violations = [];
  for (const file of await javascriptFiles(path.join(root, 'packages/game-core/src'))) {
    const match = (await readFile(file, 'utf8')).match(forbidden);
    if (match) violations.push(`${path.relative(root, file).replaceAll('\\', '/')}: ${match[0]}`);
  }
  assert.deepEqual(violations, []);
});

test('game and studio delegate fixed-step ownership to createGameSession', async () => {
  const appSources = [
    ...await javascriptFiles(path.join(root, 'apps/game/src')),
    ...await javascriptFiles(path.join(root, 'apps/studio/src')),
  ];
  const constructors = [];
  for (const file of appSources) {
    const source = await readFile(file, 'utf8');
    if (/new\s+FixedStepLoop\b/.test(source)) constructors.push(path.relative(root, file).replaceAll('\\', '/'));
  }
  assert.deepEqual(constructors, []);

  const gameMain = await readFile(path.join(root, 'apps/game/src/main.js'), 'utf8');
  const studioEngine = await readFile(path.join(root, 'apps/studio/src/playtest-engine.js'), 'utf8');
  assert.match(gameMain, /createGameSession/);
  assert.match(studioEngine, /createGameSession/);
});
