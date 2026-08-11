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

test('map animations use transform and opacity only', async () => {
  const [css] = await readSources();

  assert.doesNotMatch(css, /@keyframes map-grid-drift[\s\S]*background-position/);
  assert.doesNotMatch(css, /@keyframes river-flow[\s\S]*stroke-dashoffset/);
  assert.doesNotMatch(css, /@keyframes road-flow[\s\S]*stroke-dashoffset/);
  assert.doesNotMatch(between(css, '@keyframes marker-float', '@keyframes marker-highlight'), /filter:/);
  assert.match(css, /@keyframes map-grid-translate[\s\S]*transform:\s*translate3d/);
  assert.match(css, /\.map-motion-paused[\s\S]*animation-play-state:\s*paused/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.passau-map-screen[\s\S]*animation-play-state:\s*paused/);
});

test('map motion state, glints, and selection-safe decoration are explicit', async () => {
  const [css, map] = await readSources();

  assert.match(map, /class:map-motion-active=\{view\.open && !view\.selectionOpen\}/);
  assert.match(map, /class:map-motion-paused=\{view\.selectionOpen\}/);
  assert.match(map, /class="map-glints"\s+aria-hidden="true"/);
  assert.match(map, /class="map-glint map-glint-river/);
  assert.match(map, /class="map-glint map-glint-road/);
  assert.doesNotMatch(map, /class="river-glint/);
  assert.match(css, /\.map-glints\s*\{[\s\S]*pointer-events:\s*none/);
  assert.match(css, /\.map-glint\s*\{[\s\S]*will-change:\s*transform, opacity/);
  assert.doesNotMatch(between(css, '.map-canvas {', '.map-canvas::before'), /animation:\s*map-grid/);
});
