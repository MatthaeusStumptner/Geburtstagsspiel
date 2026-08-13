import { test, expect } from '@playwright/test';

const stories = [
  ['home', 'Geburtstagspost', 2], ['hals', 'Das Rauschen der Ilz', 2.6], ['oberhaus', 'Goldener Passau-Blick', 2.5],
  ['dom', 'Der große Orgelakkord', 2.8], ['dreifluesseeck', 'Dreiklang der Flüsse', 3.2], ['uni', 'Das Prüfungs-Gutti', 2.1],
  ['bschuett', 'Lolas Superstöckchen', 2.4], ['tabakfabrik', 'Das alte Dampfzeichen', 2.9], ['zauberberg', 'Zauberberg-Zugabe', 3.6],
];

async function openCleanEditor(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(150);
  if (!await page.locator('#level-canvas').count()) throw new Error(`Editor konnte nicht starten: ${errors.join(' | ') || 'keine Page-Error-Meldung'}`);
  await expect(page.locator('#level-canvas')).toBeVisible();
}

async function loadTemplate(page, id) {
  await page.locator('.brand:visible, .mobile-project-button:visible').first().click();
  await page.locator(`[data-template-id="${id}"]`).click();
  await expect(page.locator('.document-identity')).toHaveAttribute('data-level-id', id);
}

async function canvasPoint(page, x, y) {
  const box = await page.locator('#level-canvas').boundingBox();
  if (!box) throw new Error('Canvas besitzt keine sichtbare Bounding Box.');
  return { x: box.x + (x / 25) * box.width, y: box.y + (y / 25) * box.height };
}

test('Textblock bleibt bei Retina-Auflösung scharf und frei transformierbar @visual', async ({ page }) => {
  await openCleanEditor(page);
  await page.locator('[data-workspace="objects"]').click();
  await page.locator('.object-sidebar .sidebar-mode-tabs').getByRole('button', { name: /Assets/ }).click();
  await page.locator('[data-asset-id="text-block"]').click();
  await page.locator('.object-inspector [data-action="place-asset"]').click();
  const placement = await canvasPoint(page, 7.5, 7.5); await page.mouse.click(placement.x, placement.y);
  await page.locator('.object-sidebar .sidebar-mode-tabs').getByRole('button', { name: /Level-Objekte/ }).click();
  await page.locator('.scene-tree .scene-node-main').filter({ hasText: 'Freier Textblock' }).click();
  await expect(page.getByLabel('Rahmen ausblenden')).toBeChecked();
  await page.locator('.object-inspector .effect-editor').getByRole('button', { name: '＋ Effekt' }).click();
  await page.locator('.secondary-inspector').click();
  await page.locator('.edge-effect-editor').getByRole('button', { name: '＋ Rand-Effekt' }).click();
  await page.locator('.edge-effect-card select').first().selectOption('fish');
  await page.locator('.object-inspector').getByLabel('Text', { exact: true }).fill('ILZ · Franz & Lola gehen mit Gutti nach Passau');
  await page.locator('.object-inspector').getByLabel('Text', { exact: true }).blur();
  await page.getByLabel('Hintergrund transparent').check();
  await page.locator('[data-tool="transform"]').click();
  const moveFrom = await canvasPoint(page, 10, 8.5); const moveTo = await canvasPoint(page, 12.1, 10.35);
  await page.mouse.move(moveFrom.x, moveFrom.y); await page.mouse.down(); await page.mouse.move(moveTo.x, moveTo.y, { steps: 10 }); await page.mouse.up();
  const x = Number(await page.locator('.object-inspector').getByLabel('X', { exact: true }).inputValue());
  const y = Number(await page.locator('.object-inspector').getByLabel('Y', { exact: true }).inputValue());
  const width = Number(await page.locator('.object-inspector').getByLabel('Breite').inputValue());
  const height = Number(await page.locator('.object-inspector').getByLabel('Höhe').inputValue());
  const scaleFrom = await canvasPoint(page, x + width, y + height); const scaleTo = await canvasPoint(page, x + width + 2, y + height + 1);
  await page.mouse.move(scaleFrom.x, scaleFrom.y); await page.mouse.down(); await page.mouse.move(scaleTo.x, scaleTo.y, { steps: 10 }); await page.mouse.up();
  const density = await page.locator('#level-canvas').evaluate((canvas) => canvas.width / canvas.getBoundingClientRect().width);
  expect(density).toBeGreaterThanOrEqual(1.9);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'output/playwright/textblock-retina-transform.png' });
});

