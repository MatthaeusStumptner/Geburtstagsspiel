import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cssPath = new URL('../src/style.css', import.meta.url);
const mapPath = new URL('../src/ui/components/MapScreen.svelte', import.meta.url);

async function readSources() {
  return Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(mapPath, 'utf8'),
  ]);
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  return source.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function cssBlock(source, marker, fromIndex = 0) {
  const markerIndex = source.indexOf(marker, fromIndex);
  assert.notEqual(markerIndex, -1, `missing CSS block: ${marker}`);
  const openIndex = source.indexOf('{', markerIndex);
  assert.notEqual(openIndex, -1, `missing opening brace: ${marker}`);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }
  assert.fail(`missing closing brace: ${marker}`);
}

function mapRootContract(source) {
  const guard = '{#if view.open && view.geometry}';
  const guardIndex = source.indexOf(guard);
  assert.notEqual(guardIndex, -1, 'map root must stay guarded by view.open and geometry');
  const startIndex = source.indexOf('<section ', guardIndex);
  const endIndex = source.indexOf('>', startIndex);
  assert.notEqual(startIndex, -1, 'map root section must exist');
  assert.notEqual(endIndex, -1, 'map root section must be closed');
  const root = source.slice(startIndex, endIndex + 1);
  const binding = (className) => root.match(new RegExp(`class:${className}=\\{([^}]+)\\}`))?.[1];
  return { guard, active: binding('map-motion-active'), paused: binding('map-motion-paused') };
}

function evaluateMotionExpression(expression, view) {
  return Boolean(Function('view', `return (${expression});`)(view));
}

test('map animations use transform and opacity only', async () => {
  const [css] = await readSources();

  assert.equal(css.includes('@keyframes map-grid-drift'), false);
  assert.equal(css.includes('@keyframes river-flow'), false);
  assert.equal(css.includes('@keyframes road-flow'), false);
  assert.doesNotMatch(cssBlock(css, '@keyframes marker-float'), /filter:|drop-shadow/);
  assert.match(cssBlock(css, '@keyframes map-grid-translate'), /transform:\s*translate3d/);
  assert.match(cssBlock(css, '.map-motion-paused .map-canvas::before'), /animation-play-state:\s*paused/);
  const reducedMotionIndex = css.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.notEqual(reducedMotionIndex, -1);
  assert.match(cssBlock(css, '.passau-map-screen .map-canvas::before', reducedMotionIndex), /animation-play-state:\s*paused/);
});

test('map motion state, glints, and selection-safe decoration are explicit', async () => {
  const [css, map] = await readSources();

  assert.match(map, /class="map-glints"\s+aria-hidden="true"/);
  assert.match(map, /class="map-glint map-glint-river/);
  assert.match(map, /class="map-glint map-glint-road/);
  assert.doesNotMatch(map, /class="river-glint/);
  assert.match(cssBlock(css, '.map-glints'), /pointer-events:\s*none/);
  assert.match(cssBlock(css, '.map-motion-active #passau-map .map-glint-river'), /will-change:\s*transform, opacity/);
  assert.doesNotMatch(between(css, '.map-canvas {', '.map-canvas::before'), /animation:\s*map-grid/);
});

test('map root pauses motion for selection, endgame cover, and closed state', async () => {
  const [, map] = await readSources();
  const contract = mapRootContract(map);
  assert.equal(contract.guard, '{#if view.open && view.geometry}');

  const scenarios = [
    { name: 'open', view: { open: true, selectionOpen: false, endgameEvent: null }, active: true, paused: false },
    { name: 'selection', view: { open: true, selectionOpen: true, endgameEvent: null }, active: false, paused: true },
    { name: 'endgame', view: { open: true, selectionOpen: false, endgameEvent: {} }, active: false, paused: true },
    { name: 'closed', view: { open: false, selectionOpen: false, endgameEvent: null }, active: false, paused: true },
  ];

  for (const scenario of scenarios) {
    assert.equal(evaluateMotionExpression(contract.active, scenario.view), scenario.active, `${scenario.name} active state`);
    assert.equal(evaluateMotionExpression(contract.paused, scenario.view), scenario.paused, `${scenario.name} paused state`);
  }
});
