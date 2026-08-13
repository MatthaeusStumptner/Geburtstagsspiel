import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import * as visualHealth from '../tools/browser-visual-health.mjs';

test('visual health decodes the saved locator PNG after compositor effects', async () => {
  assert.equal(typeof visualHealth.captureLocatorPngVisualHealth, 'function');
  const directory = await mkdtemp(join(tmpdir(), 'franz-lola-compositor-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
    await page.setContent('<canvas id="surface" width="64" height="64" style="filter:grayscale(1)"></canvas>');
    await page.locator('#surface').evaluate((canvas) => {
      const context = canvas.getContext('2d');
      context.fillStyle = '#ff0000'; context.fillRect(0, 0, 32, 64);
      context.fillStyle = '#00ff00'; context.fillRect(32, 0, 32, 64);
    });
    const target = join(directory, 'composited.png');
    await assert.rejects(
      visualHealth.captureLocatorPngVisualHealth(page.locator('#surface'), target, 'css-grayscale'),
      /color variation|gray|chroma/,
    );
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