test('Mehrere Entwürfe lassen sich gemeinsam zur Veröffentlichung auswählen @visual', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const shared = new Map();
  await page.route('https://franz-lola-publisher.test.workers.dev/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4191', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/me') return route.fulfill({ headers, json: { login: 'freundin', name: 'Franz-Lola-Redaktion' } });
    if (path === '/api/drafts/bootstrap') return route.fulfill({ headers, json: { drafts: [] } });
    if (path === '/api/content/bootstrap') return route.fulfill({ headers, json: { items: [] } });
    if (path.startsWith('/api/drafts/') && route.request().method() === 'PUT') {
      const body = route.request().postDataJSON(); const revision = body.expectedRevision + 1;
      const draft = { id: body.level.id, name: body.level.name.standard, icon: body.level.icon, area: body.level.location.area, revision, status: 'draft', updatedBy: 'freundin', updatedAt: '2026-08-08T12:00:00.000Z', level: body.level };
      shared.set(draft.id, draft); return route.fulfill({ headers, json: draft });
    }
    if (path.startsWith('/api/content/') && route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      return route.fulfill({ headers, json: { type: body.content.type, id: body.content.id, name: body.content.name, description: body.content.description, revision: body.expectedRevision + 1, status: 'draft', content: body.content } });
    }
    if (path === '/api/publish') return route.fulfill({ status: 202, headers, json: { publicationId: 77, state: 'testing', phase: 'upload-complete', phaseLabel: 'Inhalte sicher übertragen', progress: 22, detail: 'Inhalte wurden sicher übertragen.' } });
    if (path === '/api/publications/77') return route.fulfill({ headers, json: { state: 'deploying', phase: 'deploy-build', phaseLabel: 'Spiel für GitHub Pages bauen', progress: 89, detail: 'Das optimierte Browser-Spiel wird gebaut.', checkedAt: '2026-08-05T18:00:00.000Z' } });
    return route.fulfill({ status: 404, headers, json: { error: 'Nicht gefunden.' } });
  });
  await page.goto('/#publisher_session=visual.session');
  await expect(page.locator('#level-canvas')).toBeVisible();
  await loadTemplate(page, 'home'); await page.waitForTimeout(250);
  await loadTemplate(page, 'hals'); await page.waitForTimeout(250);
  await page.locator('[data-workspace="publish"]').click();
  await expect(page.locator('.publish-candidate[data-content-type="level"]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Alle gültigen' }).click();
  await expect(page.locator('.publish-candidate input:checked')).toHaveCount(4);
  await page.screenshot({ path: 'output/playwright/publisher-content-selection.png', fullPage: true });
  await page.locator('.publish-type-heading').filter({ hasText: 'Tileset' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/publisher-content-types.png', fullPage: true });
  await page.locator('#publisher-confirm').click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '89');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'output/playwright/publisher-live-progress.png' });
});

