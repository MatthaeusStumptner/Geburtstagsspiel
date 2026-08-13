import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('rendering gate makes the animated thumbnail actionable before measuring visibility', async () => {
  const source = await readFile(new URL('../e2e/rendering.spec.js', import.meta.url), 'utf8');
  const start = source.indexOf("const animated = page.locator('[data-asset-id=\"music-note\"] .object-thumbnail')");
  const end = source.indexOf('const animatedWindow =', start);
  const action = source.slice(start, end);
  assert.ok(start >= 0 && end > start, 'animated thumbnail measurement block is missing');
  assert.match(action, /animated\.scrollIntoViewIfNeeded\(\)/);
  assert.ok(action.indexOf('scrollIntoViewIfNeeded') < action.indexOf('toBeInViewport'), 'scroll must precede the viewport assertion');
});

test('rendering gate does not retain one cumulative trace across the full real-browser matrix', async () => {
  const source = await readFile(new URL('../playwright.rendering.config.js', import.meta.url), 'utf8');
  assert.ok(source.includes("trace: 'off'"));
  assert.ok(source.includes("screenshot: 'only-on-failure'"));
});


test('visual health samples compositor screenshot pixels for every backend including WebGPU', async () => {
  const source = await readFile(new URL('../e2e/rendering.spec.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function canvasVisualHealth');
  const end = source.indexOf('async function switchWorkspace', start);
  const diagnostic = source.slice(start, end);
  assert.ok(diagnostic.includes('locator.screenshot'));
  assert.ok(diagnostic.includes('image.decode()'));
  assert.ok(!diagnostic.includes('context.drawImage(source'));
});
