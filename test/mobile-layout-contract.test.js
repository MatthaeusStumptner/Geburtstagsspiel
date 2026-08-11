import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cssPath = new URL('../src/style.css', import.meta.url);
const boardHudPath = new URL('../src/ui/components/BoardHud.svelte', import.meta.url);
const mainPath = new URL('../src/main.js', import.meta.url);

async function readSources() {
  return Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(boardHudPath, 'utf8'),
    readFile(mainPath, 'utf8'),
  ]);
}

test('mobile and fullscreen canvases start below the measured gameplay header', async () => {
  const [css] = await readSources();
  const rule = css.match(/body\.mobile-game-active #game,[\s\S]*?\.board-column:-webkit-full-screen #game\s*\{([\s\S]*?)\n\}/)?.[1];

  assert.ok(rule, 'the mobile/fullscreen canvas rule must exist');
  assert.match(rule, /position:\s*absolute/);
  assert.match(rule, /inset-inline:\s*0/);
  assert.match(rule, /top:\s*var\(--mobile-game-header-height,\s*0px\)/);
  assert.match(rule, /width:\s*100%/);
  assert.match(rule, /height:\s*calc\(100dvh - var\(--mobile-game-header-height,\s*0px\)\)/);
  assert.match(rule, /aspect-ratio:\s*auto/);
  assert.match(rule, /border:\s*0/);
  assert.doesNotMatch(rule, /height:\s*100%/);
});

test('the mobile header is the stable HUD blocker and owns level status cards', async () => {
  const [, boardHud] = await readSources();

  assert.match(boardHud, /id="mobile-game-header"\s+data-gameplay-blocker/);
  const header = boardHud.match(/<div class="mobile-game-header"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';
  assert.match(header, /id="level-status"/);
});

test('observer-owned layout writes the measured header boundary to the board owner', async () => {
  const [, , main] = await readSources();

  assert.match(main, /document\.querySelectorAll\('\[data-gameplay-blocker\]'\)/);
  assert.match(main, /ui\.boardColumn\.style\.setProperty\(\s*'--mobile-game-header-height'/);
  assert.match(main, /highestVisibleBlockerBottom\(blockerMeasurements, canvasRect\.top\)/);
  assert.match(main, /gameplayBlockers\.forEach\(\(element\) => gameplayLayoutResizeObserver\?\.observe\(element\)\)/);
  assert.doesNotMatch(main, /document\.querySelector\('#level-status'\)/);
});

test('mobile overlays remain attached to the full board column', async () => {
  const [css] = await readSources();

  const overlayRule = css.match(/body\.mobile-game-active \.game-overlay,[\s\S]*?\.board-column:-webkit-full-screen \.game-overlay\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(overlayRule, 'the mobile/fullscreen overlay rule must exist');
  assert.match(overlayRule, /inset:\s*0/);
});

test('narrow mobile headers keep their embedded status cards readable', async () => {
  const [css] = await readSources();
  const narrowLayout = css.match(/@media \(max-width: 680px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';

  assert.match(narrowLayout, /\.mobile-game-header \.level-status[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});