test('Alter Browser-Entwurf übernimmt automatisch die gemeinsame Cloud-Basis @visual', async ({ page }) => {
  await openCleanEditor(page);
  await loadTemplate(page, 'zauberberg');
  await page.waitForTimeout(250);
  const remote = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('franz-lola-level-editor-workspace-v2'));
    const original = structuredClone(workspace.drafts.zauberberg.level);
    workspace.drafts.zauberberg.level.name.standard = 'Mein lokaler Zauberberg';
    localStorage.setItem('franz-lola-level-editor-workspace-v2', JSON.stringify(workspace));
    return original;
  });
  await page.route('https://franz-lola-publisher.test.workers.dev/**', async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4191', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };
    const metadata = { id: remote.id, name: remote.name.standard, icon: remote.icon, area: remote.location.area, revision: 2, status: 'published', updatedBy: 'github', updatedAt: '2026-08-08T12:00:00.000Z' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/me') return route.fulfill({ headers, json: { login: 'freundin', name: 'Franz-Lola-Redaktion' } });
    if (path === '/api/drafts/bootstrap') return route.fulfill({ headers, json: { drafts: [metadata] } });
    if (path === '/api/content/bootstrap') return route.fulfill({ headers, json: { items: [] } });
    if (path === '/api/drafts/zauberberg') return route.fulfill({ headers, json: { ...metadata, level: remote } });
    return route.fulfill({ status: 404, headers, json: { error: 'Nicht gefunden.' } });
  });
  await page.goto('/#publisher_session=visual.session');
  await expect(page.locator('.document-identity')).toContainText(remote.name.standard);
  await page.locator('[data-workspace="publish"]').click();
  await expect(page.locator('.cloud-conflict-resolver')).toHaveCount(0);
  await expect(page.locator('.topbar-status')).toContainText('GEMEINSAM');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('franz-lola-level-editor-workspace-v2')).drafts.zauberberg.sync))
    .toEqual({ baseRevision: 2, dirty: false, source: 'cloud' });
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport + 1);
  await page.screenshot({ path: 'output/playwright/cloud-basis-automatisch.png', fullPage: true });
});

test('Figuren werden wie im Spiel gerendert @visual', async ({ page }) => {
  await openCleanEditor(page);
  await loadTemplate(page, 'home');
  await page.locator('[data-workspace="characters"]').click();
  await page.waitForTimeout(500);
  for (const name of ['Katze 1', 'Katze 2', 'Katze 3', 'Franz & Lola']) {
    await page.locator('.actor-browser button').filter({ hasText: name }).click();
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: /Sprite-Sheet bearbeiten/ }).click();
  for (const state of ['idle', 'up', 'right', 'down', 'left']) {
    await page.locator('.state-tabs button').filter({ hasText: state }).click();
    await page.waitForTimeout(280);
  }
  await page.getByRole('button', { name: '▶ Playback' }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'output/playwright/figuren-renderer.png' });
  await page.getByRole('button', { name: '⬚ Auswählen' }).click();
  await page.locator('.pixel-grid button[data-x="0"][data-y="0"]').click();
  await page.locator('.pixel-grid button[data-x="1"][data-y="0"]').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Farbe anwenden' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playwright/pixel-multiselect.png' });
});

