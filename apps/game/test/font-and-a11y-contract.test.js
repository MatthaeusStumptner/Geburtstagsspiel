import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('does not load runtime fonts from a third-party host', async () => {
  const css = await source('../src/style.css');

  assert.doesNotMatch(css, /fonts\.googleapis\.com|@import\s+url/i);
});

test('imports exactly the locally bundled font weights used by the game', async () => {
  const main = await source('../src/main.js');
  const imports = [...main.matchAll(/import\s+['"](@fontsource\/(?:dm-mono|silkscreen)\/\d+\.css)['"];?/g)]
    .map((match) => match[1]);

  assert.deepEqual(imports, [
    '@fontsource/dm-mono/400.css',
    '@fontsource/dm-mono/500.css',
    '@fontsource/silkscreen/400.css',
    '@fontsource/silkscreen/700.css',
  ]);
});

test('declares the two self-hosted font packages as runtime dependencies', async () => {
  const packageJson = JSON.parse(await source('../package.json'));

  assert.ok(packageJson.dependencies['@fontsource/dm-mono']);
  assert.ok(packageJson.dependencies['@fontsource/silkscreen']);
});

test('preloads both Silkscreen faces visible in the first gameplay paint', async () => {
  const html = await source('../index.html');

  for (const weight of [400, 700]) {
    assert.match(
      html,
      new RegExp(`<link\\s+rel="preload"\\s+href="\\.\\/src\\/assets\\/silkscreen-latin-${weight}-normal\\.woff2"\\s+as="font"\\s+type="font\\/woff2"\\s+crossorigin\\s*\\/>`),
    );
    const [sourceFont, packageFont] = await Promise.all([
      readFile(new URL(`../src/assets/silkscreen-latin-${weight}-normal.woff2`, import.meta.url)),
      readFile(new URL(`../../../node_modules/@fontsource/silkscreen/files/silkscreen-latin-${weight}-normal.woff2`, import.meta.url)),
    ]);
    assert.deepEqual(sourceFont, packageFont);
  }
});

test('uses one polite hidden lives announcement and decorative visual dots', async () => {
  const topHud = await source('../src/ui/components/TopHud.svelte');

  assert.doesNotMatch(topHud, /<strong\s+id="lives"[^>]*aria-label=/);
  assert.match(topHud, /<strong\s+id="lives"\s+aria-hidden="true">/);
  assert.equal((topHud.match(/aria-live="polite"/g) ?? []).length, 1);
  assert.match(topHud, /<span\s+class="visually-hidden"\s+aria-live="polite">/);
  assert.match(topHud, /view\.copy\.livesA11y\s*\?\?\s*'Leben'/);
});

test('keeps visually hidden live text available to assistive technology without layout impact', async () => {
  const css = await source('../src/style.css');
  const rule = css.match(/\.visually-hidden\s*\{([\s\S]*?)\}/)?.[1] ?? '';

  assert.match(rule, /position:\s*absolute/);
  assert.match(rule, /width:\s*1px/);
  assert.match(rule, /height:\s*1px/);
  assert.match(rule, /margin:\s*-1px/);
  assert.match(rule, /overflow:\s*hidden/);
  assert.match(rule, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  assert.match(rule, /white-space:\s*nowrap/);
  assert.doesNotMatch(rule, /display:\s*none|visibility:\s*hidden|font-size:\s*0|left:\s*-/);
});