test('Globale Figuren werden sichtbar erstellt und ins Level gesetzt @visual', async ({ page }) => {
  await openCleanEditor(page);
  await page.locator('[data-workspace="characters"]').click();
  await page.locator('#create-character').click();
  await page.locator('#character-name').fill('Passauer Postler');
  await page.screenshot({ path: 'output/playwright/figuren-assistent.png' });
  await page.getByRole('button', { name: /Weiter zum Sprite-Studio/ }).click();
  await expect(page.getByLabel('Sprite-Auflösung')).toHaveValue('24');
  await expect(page.locator('.pixel-grid button')).toHaveCount(576);
  await page.locator('.pixel-grid button[data-x="0"][data-y="0"]').click();
  await page.screenshot({ path: 'output/playwright/figuren-24px-studio.png' });
  await page.getByRole('button', { name: 'Sprite übernehmen' }).click();
  await page.locator('.character-hero .place-character-button').click();
  const box = await page.locator('#level-canvas').boundingBox();
  await page.mouse.click(box.x + box.width * .25, box.y + box.height * .25);
  await expect(page.locator('#level-canvas')).toHaveClass(/transform-tool/);
  await expect(page.locator('#level-canvas')).toHaveAttribute('data-selected-entity', 'character:0');
  await page.screenshot({ path: 'output/playwright/figur-direkt-transformieren.png' });
  await page.locator('[data-workspace="characters"]').click();
  await page.locator('[data-level-character-id]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'output/playwright/globale-figur-im-level.png' });
});

test('Der Figuren-Assistent bleibt auf kleinen Handys verständlich @visual', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCleanEditor(page);
  await page.getByLabel('Arbeitsbereich auswählen').selectOption('characters');
  await expect(page.locator('[data-workspace="characters"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('#create-character').click();
  await page.locator('#character-name').fill('Donaunixe');
  await page.screenshot({ path: 'output/playwright/figuren-assistent-mobile.png' });
  await page.getByRole('button', { name: /Weiter zum Sprite-Studio/ }).click();
  await page.getByRole('button', { name: 'Sprite übernehmen' }).click();
  await page.locator('.character-hero').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playwright/globale-figur-mobile.png' });
});

test('Alle neun Level-Ereignisse sind im UI erreichbar @visual', async ({ page }) => {
  await openCleanEditor(page);
  test.setTimeout(150_000);
  for (const [id, eventName] of stories) {
    await loadTemplate(page, id);
    await page.locator('[data-workspace="events"]').click();
    await page.locator('.event-browser button').filter({ hasText: eventName }).click({ force: true });
    await expect(page.locator('.event-message-preview')).toContainText(eventName);
    await page.waitForTimeout(280);
  }
  await page.screenshot({ path: 'output/playwright/ereignisse-alle-level.png' });
});

test('Alle neun angepassten Cutscenes spielen in steigender Komplexität @visual', async ({ page }) => {
  await openCleanEditor(page);
  test.setTimeout(150_000);
  for (const [id, , playhead] of stories) {
    await loadTemplate(page, id);
    await page.locator('[data-workspace="cutscenes"]').click();
    await page.locator('.cutscene-transport input').fill(String(playhead));
    await page.locator('.cutscene-transport button').click();
    await page.waitForTimeout(420);
  }
  await page.screenshot({ path: 'output/playwright/cutscenes-alle-level.png' });
});

test('Individuelle Wandstile und saubere Glitch-Effekte sind direkt sichtbar @visual', async ({ page }) => {
  await openCleanEditor(page);
  await loadTemplate(page, 'hals');
  await page.locator('[data-workspace="level"]').click();
  await page.locator('[data-tool="select"]').click();
  const wall = await canvasPoint(page, 3, 3);
  await page.mouse.click(wall.x, wall.y);
  await page.getByLabel('Wand Muster').selectOption('brick');
  await page.getByLabel('Themefarbe für Wand').uncheck();
  await page.getByLabel('Wand Eigenfarbe').fill('#a14f3f');
  await page.locator('.wall-instance-inspector .effect-editor').getByRole('button', { name: '＋ Effekt' }).click();
  await expect(page.locator('.wall-instance-inspector [data-effect-type="glitch"]')).toHaveCount(1);
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'output/playwright/wand-instanz-glitch-sauber.png' });

  await loadTemplate(page, 'zauberberg');
  await page.locator('[data-workspace="objects"]').click();
  await page.locator('.object-sidebar .sidebar-mode-tabs').getByRole('button', { name: /Level-Objekte/ }).click();
  await expect(page.locator('[data-scene-key*="note"]')).toHaveCount(0);
  await expect(page.locator('[data-scene-key="theme-element:stage-note"]')).toHaveCount(0);
  await expect(page.locator('[data-scene-key="decoration:zauberberg-box"]')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'output/playwright/zauberberg-editierbare-elemente.png' });
});
