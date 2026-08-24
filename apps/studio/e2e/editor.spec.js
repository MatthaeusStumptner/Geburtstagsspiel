import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { loadStaticCanvasFixture, openCleanEditor, persistActiveDraft } from './studio-test-helpers.js';

const renderCoordinatorBrowserUrl = `/@fs/${fileURLToPath(new URL('../../../packages/render-coordinator/src/index.js', import.meta.url)).replaceAll('\\', '/')}`;

async function openProject(page) {
  const button = page.locator('.brand:visible, .mobile-project-button:visible').first();
  await button.click();
  await expect(page.locator('#project-drawer')).toBeInViewport();
}

async function loadTemplate(page, id) {
  await openProject(page);
  await page.locator(`[data-template-id="${id}"]`).click();
  await expect(page.locator('.document-identity')).toHaveAttribute('data-level-id', id);
}

async function openObjectLibrary(page) {
  await page.locator('[data-workspace="objects"]').click();
  await page.locator('.object-sidebar .sidebar-mode-tabs').getByRole('button', { name: /Assets/ }).click();
  await expect(page.locator('.asset-list')).toBeVisible();
}

async function switchWorkspace(page, id) {
  const mobilePicker = page.getByLabel('Arbeitsbereich auswählen');
  if (await mobilePicker.isVisible()) await mobilePicker.selectOption(id);
  else await page.locator(`[data-workspace="${id}"]`).click();
  await expect(page.locator(`[data-workspace="${id}"]`)).toHaveAttribute('aria-current', 'page');
}

async function waitForStableRenderCount(locator, quietMs = 200) {
  const value = await locator.evaluate((element, delay) => new Promise((resolve) => {
    let timeout;
    let observer;
    const finish = () => {
      observer.disconnect();
      resolve(element.getAttribute('data-render-count'));
    };
    observer = new MutationObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(finish, delay);
    });
    observer.observe(element, { attributes: true, attributeFilter: ['data-render-count'] });
    timeout = setTimeout(finish, delay);
  }), quietMs);
  return Number(value);
}

async function selectAssetForPlacement(page, id) {
  await page.locator(`[data-asset-id="${id}"]`).click();
  await expect(page.locator('.object-inspector')).toHaveAttribute('data-object-context', 'asset');
  await page.locator('.object-inspector [data-action="place-asset"]').click();
  await expect(page.locator('#level-canvas')).toHaveAttribute('data-tool', 'object');
}

async function openSceneTree(page) {
  const tabs = page.locator('.sidebar-mode-tabs:visible');
  await tabs.getByRole('button', { name: /Level-Objekte|Szene/ }).click();
  await expect(page.locator('.scene-tree:visible')).toBeVisible();
}

async function openConflictingCloudEditor(page, { dirty = false } = {}) {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'zauberberg');
  await page.waitForTimeout(250);
  const remote = await page.evaluate((isDirty) => {
    const workspace = JSON.parse(localStorage.getItem('franz-lola-level-editor-workspace-v2'));
    const original = structuredClone(workspace.drafts.zauberberg.level);
    workspace.drafts.zauberberg.level.name.standard = 'Mein lokaler Zauberberg';
    workspace.drafts.zauberberg.level.mission.standard = 'Meine noch nicht gemeinsame Fassung';
    workspace.drafts.zauberberg.level.decorations.unshift({ id: 'zauberberg-note-frei', assetId: 'zauberberg-note' });
    workspace.drafts.zauberberg.level.events.find((event) => event.id === 'zugabe').visual = { type: 'custom', assetId: 'zauberberg-note', x: 12, y: 9, label: '♪' };
    workspace.drafts.zauberberg.level.cutscenes[0].tracks.push({ id: 'note-solo', type: 'object', target: 'zauberberg-note-frei', keyframes: [] });
    workspace.drafts.zauberberg.sync = isDirty ? { baseRevision: 1, dirty: true, source: 'local' } : undefined;
    localStorage.setItem('franz-lola-level-editor-workspace-v2', JSON.stringify(workspace));
    return original;
  }, dirty);
  const writes = [];
  await page.route('https://franz-lola-publisher.test.workers.dev/**', async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const origin = request.headers().origin;
    if (!origin) throw new Error('Publisher request is missing its browser Origin header.');
    const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };
    const metadata = { id: remote.id, name: remote.name.standard, icon: remote.icon, area: remote.location.area, revision: 2, status: 'published', updatedBy: 'github', updatedAt: '2026-08-08T12:00:00.000Z' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/me') return route.fulfill({ headers, json: { login: 'freundin', name: 'Franz-Lola-Redaktion' } });
    if (path === '/api/drafts/bootstrap') return route.fulfill({ headers, json: { drafts: [metadata] } });
    if (path === '/api/content/bootstrap') return route.fulfill({ headers, json: { items: [] } });
    if (path === '/api/drafts/zauberberg' && request.method() === 'GET') return route.fulfill({ headers, json: { ...metadata, level: remote } });
    if (path === '/api/drafts/zauberberg' && request.method() === 'PUT') {
      const body = request.postDataJSON(); writes.push(body);
      return route.fulfill({ headers, json: { ...metadata, revision: 3, status: 'draft', updatedBy: 'freundin', level: body.level } });
    }
    return route.fulfill({ status: 404, headers, json: { error: 'Nicht gefunden.' } });
  });
  await page.goto('/#publisher_session=test.session-token');
  await expect(page.locator('#level-canvas')).toBeVisible();
  await expect(page.locator('.document-identity')).toContainText(remote.name.standard);
  await page.locator('[data-workspace="publish"]').click();
  await expect(page.locator('.cloud-conflict-resolver')).toHaveCount(0);
  await expect(page.locator('.topbar-status')).toContainText('GEMEINSAM');
  return { errors, remote, writes };
}

async function canvasHasVisiblePixels(locator) {
  return locator.evaluate((canvas) => {
    const context = canvas.getContext('2d');
    if (!context) return canvas.dataset.rendered === 'true';
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) return true;
    return false;
  });
}

async function canvasSignature(locator) {
  return locator.evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 0; index < pixels.length; index += 17) hash = Math.imul(hash ^ pixels[index], 16777619);
    return hash >>> 0;
  });
}

async function canvasOpaqueColors(locator) {
  return locator.evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 0) colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
    }
    return [...colors].sort();
  });
}

test('stored publisher session reconnects automatically and attributes cloud work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('franz-lola-publisher-session-v1', JSON.stringify({
      token: 'stored.session-token',
      expiresAt: Date.now() + 60_000,
    }));
  });
  await page.route('https://franz-lola-publisher.test.workers.dev/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const origin = request.headers().origin;
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/me') return route.fulfill({ headers, json: { login: 'freundin', name: 'Freundin' } });
    if (path === '/api/drafts/bootstrap') return route.fulfill({ headers, json: { drafts: [{
      id: 'hals', name: 'Hals', icon: 'H', area: 'Ilz', revision: 3, status: 'draft',
      updatedBy: 'freundin', updatedAt: '2026-08-24T12:00:00.000Z',
    }] } });
    if (path === '/api/content/bootstrap') return route.fulfill({ headers, json: { items: [] } });
    return route.fulfill({ status: 404, headers, json: { error: 'Nicht gefunden.' } });
  });

  await page.goto('/');
  await expect(page.locator('#level-canvas')).toBeVisible();
  await expect(page.locator('.topbar-status')).toContainText('GEMEINSAM');
  await expect(page.locator('.cloud-onboarding')).toHaveCount(0);
  await openProject(page);
  await expect(page.locator('.shared-draft-section')).toContainText('Von dir');
  await page.locator('.drawer-scrim').click();
  await page.locator('[data-workspace="publish"]').click();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.locator('.cloud-onboarding')).toBeVisible();
  expect(errors).toEqual([]);
});
test('drag asset from the library onto the level canvas', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'hals');
  await openObjectLibrary(page);

  const asset = page.locator('[data-asset-id="music-note"]');
  const canvas = page.locator('#level-canvas');
  await expect(asset).toHaveAttribute('draggable', 'true');
  await asset.dragTo(canvas, { targetPosition: { x: 260, y: 210 } });

  await expect(canvas).toHaveAttribute('data-selected-entity', /^decoration:/);
  await expect(canvas).toHaveClass(/transform-tool/);
  await expect(page.locator('.object-inspector')).toHaveAttribute('data-object-context', 'instance');
  expect(errors).toEqual([]);
});
test('object workspace keeps one primary action and centers navigation icons', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await openObjectLibrary(page);

  await expect(page.locator('#create-object')).toHaveCount(0);
  await expect(page.locator('[data-action="create-asset"]')).toHaveCount(1);
  await expect(page.locator('[data-action="place-asset-toolbar"]')).toHaveCount(0);

  const objectsButton = page.locator('[data-workspace="objects"]');
  const icon = objectsButton.locator('.button-icon');
  await expect(icon).toBeVisible();
  const centerOffset = await objectsButton.evaluate((button) => {
    const slot = button.querySelector('.button-icon');
    const buttonRect = button.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    return Math.abs((slotRect.top + slotRect.height / 2) - (buttonRect.top + buttonRect.height / 2));
  });
  expect(centerOffset).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
const storyCases = [
  { id: 'home', event: 'Geburtstagspost', eventCount: 3, cutscene: 'Aufbruch am Bramerhof', tracks: 4, keyframes: 8, duration: 4 },
  { id: 'hals', event: 'Das Rauschen der Ilz', eventCount: 2, cutscene: 'Entlang der Ilz', tracks: 4, keyframes: 10, duration: 5.2 },
  { id: 'oberhaus', event: 'Goldener Passau-Blick', eventCount: 2, cutscene: 'Hinauf zur Veste', tracks: 4, keyframes: 12, duration: 5 },
  { id: 'dom', event: 'Der große Orgelakkord', eventCount: 2, cutscene: 'Glocken über Passau', tracks: 4, keyframes: 12, duration: 5.6 },
  { id: 'dreifluesseeck', event: 'Dreiklang der Flüsse', eventCount: 2, cutscene: 'Drei Flüsse, eine Runde', tracks: 4, keyframes: 15, duration: 6.4 },
  { id: 'uni', event: 'Das Prüfungs-Gutti', eventCount: 1, cutscene: 'Kurze Vorlesung für Lola', tracks: 4, keyframes: 10, duration: 4.3 },
  { id: 'bschuett', event: 'Lolas Superstöckchen', eventCount: 3, cutscene: 'Runde durch den Bschüttpark', tracks: 4, keyframes: 10, duration: 4.8 },
  { id: 'tabakfabrik', event: 'Das alte Dampfzeichen', eventCount: 1, cutscene: 'Die Fabrik erwacht', tracks: 5, keyframes: 13, duration: 5.8 },
  { id: 'zauberberg', event: 'Zauberberg-Zugabe', eventCount: 1, cutscene: 'Soundcheck am Zauberberg', tracks: 5, keyframes: 19, duration: 7.2, visualAsset: false },
];

async function canvasPoint(page, x, y) {
  return canvasExactPoint(page, x + 0.5, y + 0.5);
}

async function canvasExactPoint(page, x, y) {
  const canvas = page.locator('#level-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas besitzt keine sichtbare Bounding Box.');
  await expect.poll(() => canvas.evaluate((element) => Number(element.dataset.cameraSourceWidth) || 0)).toBeGreaterThan(0);
  const metrics = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    viewportX: Number(element.dataset.cameraViewportX),
    viewportY: Number(element.dataset.cameraViewportY),
    viewportWidth: Number(element.dataset.cameraViewportWidth),
    viewportHeight: Number(element.dataset.cameraViewportHeight),
    sourceX: Number(element.dataset.cameraSourceX),
    sourceY: Number(element.dataset.cameraSourceY),
    sourceWidth: Number(element.dataset.cameraSourceWidth),
    sourceHeight: Number(element.dataset.cameraSourceHeight),
    tileSize: Number(element.dataset.tileSize),
  }));
  const densityX = metrics.width / box.width; const densityY = metrics.height / box.height;
  return {
    x: box.x + (metrics.viewportX + ((x * metrics.tileSize - metrics.sourceX) / metrics.sourceWidth) * metrics.viewportWidth) / densityX,
    y: box.y + (metrics.viewportY + ((y * metrics.tileSize - metrics.sourceY) / metrics.sourceHeight) * metrics.viewportHeight) / densityY,
  };
}

test('URL router restores level, discipline and selection with browser history', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'zauberberg');
  await page.locator('[data-workspace="objects"]').click();
  await openSceneTree(page);
  await page.locator('[data-scene-key="theme-element:stage-lights"] .scene-node-main').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('workspace')).toBe('objects');
  await expect.poll(() => new URL(page.url()).searchParams.get('selection')).toBe('theme-element:stage-lights');
  await page.locator('[data-workspace="characters"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('workspace')).toBe('characters');
  await page.goBack();
  await expect(page.locator('[data-workspace="objects"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.object-inspector')).toContainText('Bühnenlichter');
  await page.reload();
  await expect(page.locator('.document-identity')).toHaveAttribute('data-level-id', 'zauberberg');
  await expect(page.locator('.object-inspector')).toContainText('Bühnenlichter');
  await expect(page).toHaveTitle(/Zauberberg.*Objekte.*Franz & Lola Studio/);
  expect(errors).toEqual([]);
});

test('router keeps the publisher fragment separate and makes a closed project drawer inert', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?level=hals&workspace=events&selection=__proto__%3Aignored#publisher_session=invalid-but-safe');
  await expect(page.locator('.document-identity')).toHaveAttribute('data-level-id', 'hals');
  await expect(page.locator('[data-workspace="events"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#project-drawer')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#project-drawer')).toHaveAttribute('inert', '');
  await openProject(page);
  await expect(page.locator('#project-drawer')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#project-drawer')).not.toHaveAttribute('inert', '');
  expect(new URL(page.url()).searchParams.get('workspace')).toBe('events');
  expect(errors).toEqual([]);
});

test('seven disciplines separate the work and all nine exact templates stay available', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await expect(page.locator('.discipline-nav [data-workspace]')).toHaveCount(7);
  await expect(page.locator('[data-workspace="level"]')).toContainText('Level');
  await expect(page.locator('[data-workspace="objects"]')).toContainText('Objekte');
  await expect(page.locator('[data-workspace="characters"]')).toContainText('Figuren');
  await expect(page.locator('[data-workspace="cutscenes"]')).toContainText('Cutscenes');
  await openProject(page);
  await expect(page.locator('[data-template-id]')).toHaveCount(9);
  await page.locator('.search-field input').fill('Zauberberg');
  await expect(page.locator('[data-template-id]')).toHaveCount(1);
  await page.locator('[data-template-id="zauberberg"]').click();
  await expect(page.locator('.validation-card')).toContainText('Level ist spielbar');
  expect(errors).toEqual([]);
});

test('one reactive document keeps drawing, history, autosave and reload synchronized', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await openProject(page);
  await page.getByRole('button', { name: /Neues Level/ }).click();
  await page.locator('#level-id').fill('meine-ilz-runde'); await page.locator('#level-id').blur();
  await page.locator('#level-name').fill('Meine Ilz-Runde'); await page.locator('#level-name').blur();
  await page.locator('[data-tool="rectangle"]').click();
  const start = await canvasPoint(page, 3, 3); const end = await canvasPoint(page, 5, 5);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('.history-actions button').first()).toBeEnabled();
  await page.locator('.history-actions button').first().click();
  await expect(page.locator('.history-actions button').nth(1)).toBeEnabled();
  await page.locator('.history-actions button').nth(1).click();
  await expect(page.locator('.canvas-status strong')).toHaveText('GESPEICHERT');
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.locator('#level-id')).toHaveValue('meine-ilz-runde');
  await expect(page.locator('#level-name')).toHaveValue('Meine Ilz-Runde');
  await openProject(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Entwurf Meine Ilz-Runde löschen' }).click();
  await expect(page.locator('#project-drawer')).not.toContainText('Meine Ilz-Runde');
  await expect(page.locator('#level-id')).toHaveValue('meine-ilz-runde');
  expect(errors).toEqual([]);
});

test('the level canvas can zoom, pan and return to a complete overview', async ({ page }) => {
  const errors = await openCleanEditor(page);
  const frame = page.locator('.level-canvas-frame');
  await expect(frame).toHaveAttribute('data-viewport-zoom', '1.00');
  await page.getByRole('button', { name: 'Ansicht vergrößern' }).click();
  await expect(frame).toHaveAttribute('data-viewport-zoom', '1.25');
  const beforeCenter = await frame.getAttribute('data-viewport-center');
  await page.locator('.canvas-viewport-controls button').first().click();
  const canvas = page.locator('#level-canvas'); const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas besitzt keine sichtbare Bounding Box.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 6 }); await page.mouse.up();
  await expect.poll(() => frame.getAttribute('data-viewport-center')).not.toBe(beforeCenter);
  await page.getByRole('button', { name: 'Ganzes Level einpassen' }).click();
  await expect(frame).toHaveAttribute('data-viewport-zoom', '1.00');
  expect(errors).toEqual([]);
});

test('fallback starter stays awake while a valid one-frame fixture sleeps after a pointer edit', async ({ page }) => {
  const errors = await openCleanEditor(page);
  const canvas = page.locator('#level-canvas');
  await expect(canvas).toHaveAttribute('data-render-count', /\d+/);
  const starterCount = Number(await canvas.getAttribute('data-render-count'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(starterCount);

  await persistActiveDraft(page);
  await loadStaticCanvasFixture(page);
  const staticCount = await waitForStableRenderCount(canvas);
  expect(staticCount).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  await expect(canvas).toHaveAttribute('data-render-count', String(staticCount));

  await page.locator('[data-tool="wall"]').click();
  await page.waitForTimeout(50);
  const point = await canvasPoint(page, 4, 4);
  const beforeHover = Number(await canvas.getAttribute('data-render-count'));
  await page.mouse.move(point.x, point.y);
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(beforeHover);
  const beforeDown = Number(await canvas.getAttribute('data-render-count'));
  await page.mouse.down();
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(beforeDown);
  const beforeEdit = Number(await canvas.getAttribute('data-render-count'));
  await page.mouse.up();
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBe(beforeEdit + 1);
  await expect(canvas).toHaveAttribute('data-last-render-reason', 'pointer:wall');

  const afterEdit = Number(await canvas.getAttribute('data-render-count'));
  await page.waitForTimeout(500);
  await expect(canvas).toHaveAttribute('data-render-count', String(afterEdit));
  await page.locator('[data-tool="select"]').click();
  const decoration = await canvasPoint(page, 5, 5);
  await page.mouse.click(decoration.x, decoration.y);
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  const selectionStart = Number(await canvas.getAttribute('data-render-count'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(selectionStart);
  await expect.poll(() => canvas.getAttribute('data-last-render-reason')).toBe('animation:ambient');
  const selectionFrame = Number(await canvas.getAttribute('data-render-count'));
  await page.waitForTimeout(160);
  await expect(canvas).not.toHaveAttribute('data-render-count', String(selectionFrame));
  expect(errors).toEqual([]);
});

test('level canvas animated content sleeps for reduced motion and wakes when restored', async ({ page }) => {
  const errors = await openCleanEditor(page);
  const canvas = page.locator('#level-canvas');
  await loadTemplate(page, 'home');
  const animatedStart = Number(await canvas.getAttribute('data-render-count'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(animatedStart);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const reducedCount = Number(await canvas.getAttribute('data-render-count'));
  await page.waitForTimeout(500);
  await expect(canvas).toHaveAttribute('data-render-count', String(reducedCount));

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(reducedCount);
  expect(errors).toEqual([]);
});
test('canvas selection recognizes context, opens the owning details and keeps overlap cycling editable', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'zauberberg');
  await page.locator('[data-workspace="level"]').click();
  await page.locator('[data-tool="select"]').click();
  const overlap = await canvasPoint(page, 17, 11);
  await page.mouse.click(overlap.x, overlap.y);
  await expect(page.locator('[data-workspace="objects"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.selection-summary')).toBeVisible();
  await expect(page.locator('.selection-summary')).toContainText('Konzertbox');
  await expect(page.locator('.selection-summary')).toContainText('Objekt · Objektwerkstatt');
  const under = await canvasPoint(page, 17, 11);
  await page.keyboard.down('Alt');
  await page.mouse.click(under.x, under.y);
  await page.keyboard.up('Alt');
  await expect(page.locator('.selection-summary')).toContainText('Bühnenlichter');
  await expect(page.locator('.selection-summary')).toContainText('Systemkulisse · Objektwerkstatt');
  await expect(page.locator('[data-workspace="objects"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.object-inspector')).toContainText('Bühnenlichter');
  await page.locator('.object-inspector').getByLabel('Bewegungsanimation', { exact: true }).selectOption('spin');
  await page.locator('.object-inspector').getByLabel('Bewegungsanimation Tempo', { exact: true }).fill('2.5'); await page.locator('.object-inspector').getByLabel('Bewegungsanimation Tempo', { exact: true }).blur();
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.locator('.object-inspector').getByLabel('Bewegungsanimation', { exact: true })).toHaveValue('spin');
  await expect(page.locator('.object-inspector').getByLabel('Bewegungsanimation Tempo', { exact: true })).toHaveValue('2.5');
  expect(errors).toEqual([]);
});

test('scene tree searches, filters, multi-selects, hides, locks and reorders stable instances', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'zauberberg');
  await openSceneTree(page);
  const tree = page.locator('.scene-tree');
  await tree.getByLabel('Szenenbaum durchsuchen').fill('Konzertbox');
  await expect(tree.locator('.scene-node')).toHaveCount(1);
  await tree.getByLabel('Szenenbaum durchsuchen').fill('');
  await tree.getByLabel('Elementtyp filtern').selectOption('objects');
  await expect(tree.locator('.scene-node')).toHaveCount(3);
  await tree.getByLabel('Elementtyp filtern').selectOption('all');

  const title = tree.locator('[data-scene-key="decoration:zauberberg-titel"]');
  const speaker = tree.locator('[data-scene-key="decoration:zauberberg-box"]');
  await title.locator('.scene-node-main').click();
  await speaker.locator('.scene-node-main').click({ modifiers: ['Shift'] });
  await expect(page.locator('#level-canvas')).toHaveAttribute('data-selection-count', '2');
  await expect(page.locator('.selection-summary')).toContainText('2 Elemente ausgewählt');

  await speaker.getByRole('button', { name: 'Konzertbox ausblenden' }).click();
  await expect(speaker).toHaveClass(/hidden/);
  await speaker.getByRole('button', { name: 'Konzertbox einblenden' }).click();
  await speaker.getByRole('button', { name: 'Konzertbox sperren' }).click();
  await expect(speaker).toHaveClass(/locked/);
  await speaker.getByRole('button', { name: 'Konzertbox entsperren' }).click();

  const before = await tree.locator('[data-scene-key^="decoration:"]').evaluateAll((nodes) => nodes.map((node) => node.dataset.sceneKey));
  await title.locator('.scene-node-actions button[title="Nach vorne"]').click();
  const after = await tree.locator('[data-scene-key^="decoration:"]').evaluateAll((nodes) => nodes.map((node) => node.dataset.sceneKey));
  expect(after).not.toEqual(before);

  await page.keyboard.press('Escape');
  await expect(page.locator('#level-canvas')).toHaveAttribute('data-selection-count', '0');
  expect(errors).toEqual([]);
});

test('placed wall blocks are selectable, individually editable and route-persistent', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'hals');
  await page.locator('[data-workspace="level"]').click();
  await page.locator('[data-tool="select"]').click();
  const wall = await canvasPoint(page, 3, 3);
  await page.mouse.click(wall.x, wall.y);
  await expect(page.locator('.selection-summary')).toContainText(/Wand 1|Wandblock/);
  await expect(page.getByLabel('Ausgewählte Wand bearbeiten')).toBeVisible();
  await page.getByLabel('Wand Muster').selectOption('brick');
  await page.getByLabel('Themefarbe für Wand').uncheck();
  await page.getByLabel('Wand Eigenfarbe').fill('#a14f3f');
  await expect.poll(() => new URL(page.url()).searchParams.get('selection')).toMatch(/^wall:/);
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.getByLabel('Ausgewählte Wand bearbeiten')).toBeVisible();
  await expect(page.getByLabel('Wand Muster')).toHaveValue('brick');
  await expect(page.getByLabel('Themefarbe für Wand')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('Zauberberg contains no baked, placed, event-backed or cutscene note', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'zauberberg');
  await page.locator('[data-workspace="objects"]').click();
  await openSceneTree(page);
  const tree = page.locator('.scene-tree');
  await expect(tree.locator('[data-scene-key*="note"]')).toHaveCount(0);
  await expect(tree.locator('[data-scene-key="theme-element:stage-note"]')).toHaveCount(0);
  await page.locator('[data-workspace="events"]').click();
  await page.locator('.event-browser button').filter({ hasText: 'Zauberberg-Zugabe' }).click();
  await expect(page.locator('.property-panel').getByLabel('Symboltyp')).toHaveValue('none');
  await expect(page.locator('.property-panel').getByLabel('Objekt aus Bibliothek')).toHaveValue('');
  await page.locator('[data-workspace="cutscenes"]').click();
  await expect(page.locator('.track-browser')).not.toContainText('note-solo');
  expect(errors).toEqual([]);
});
test('universal objects can be created as pixel assets and placed into any map', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await page.locator('[data-workspace="objects"]').click();
  await page.locator('#create-object').click();
  const creator = page.getByRole('dialog', { name: 'Was soll im Level erscheinen?' });
  await expect(creator).toContainText('Abbrechen hinterlässt keinen leeren Bibliothekseintrag');
  await creator.getByLabel('Name').fill('Mein Pixelobjekt');
  await creator.getByRole('button', { name: /Im Sprite-Studio gestalten/ }).click();
  await expect(page.locator('.sprite-studio')).toBeVisible();
  await page.locator('.pixel-grid button[data-x="0"][data-y="0"]').click();
  await page.getByRole('button', { name: '＋ Keyframe duplizieren' }).click();
  await page.getByRole('button', { name: 'Sprite übernehmen' }).click();
  await expect(page.locator('.asset-list')).toContainText('Mein Pixelobjekt');
  await loadTemplate(page, 'hals');
  await openObjectLibrary(page);
  await selectAssetForPlacement(page, 'music-note');
  const target = await canvasPoint(page, 2, 2); await page.mouse.click(target.x, target.y);
  await openSceneTree(page);
  await expect(page.locator('.scene-tree')).toContainText('Musiknote');
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.locator('.scene-tree')).toContainText('Musiknote');
  await page.locator('.object-sidebar .sidebar-mode-tabs').getByRole('button', { name: /Assets/ }).click();
  await expect(page.locator('.asset-list')).toContainText('Mein Pixelobjekt');
  expect(errors).toEqual([]);
});

test('asset creation is transactional, supports practical 24px drawing tools and joins global history', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await switchWorkspace(page, 'objects');
  await expect(page.locator('.object-workspace')).toHaveAttribute('data-library-status', 'ready');
  const assets = page.locator('.asset-list [data-asset-id]');
  const originalIds = await assets.evaluateAll((nodes) => nodes.map((node) => node.dataset.assetId).sort());

  await page.locator('#create-object').click();
  const creator = page.getByRole('dialog', { name: 'Was soll im Level erscheinen?' });
  await expect(creator.locator('input[type="radio"][value="24"]')).toBeChecked();
  await creator.getByLabel('Name').fill('Verworfener Entwurf');
  await creator.getByRole('button', { name: 'Abbrechen' }).click();
  await expect.poll(() => assets.evaluateAll((nodes) => nodes.map((node) => node.dataset.assetId).sort())).toEqual(originalIds);
  await expect(page.getByText('Verworfener Entwurf', { exact: true })).toHaveCount(0);

  await page.locator('#create-object').click();
  await creator.getByLabel('Name').fill('Werkzeugprobe');
  await creator.getByRole('button', { name: /Im Sprite-Studio gestalten/ }).click();
  await expect(page.getByLabel('Sprite-Auflösung')).toHaveValue('24');
  await expect(page.locator('.pixel-grid button')).toHaveCount(24 * 24);
  const firstPixel = page.locator('.pixel-grid button[data-x="0"][data-y="0"]');
  const lastPixel = page.locator('.pixel-grid button[data-x="23"][data-y="23"]');
  const emptyColor = await lastPixel.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole('button', { name: /Füllen/ }).click(); await firstPixel.click();
  await expect.poll(() => lastPixel.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(emptyColor);
  await page.getByRole('button', { name: 'Sprite-Änderung rückgängig' }).click();
  await expect.poll(() => lastPixel.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(emptyColor);

  await page.getByRole('button', { name: /Linie/ }).click();
  const lineStart = await firstPixel.boundingBox(); const lineEnd = await page.locator('.pixel-grid button[data-x="23"][data-y="0"]').boundingBox();
  if (!lineStart || !lineEnd) throw new Error('Pixelwerkzeug besitzt keine sichtbare Zeichenfläche.');
  await page.mouse.move(lineStart.x + lineStart.width / 2, lineStart.y + lineStart.height / 2); await page.mouse.down();
  await page.mouse.move(lineEnd.x + lineEnd.width / 2, lineEnd.y + lineEnd.height / 2, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('.sprite-layout')).toHaveAttribute('data-pixel-selection-count', '24');
  await page.getByRole('button', { name: 'Sprite übernehmen' }).click();
  await expect(assets).toHaveCount(originalIds.length + 1);
  await expect(page.locator('.asset-list')).toContainText('Werkzeugprobe');

  await page.locator('.topbar-status button[title^="Rückgängig"]').click();
  await expect(assets).toHaveCount(originalIds.length);
  await page.locator('.topbar-status button[title^="Wiederholen"]').click();
  await expect(assets).toHaveCount(originalIds.length + 1);
  expect(errors).toEqual([]);
});

test('Franz and Lola use a five-state sprite-sheet and tile-map workflow', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'home');
  await page.locator('[data-workspace="characters"]').click();
  await expect(page.locator('.actor-browser .actor-thumbnail')).toHaveCount(4);
  for (const preview of await page.locator('.actor-browser .actor-thumbnail').all()) expect(await canvasHasVisiblePixels(preview)).toBe(true);
  await expect(page.locator('.state-matrix > div')).toHaveCount(5);
  await expect(page.locator('.state-matrix .actor-thumbnail')).toHaveCount(5);
  for (const preview of await page.locator('.state-matrix .actor-thumbnail').all()) expect(await canvasHasVisiblePixels(preview)).toBe(true);
  await page.locator('.actor-browser button').filter({ hasText: 'Katze 1' }).click();
  await expect(page.locator('.character-hero .actor-thumbnail')).toHaveAttribute('data-actor-kind', 'cat');
  expect(await canvasHasVisiblePixels(page.locator('.character-hero .actor-thumbnail'))).toBe(true);
  await page.locator('.actor-browser button').filter({ hasText: 'Franz & Lola' }).click();
  await page.getByRole('button', { name: /Sprite-Sheet bearbeiten/ }).click();
  await expect(page.locator('.state-tabs button')).toHaveCount(5);
  const idleSignature = await canvasSignature(page.locator('.sprite-playback-stage .actor-thumbnail'));
  await page.locator('.state-tabs button').filter({ hasText: 'right' }).click();
  await expect(page.getByLabel('Verwendete Animation')).toHaveValue('right');
  await expect.poll(() => canvasSignature(page.locator('.sprite-playback-stage .actor-thumbnail'))).not.toBe(idleSignature);
  const before = await page.locator('.sheet-grid > button').count();
  await page.locator('.pixel-grid button[data-x="0"][data-y="0"]').click();
  await page.getByRole('button', { name: '⬚ Auswählen' }).click();
  await page.locator('.pixel-grid button[data-x="0"][data-y="0"]').click();
  await page.locator('.pixel-grid button[data-x="1"][data-y="0"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('.sprite-layout')).toHaveAttribute('data-pixel-selection-count', '2');
  await page.getByRole('button', { name: 'Farbe anwenden' }).click();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.sprite-layout')).toHaveAttribute('data-pixel-selection-count', '2');
  await page.getByRole('button', { name: '＋ Keyframe duplizieren' }).click();
  await expect(page.locator('.sheet-grid > button')).toHaveCount(before + 1);
  await page.getByRole('button', { name: 'Sprite übernehmen' }).click();
  await expect(page.locator('.state-matrix')).toContainText('right');
  await page.waitForTimeout(250); await page.reload(); await page.locator('[data-workspace="characters"]').click();
  await expect(page.locator('.state-matrix')).toContainText('right');
  expect(errors).toEqual([]);
});

test('asset selection opens the global editor and placement creates a distinct level instance', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'hals');
  await page.locator('[data-workspace="objects"]').click();
  await expect(page.locator('.object-sidebar .sidebar-mode-tabs').getByRole('button', { name: /Assets/ })).toHaveClass(/active/);
  await expect(page.locator('.asset-list')).toBeVisible();
  await page.locator('[data-asset-id="music-note"]').click();
  await expect(page.locator('.object-inspector')).toHaveAttribute('data-object-context', 'asset');
  await expect(page.locator('.object-inspector')).toContainText('GLOBALE ASSET-VORLAGE');
  await expect(page.locator('[data-action="place-asset-toolbar"]')).not.toHaveClass(/active/);
  await page.locator('[data-asset-setting="category"]').fill('Feier-Test');
  await expect(page.locator('[data-asset-id="music-note"]')).toContainText('Feier-Test');

  await page.locator('[data-action="place-asset"]').click();
  const target = await canvasPoint(page, 3, 3); await page.mouse.click(target.x, target.y);
  await expect(page.locator('.object-inspector')).toHaveAttribute('data-object-context', 'instance');
  await expect(page.locator('.object-inspector')).toContainText('LEVEL-INSTANZ');
  await page.locator('.linked-instance').getByRole('button', { name: /Vorlage bearbeiten/ }).click();
  await expect(page.locator('.object-inspector')).toHaveAttribute('data-object-context', 'asset');
  await expect(page.locator('#level-canvas')).toHaveAttribute('data-selection-count', '0');
  expect(errors).toEqual([]);
});

test('linked object settings, instance overrides and selection feedback update on the input event', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'hals');
  await openObjectLibrary(page);
  await selectAssetForPlacement(page, 'music-note');
  const target = await canvasPoint(page, 2, 2); await page.mouse.click(target.x, target.y);

  await expect(page.locator('#level-canvas')).toHaveAttribute('data-selected-entity', /^decoration:/);
  await openSceneTree(page);
  await expect(page.locator('.scene-node.selected')).toContainText('Musiknote');
  const instanceColor = page.locator('[data-instance-setting="color"]');
  await page.locator('.linked-instance').getByRole('button', { name: /Vorlage bearbeiten/ }).click();
  const globalColor = page.locator('[data-asset-setting="color"]');
  await globalColor.evaluate((input) => { input.value = '#ff00aa'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await openSceneTree(page);
  await page.locator('.scene-tree .scene-node-main').filter({ hasText: 'Musiknote' }).click();
  await expect(instanceColor).toHaveValue('#ff00aa');
  await expect(page.locator('.linked-instance')).toContainText('Alle Werte folgen der Vorlage');

  await instanceColor.evaluate((input) => { input.value = '#2255dd'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('.linked-instance')).toContainText('1 lokale Abweichung');
  await page.locator('.linked-instance').getByRole('button', { name: /Vorlage bearbeiten/ }).click();
  await expect(globalColor).toHaveValue('#ff00aa');

  await globalColor.evaluate((input) => { input.value = '#33cc44'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await openSceneTree(page);
  await page.locator('.scene-tree .scene-node-main').filter({ hasText: 'Musiknote' }).click();
  await expect(instanceColor).toHaveValue('#2255dd');
  await page.locator('.linked-instance').getByRole('button', { name: /color/ }).click();
  await expect(instanceColor).toHaveValue('#33cc44');
  await expect(page.locator('.linked-instance')).toContainText('Alle Werte folgen der Vorlage');
  expect(errors).toEqual([]);
});

test('selection context offers the inferred direct tool without hiding the selected object', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'zauberberg');
  await openSceneTree(page);
  await page.locator('[data-scene-key="decoration:zauberberg-box"] .scene-node-main').click();
  await expect(page.locator('[data-workspace="objects"]')).toHaveAttribute('aria-current', 'page');
  const context = page.locator('.selection-summary');
  await expect(context).toHaveAttribute('data-selection-kind', 'decoration');
  await expect(context).toHaveAttribute('data-selection-workspace', 'objects');
  await expect(context).toContainText('Objekt · Objektwerkstatt');
  await context.getByRole('button', { name: 'Direkt bewegen & skalieren' }).click();
  await expect(page.locator('[data-tool="transform"]')).toHaveClass(/active/);
  await context.getByRole('button', { name: 'Im Level zeigen' }).click();
  await expect(page.locator('[data-workspace="level"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#level-canvas')).toHaveAttribute('data-selection-count', '1');
  expect(errors).toEqual([]);
});

test('global character wizard creates a reusable non-cat figure and places a self-contained level instance', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await openProject(page);
  await page.getByRole('button', { name: /Neues Level/ }).click();
  await page.locator('[data-workspace="characters"]').click();
  await expect(page.locator('#create-character')).toBeVisible();
  await page.locator('#create-character').click();
  await expect(page.getByRole('dialog', { name: 'Wer soll Passau bereichern?' })).toBeVisible();
  await page.locator('#character-name').fill('Passauer Postler');
  await expect(page.getByRole('dialog').locator('input[type="radio"][value="24"]')).toBeChecked();
  await expect(page.getByRole('dialog')).toContainText('Maximale Details');
  await page.getByRole('button', { name: /Weiter zum Sprite-Studio/ }).click();
  await expect(page.locator('.sprite-studio')).toBeVisible();
  await expect(page.locator('.state-tabs button')).toHaveCount(5);
  await expect(page.getByLabel('Sprite-Auflösung')).toHaveValue('24');
  await expect(page.locator('.pixel-grid button')).toHaveCount(24 * 24);
  const authoredPixel = page.locator('.pixel-grid button[data-x="23"][data-y="0"]');
  const emptyPixel = await authoredPixel.evaluate((button) => getComputedStyle(button).backgroundColor);
  await authoredPixel.click();
  await expect.poll(() => authoredPixel.evaluate((button) => getComputedStyle(button).backgroundColor)).not.toBe(emptyPixel);
  await page.getByRole('button', { name: 'Sprite-Änderung rückgängig' }).click();
  await expect.poll(() => authoredPixel.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe(emptyPixel);
  await page.getByRole('button', { name: 'Sprite-Änderung wiederholen' }).click();
  await expect.poll(() => authoredPixel.evaluate((button) => getComputedStyle(button).backgroundColor)).not.toBe(emptyPixel);
  await page.getByRole('button', { name: 'Sprite übernehmen' }).click();

  const globalCharacter = page.locator('[data-character-id="passauer-postler"]');
  await expect(globalCharacter).toContainText('Global · in allen Levels');
  await expect.poll(() => canvasHasVisiblePixels(globalCharacter.locator('.actor-thumbnail'))).toBe(true);
  await expect(page.locator('.property-panel')).toContainText('Freie Figuren stehen im normalen Spiel');
  await page.locator('.character-hero .place-character-button').click();
  await expect(page.locator('[data-workspace="level"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.character-placement-banner')).toContainText('Passauer Postler platzieren');
  const point = await canvasPoint(page, 5, 5);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.character-placement-banner')).toHaveCount(0);
  await expect(page.locator('#level-canvas')).toHaveAttribute('data-selected-entity', 'character:0');
  await expect(page.locator('#level-canvas')).toHaveClass(/transform-tool/);
  await expect(page.locator('.character-instance-inspector')).toContainText('Passauer Postler');

  const moveFrom = await canvasExactPoint(page, 5.5, 5.5); const moveTo = await canvasExactPoint(page, 8.5, 7.5);
  await page.mouse.move(moveFrom.x, moveFrom.y); await page.mouse.down(); await page.mouse.move(moveTo.x, moveTo.y, { steps: 6 }); await page.mouse.up();
  await expect(page.getByLabel('Figur X')).toHaveValue('8');
  await expect(page.getByLabel('Figur Y')).toHaveValue('7');
  const scaleFrom = await canvasExactPoint(page, 9, 8); const scaleTo = await canvasExactPoint(page, 10, 9);
  await page.mouse.move(scaleFrom.x, scaleFrom.y); await page.mouse.down(); await page.mouse.move(scaleTo.x, scaleTo.y, { steps: 6 }); await page.mouse.up();
  await expect(page.getByLabel('Figur Skalierung im Level')).toHaveValue('2');

  await page.locator('[data-workspace="characters"]').click();
  await expect(page.locator('[data-level-character-id]')).toHaveCount(1);
  await expect(page.locator('[data-level-character-id]')).toContainText('Passauer Postler');
  await expect(page.locator('.actor-browser button').filter({ hasText: /^Katze/ })).toHaveCount(0);
  await page.locator('[data-level-character-id]').click();
  await expect(page.locator('.property-panel').getByLabel('Name')).toHaveValue('Passauer Postler');
  await expect(page.locator('.property-panel')).toContainText('als Darsteller in Cutscenes');
  await expect(page.getByLabel('Figur Skalierung')).toHaveValue('2');

  await loadTemplate(page, 'home');
  await page.locator('[data-workspace="characters"]').click();
  await expect(page.locator('[data-character-id="passauer-postler"]')).toBeVisible();
  await expect(page.locator('[data-level-character-id]')).toHaveCount(0);
  await page.reload();
  await page.locator('[data-workspace="characters"]').click();
  await expect(page.locator('[data-character-id="passauer-postler"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('character creation stays usable on a phone viewport @mobile', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await switchWorkspace(page, 'characters');
  await expect(page.locator('#create-character')).toBeVisible();
  await page.locator('#create-character').click();
  const dialog = page.getByRole('dialog', { name: 'Wer soll Passau bereichern?' });
  await expect(dialog).toBeInViewport();
  await page.locator('#character-name').fill('Donaunixe');
  await dialog.getByText('Leere Leinwand').click();
  await dialog.getByRole('button', { name: /Weiter zum Sprite-Studio/ }).click();
  await expect(page.locator('.sprite-studio')).toBeVisible();
  await page.locator('.pixel-grid').scrollIntoViewIfNeeded();
  await expect(page.locator('.pixel-grid')).toBeInViewport();
  await page.getByRole('button', { name: 'Sprite übernehmen' }).click();
  await expect(page.locator('.character-hero')).toContainText('Donaunixe');
  expect(errors).toEqual([]);
});

test('every level exposes its own event and differently authored cutscene through the UI', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await openCleanEditor(page);
  const signatures = [];
  for (const story of storyCases) {
    await loadTemplate(page, story.id);
    await page.locator('[data-workspace="events"]').click();
    await expect(page.locator('.event-browser button')).toHaveCount(story.eventCount);
    const eventButton = page.locator('.event-browser button').filter({ hasText: story.event });
    await expect(eventButton).toHaveCount(1);
    await eventButton.click();
    await expect(page.locator('.event-message-preview')).toContainText(story.event);
    await expect(page.locator('.property-panel').getByLabel('Meldung', { exact: true })).not.toHaveValue('');
    await expect(page.locator('.property-panel').getByLabel('Meldung im Dialekt')).not.toHaveValue('');
    if (story.visualAsset === false) await expect(page.locator('.property-panel').getByLabel('Objekt aus Bibliothek')).toHaveValue('');
    else await expect(page.locator('.property-panel').getByLabel('Objekt aus Bibliothek')).not.toHaveValue('');

    await page.locator('[data-workspace="cutscenes"]').click();
    await expect(page.locator('.cutscene-selector')).toContainText(story.cutscene);
    await expect(page.locator('.timeline-row')).toHaveCount(story.tracks);
    await expect(page.locator('.timeline-lane > button')).toHaveCount(story.keyframes);
    await expect(page.locator('.cutscene-transport input')).toHaveAttribute('max', String(story.duration));
    await expect.poll(() => canvasHasVisiblePixels(page.getByLabel('Cutscene-Vorschau'))).toBe(true);
    signatures.push(`${story.duration}:${story.tracks}:${story.keyframes}`);
  }
  expect(new Set(signatures).size).toBe(storyCases.length);
  expect(errors).toEqual([]);
});

test('level-bound cutscenes combine camera, actors, objects, dialogue and timeline preview', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'zauberberg');
  await page.locator('[data-workspace="cutscenes"]').click();
  await expect(page.locator('.timeline-row')).toHaveCount(5);
  await expect(page.locator('.track-browser')).not.toContainText('note-solo');
  await expect(page.locator('.track-browser')).toContainText('rock-katze');
  const preview = page.getByLabel('Cutscene-Vorschau');
  await expect(preview).toHaveAttribute('data-render-profile', 'editor');
  const scrubStart = Number(await preview.getAttribute('data-render-count'));
  await page.locator('.cutscene-transport input').evaluate((input) => { input.value = '3'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect.poll(async () => Number(await preview.getAttribute('data-render-count'))).toBeGreaterThan(scrubStart);
  await expect(page.locator('.dialogue-card')).toContainText('Rock, Punk und Metal');
  await page.locator('.cutscene-transport button').click();
  await expect(preview).toHaveAttribute('data-render-profile', 'playtest');
  const playbackStart = Number(await preview.getAttribute('data-render-count'));
  await expect.poll(async () => Number(await preview.getAttribute('data-render-count'))).toBeGreaterThan(playbackStart);
  await page.locator('.cutscene-transport button').click();
  await expect(preview).toHaveAttribute('data-render-profile', 'editor');
  await page.waitForTimeout(100);
  const pausedCount = Number(await preview.getAttribute('data-render-count'));
  await page.waitForTimeout(350);
  await expect(preview).toHaveAttribute('data-render-count', String(pausedCount));
  await page.reload(); await page.locator('[data-workspace="cutscenes"]').click();
  await expect(page.locator('.timeline-row')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('cutscene authoring prevents broken tracks and edits a keyframe at the visible playhead', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await switchWorkspace(page, 'cutscenes');
  await page.locator('#add-cutscene').click();
  const objectTrack = page.locator('.track-add-grid').getByRole('button', { name: /Objekt/ });
  await expect(objectTrack).toBeDisabled();
  await expect(page.locator('.track-browser')).toContainText('Objektspuren werden verfügbar');

  await page.locator('.track-add-grid').getByRole('button', { name: /Figur/ }).click();
  const selectedTrack = page.locator('.track-browser > button.active');
  await expect(selectedTrack).toContainText('Figur');
  const transport = page.locator('.cutscene-transport input');
  await transport.evaluate((input) => { input.value = '1.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.getByRole('button', { name: /Keyframe bei 1\.50 s/ }).click();
  await expect(page.locator('.timeline-row').last().locator('.timeline-lane > button')).toHaveCount(2);
  await expect(page.getByLabel('Zeit', { exact: true })).toHaveValue('1.5');

  const trackId = page.getByLabel('Track-ID');
  await trackId.fill('hauptdarsteller'); await trackId.blur();
  await expect(page.locator('.track-browser')).toContainText('hauptdarsteller');
  await page.getByLabel('Skalierung').fill('1.75');
  await page.getByLabel('Drehung').fill('15');
  await page.getByLabel('Deckkraft').fill('0.6');
  await expect(page.getByLabel('Skalierung')).toHaveValue('1.75');
  await expect(page.getByLabel('Drehung')).toHaveValue('15');
  await expect(page.getByLabel('Deckkraft')).toHaveValue('0.6');
  expect(errors).toEqual([]);
});

test('events keep triggers, both language variants and visual placement in one discipline', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'home');
  await page.locator('[data-workspace="events"]').click();
  await expect(page.locator('.event-browser button')).toHaveCount(3);
  await expect(page.locator('.event-browser')).toContainText('Eisvogel an der Ilz');
  await expect(page.locator('.property-panel').getByLabel('Meldung', { exact: true })).toHaveValue('Donnerwetter, ein Eisvogel an der Ilz!');
  await expect(page.locator('.property-panel').getByLabel('Meldung im Dialekt')).toHaveValue('Sakradi, a Eisvogl an da Ilz!');
  await page.locator('#add-event').click();
  await page.locator('.property-panel').getByLabel('Name', { exact: true }).fill('Ilz-Fund'); await page.locator('.property-panel').getByLabel('Name', { exact: true }).blur();
  await page.getByRole('button', { name: /Zone im Canvas/ }).click();
  const start = await canvasPoint(page, 2, 2); const end = await canvasPoint(page, 4, 3);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 3 }); await page.mouse.up();
  await expect(page.locator('.zone-list fieldset')).toHaveCount(2);
  await page.getByLabel('Zone 2 Breite').fill('4'); await page.getByLabel('Zone 2 Breite').blur();
  await expect(page.getByLabel('Zone 2 Breite')).toHaveValue('4');
  await page.getByRole('button', { name: 'Zone 1 löschen' }).click();
  await expect(page.locator('.zone-list fieldset')).toHaveCount(1);
  await page.getByLabel('Auslösertyp').selectOption('direction-sequence');
  await page.getByRole('button', { name: 'Oben hinzufügen' }).click();
  await page.getByRole('button', { name: 'Rechts hinzufügen' }).click();
  await page.getByRole('button', { name: 'Unten hinzufügen' }).click();
  await expect(page.getByRole('status', { name: 'Richtungsfolge', exact: true })).toHaveText('↑ → ↓');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByRole('status', { name: 'Richtungsfolge', exact: true })).toHaveText('↑ →');
  await page.getByLabel('Auslösertyp').selectOption('zone');
  await page.getByRole('button', { name: /Symbol setzen/ }).click(); const visual = await canvasPoint(page, 6, 6); await page.mouse.click(visual.x, visual.y);
  await expect(page.locator('.property-panel').getByLabel('X', { exact: true })).toHaveValue('6.5');
  expect(errors).toEqual([]);
});

test('playtest runs the same intro, camera and direct controls as the game', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await page.locator('[data-workspace="cutscenes"]').click(); await page.locator('#add-cutscene').click();
  await switchWorkspace(page, 'playtest'); await page.locator('#start-playtest').click();
  await expect(page.locator('.playtest-top-overlay')).toContainText('CUTSCENE', { timeout: 15_000 });
  await page.getByRole('button', { name: /Intro überspringen/ }).click();
  const canvas = page.locator('#playtest-canvas');
  await expect(canvas).toHaveAttribute('data-render-profile', 'playtest');
  await expect(canvas).toHaveAttribute('data-presentation-kind', 'franz-lola-presentation-frame');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => canvas.getAttribute('data-player-direction')).toBe('right');
  const parity = await canvas.evaluate((element) => ({
    player: JSON.parse(element.dataset.snapshotPlayer),
    previousPlayer: JSON.parse(element.dataset.snapshotPreviousPlayer),
    cats: JSON.parse(element.dataset.snapshotCats),
    previousCats: JSON.parse(element.dataset.snapshotPreviousCats),
    presentedPlayer: JSON.parse(element.dataset.presentedPlayer),
    presentedCats: JSON.parse(element.dataset.presentedCats),
    alpha: Number(element.dataset.interpolationAlpha),
  }));
  const expectedPlayer = {
    x: parity.previousPlayer.x + (parity.player.x - parity.previousPlayer.x) * parity.alpha,
    y: parity.previousPlayer.y + (parity.player.y - parity.previousPlayer.y) * parity.alpha,
  };
  expect(Math.abs(parity.presentedPlayer.x - expectedPlayer.x)).toBeLessThan(1e-6);
  expect(Math.abs(parity.presentedPlayer.y - expectedPlayer.y)).toBeLessThan(1e-6);
  expect(parity.presentedCats).toHaveLength(parity.cats.length);
  parity.presentedCats.forEach((cat, index) => {
    const previous = parity.previousCats[index]; const current = parity.cats[index];
    expect(Math.abs(cat.x - (previous.x + (current.x - previous.x) * parity.alpha))).toBeLessThan(1e-6);
    expect(Math.abs(cat.y - (previous.y + (current.y - previous.y) * parity.alpha))).toBeLessThan(1e-6);
  });
  const display = await canvas.evaluate((element) => ({
    width: Number(element.dataset.displayWidth), height: Number(element.dataset.displayHeight),
    measuredWidth: Number(element.dataset.measuredWidth), measuredHeight: Number(element.dataset.measuredHeight),
    bufferWidth: Number(element.dataset.displayBufferWidth), bufferHeight: Number(element.dataset.displayBufferHeight),
  }));
  expect(display.width).toBe(display.measuredWidth);
  expect(display.height).toBe(display.measuredHeight);
  expect(display.bufferWidth).toBeGreaterThanOrEqual(display.width);
  expect(display.bufferHeight).toBeGreaterThanOrEqual(display.height);
  await page.locator('.playtest-hud').getByRole('button', { name: /Pause/ }).click();
  await expect(page.locator('.play-state')).toHaveText('PAUSE');
  await expect(canvas).toHaveAttribute('data-render-profile', 'editor');
  await page.waitForTimeout(100);
  const pausedCount = Number(await canvas.getAttribute('data-render-count'));
  await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute('data-render-count', String(pausedCount));
  await page.locator('.playtest-hud').getByRole('button', { name: /Weiter/ }).click();
  await expect(canvas).toHaveAttribute('data-render-profile', 'playtest');
  const activeCount = Number(await canvas.getAttribute('data-render-count'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(activeCount);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const reducedCount = Number(await canvas.getAttribute('data-render-count'));
  await page.waitForTimeout(400);
  await expect(canvas).toHaveAttribute('data-render-count', String(reducedCount));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(reducedCount);
  await page.locator('.playtest-hud').getByRole('button', { name: /Ende/ }).click();
  await expect(page.locator('.playtest-empty')).toBeVisible();
  await switchWorkspace(page, 'level');
  await switchWorkspace(page, 'playtest');
  await page.locator('#start-playtest').click();
  await expect(page.locator('.playtest-top-overlay')).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('playtest clamps a visible long frame and keeps its display contract', async ({ page }) => {
  const consoleProblems = [];
  page.on('console', (message) => { if (['warning', 'error'].includes(message.type())) consoleProblems.push(message.text()); });
  const errors = await openCleanEditor(page, '/?renderer=webgl2');
  await switchWorkspace(page, 'playtest');
  await expect(page.locator('.playtest-stage')).toHaveAttribute('data-renderer-ready', 'true');
  await page.locator('#start-playtest').click();
  await expect(page.locator('.playtest-top-overlay')).toBeVisible({ timeout: 15_000 });
  const skip = page.getByRole('button', { name: /Intro überspringen/ });
  if (await skip.isVisible()) await skip.click();
  const canvas = page.locator('#playtest-canvas');
  await expect(canvas).toHaveAttribute('data-renderer-backend', 'webgl2');
  await expect(canvas).toHaveAttribute('data-render-profile', 'playtest');
  await expect(canvas).toHaveAttribute('data-presentation-kind', 'franz-lola-presentation-frame');

  const longDelta = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const canvas = document.querySelector('#playtest-canvas');
    const observer = new MutationObserver(() => { observer.disconnect(); resolve(Number(canvas.dataset.frameDelta)); });
    observer.observe(canvas, { attributes: true, attributeFilter: ['data-frame-delta'] });
    const started = performance.now();
    while (performance.now() - started < 180) { /* visible main-thread delay */ }
  })));
  expect(longDelta).toBe(0.1);

  const parity = await canvas.evaluate((element) => ({
    player: JSON.parse(element.dataset.snapshotPlayer),
    previous: JSON.parse(element.dataset.snapshotPreviousPlayer),
    presented: JSON.parse(element.dataset.presentedPlayer),
    alpha: Number(element.dataset.interpolationAlpha),
  }));
  expect(Math.abs(parity.presented.x - (parity.previous.x + (parity.player.x - parity.previous.x) * parity.alpha))).toBeLessThan(1e-6);
  expect(Math.abs(parity.presented.y - (parity.previous.y + (parity.player.y - parity.previous.y) * parity.alpha))).toBeLessThan(1e-6);


  const originalCamera = await canvas.getAttribute('data-camera-source');
  const playtestOverlay = page.locator('.playtest-top-overlay');
  await playtestOverlay.getByRole('button', { name: /Kamera/ }).click();
  await expect.poll(() => canvas.getAttribute('data-camera-source')).not.toBe(originalCamera);
  await playtestOverlay.getByRole('button', { name: /Vollbild/ }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await playtestOverlay.getByRole('button', { name: /Vollbild/ }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);

  const beforeResize = Number(await canvas.getAttribute('data-measured-width'));
  await page.setViewportSize({ width: 1180, height: 760 });
  await expect.poll(async () => Number(await canvas.getAttribute('data-measured-width'))).not.toBe(beforeResize);
  const resized = await canvas.evaluate((element) => ({
    displayWidth: Number(element.dataset.displayWidth),
    displayHeight: Number(element.dataset.displayHeight),
    measuredWidth: Number(element.dataset.measuredWidth),
    measuredHeight: Number(element.dataset.measuredHeight),
    bufferWidth: Number(element.dataset.displayBufferWidth),
    bufferHeight: Number(element.dataset.displayBufferHeight),
  }));
  expect(resized.displayWidth).toBe(resized.measuredWidth);
  expect(resized.displayHeight).toBe(resized.measuredHeight);
  expect(resized.bufferWidth).toBeGreaterThanOrEqual(resized.displayWidth);
  expect(resized.bufferHeight).toBeGreaterThanOrEqual(resized.displayHeight);

  await page.setViewportSize({ width: 393, height: 760 });
  await expect(page.locator('.mobile-dpad')).toBeVisible();
  const small = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(small.scrollWidth).toBe(small.width);
  await page.screenshot({ path: 'output/playwright/task6-fixround2-small-playtest.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => Number(await canvas.getAttribute('data-measured-width'))).not.toBe(resized.measuredWidth);
  const screenshotStart = Number(await canvas.getAttribute('data-render-count'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(screenshotStart + 2);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'output/playwright/task6-fixround2-desktop-playtest.png' });
  expect(await page.locator('vite-error-overlay, #webpack-dev-server-client-overlay, [data-error-overlay], .error-overlay').count()).toBe(0);
  expect(consoleProblems).toEqual([]);
  expect(errors).toEqual([]);
});
test('playtest drops a hidden interval when a reactive edit is pending on resume', async ({ page, context }) => {
  const errors = await openCleanEditor(page);
  await switchWorkspace(page, 'playtest');
  await page.locator('#start-playtest').click();
  await expect(page.locator('.playtest-top-overlay')).toBeVisible({ timeout: 15_000 });
  const skip = page.getByRole('button', { name: /Intro überspringen/ });
  if (await skip.isVisible()) await skip.click();
  const canvas = page.locator('#playtest-canvas');
  await expect(canvas).toHaveAttribute('data-render-profile', 'playtest');
  const languageButton = page.locator('.playtest-top-overlay').getByRole('button', { name: /DE · Schön|BAY · Dialekt/ });
  const languageBefore = await languageButton.textContent();
  await page.evaluate(() => {
    window.__task6ResumeDeltas = [];
    window.__task6VisibilityStates = [document.visibilityState];
    document.addEventListener('visibilitychange', () => window.__task6VisibilityStates.push(document.visibilityState));
    const canvas = document.querySelector('#playtest-canvas');
    window.__task6ResumeObserver = new MutationObserver(() => {
      window.__task6ResumeDeltas.push(Number(canvas.dataset.frameDelta));
    });
    window.__task6ResumeObserver.observe(canvas, { attributes: true, attributeFilter: ['data-frame-delta'] });
  });

  const [foreground] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => window.open('about:blank', '_blank')),
  ]);
  await foreground.bringToFront();
  const becameHidden = await page.waitForFunction(() => document.visibilityState === 'hidden', null, { timeout: 1500 }).then(() => true).catch(() => false);
  if (!becameHidden) {
    expect(process.env.TASK6_REQUIRE_REAL_VISIBILITY, 'headed evidence requires an actual hidden tab').not.toBe('1');
    await foreground.close();
    const fallback = await page.evaluate(async ({ coordinatorUrl }) => {
      const [{ createRenderCoordinator }, { createStudioRenderSession }, { playtestFrameDelta }] = await Promise.all([
        import(coordinatorUrl),
        import('/src/render/studio-render-session.svelte.js'),
        import('/src/playtest-engine.js'),
      ]);
      let pending = null;
      const clock = {
        adapter: {
          requestFrame(callback) { pending = callback; return 1; },
          cancelFrame() { pending = null; },
          now: () => 0,
        },
        present(timestamp) { const callback = pending; pending = null; callback?.(timestamp); },
      };
      const coordinator = createRenderCoordinator(clock.adapter);
      const frames = [];
      let previousTimestamp = null;
      const session = createStudioRenderSession({
        coordinator,
        id: 'browser-visibility-fallback',
        profile: 'playtest',
        render(frame) {
          frames.push({
            reason: frame.reason,
            resume: frame.visibilityResume,
            delta: playtestFrameDelta(previousTimestamp, frame.timestamp, { resume: frame.visibilityResume }),
          });
          previousTimestamp = frame.timestamp;
        },
      });
      session.setAnimationActivity({ continuous: true, restartKey: 'playtest-v1' });
      clock.present(0);
      session.setVisible(false);
      session.invalidate('project:hidden-edit');
      session.setVisible(true);
      clock.present(1000);
      clock.present(1100);
      session.destroy();
      return frames.slice(1);
    }, { coordinatorUrl: renderCoordinatorBrowserUrl });
    expect(fallback).toEqual([
      { reason: 'project:hidden-edit', resume: true, delta: 0 },
      { reason: 'project:hidden-edit', resume: false, delta: 0.1 },
    ]);
    expect(errors).toEqual([]);
    return;
  }
  await page.evaluate(() => { window.__task6ResumeDeltas.length = 0; document.querySelector('.playtest-top-overlay button').click(); });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  await expect.poll(() => page.evaluate(() => window.__task6ResumeDeltas.length)).toBeGreaterThan(2);
  const evidence = await page.evaluate(() => {
    window.__task6ResumeObserver.disconnect();
    return { deltas: window.__task6ResumeDeltas, visibility: window.__task6VisibilityStates };
  });
  expect(evidence.visibility).toEqual(expect.arrayContaining(['hidden', 'visible']));
  expect(evidence.deltas[0]).toBe(0);
  expect(evidence.deltas.slice(1).some((delta) => delta > 0)).toBe(true);
  await expect(languageButton).not.toHaveText(languageBefore);
  await foreground.close();
  expect(errors).toEqual([]);
});
test('authorized non-technical editors share and publish mixed exact content revisions together', async ({ page }) => {
  const errors = []; const published = []; const shared = new Map(); const content = new Map(); let checks = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://franz-lola-publisher.test.workers.dev/**', async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const origin = request.headers().origin;
    if (!origin) throw new Error('Publisher request is missing its browser Origin header.');
    const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/me') return route.fulfill({ headers, json: { login: 'freundin', name: 'Franz-Lola-Redaktion' } });
    if (path === '/api/drafts/bootstrap') return route.fulfill({ headers, json: { drafts: [...shared.values()].map(({ level, ...draft }) => draft) } });
    if (path === '/api/content/bootstrap') return route.fulfill({ headers, json: { items: [...content.values()] } });
    if (path.startsWith('/api/drafts/') && request.method() === 'PUT') {
      const body = request.postDataJSON(); const revision = body.expectedRevision + 1;
      const draft = { id: body.level.id, name: body.level.name.standard, icon: body.level.icon, area: body.level.location.area, revision, status: 'draft', updatedBy: 'freundin', updatedAt: '2026-08-08T12:00:00.000Z', level: body.level };
      shared.set(draft.id, draft); return route.fulfill({ headers, json: draft });
    }
    if (path.startsWith('/api/content/') && request.method() === 'PUT') {
      const body = request.postDataJSON(); const revision = body.expectedRevision + 1;
      const item = { type: body.content.type, id: body.content.id, name: body.content.name, description: body.content.description, revision, status: 'draft', updatedBy: 'freundin', updatedAt: '2026-08-08T12:00:00.000Z', content: body.content };
      content.set(`${item.type}:${item.id}`, item); return route.fulfill({ headers, json: item });
    }
    if (path === '/api/publish') { published.push(request.postDataJSON()); return route.fulfill({ status: 202, headers, json: { publicationId: 42, state: 'testing', phase: 'upload-complete', phaseLabel: 'Inhalte sicher übertragen', progress: 22, detail: 'Inhalte wurden sicher übertragen.' } }); }
    if (path === '/api/publications/42') { checks += 1; return route.fulfill({ headers, json: checks > 1 ? { state: 'published', phase: 'published', phaseLabel: 'GitHub Pages ist aktuell', progress: 100, detail: 'Das Level ist live.', checkedAt: '2026-08-05T18:00:00.000Z', gameUrl: 'https://matthaeusstumptner.github.io/Geburtstagsspiel/' } : { state: 'deploying', phase: 'deploy-build', phaseLabel: 'Spiel für GitHub Pages bauen', progress: 89, detail: 'Das optimierte Browser-Spiel wird gebaut.', checkedAt: '2026-08-05T17:59:58.000Z' } }); }
    return route.fulfill({ status: 404, headers, json: { error: 'Nicht gefunden.' } });
  });
  await page.goto('/#publisher_session=test.session-token'); await expect(page.locator('#level-canvas')).toBeVisible();
  await loadTemplate(page, 'home'); await page.waitForTimeout(250);
  await loadTemplate(page, 'hals'); await page.waitForTimeout(250);
  await page.locator('[data-workspace="publish"]').click();
  await expect(page.locator('.publisher-user')).toContainText('Franz-Lola-Redaktion');
  await expect.poll(() => page.url()).not.toContain('publisher_session');
  await expect(page.locator('.publish-candidate[data-content-type="level"]')).toHaveCount(2);
  await page.getByLabel('Level Dahoam · Am Bramerhof auswählen').check();
  await page.locator('.publish-candidate[data-content-type="tileset"] input').check();
  await page.locator('#publisher-confirm').click();
  await expect(page.getByRole('progressbar', { name: 'Veröffentlichungsfortschritt' })).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('.publish-activity')).toContainText('GitHub Pages ist aktuell');
  await expect(page.locator('.publication-steps .done')).toHaveCount(5);
  await expect(page.locator('.publish-state')).toContainText('Inhalte sind live!', { timeout: 10_000 });
  await openProject(page);
  await expect(page.locator('.shared-draft-section')).toContainText('Gemeinsame Entwürfe');
  await expect(page.locator('.shared-draft-section .draft-entry')).toHaveCount(2);
  expect(published).toHaveLength(1); expect(published[0].drafts.map((draft) => draft.id).sort()).toEqual(['hals', 'home']);
  expect(published[0].drafts.every((draft) => draft.revision === 1)).toBe(true);
  expect(published[0].items).toEqual([{ type: 'tileset', id: 'hals-neighborhood', revision: 1 }]);
  expect(errors).toEqual([]);
});

test('an old browser draft automatically adopts the shared baseline without becoming a change', async ({ page }) => {
  const { errors, writes } = await openConflictingCloudEditor(page);
  await expect(page.locator('#publisher-confirm')).toBeEnabled();
  await page.waitForTimeout(1100);
  expect(writes).toHaveLength(0);
  const workspace = await page.evaluate(() => JSON.parse(localStorage.getItem('franz-lola-level-editor-workspace-v2')));
  expect(workspace.drafts.zauberberg.sync).toEqual({ baseRevision: 2, dirty: false, source: 'cloud' });
  expect(Object.keys(workspace.drafts).some((id) => id.includes('lokale-sicherung'))).toBe(false);
  expect(errors).toEqual([]);
});

test('an explicit local edit is preserved as a backup while the shared baseline still opens automatically', async ({ page }) => {
  const { errors, remote, writes } = await openConflictingCloudEditor(page, { dirty: true });
  await page.waitForTimeout(250);
  const workspace = await page.evaluate(() => JSON.parse(localStorage.getItem('franz-lola-level-editor-workspace-v2')));
  expect(workspace.activeId).toBe('zauberberg');
  expect(workspace.drafts['zauberberg-lokale-sicherung'].level.name.standard).toContain('Mein lokaler Zauberberg');
  expect(workspace.drafts['zauberberg-lokale-sicherung'].level.name.standard).toContain('lokale Sicherung');
  expect(workspace.drafts['zauberberg-lokale-sicherung'].level.decorations.some((item) => item.id === 'zauberberg-note-frei')).toBe(false);
  expect(writes).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('all visible controls have accessible names', async ({ page }) => {
  const errors = await openCleanEditor(page);
  const unnamed = await page.locator('button:visible, input:visible, select:visible, textarea:visible').evaluateAll((elements) => elements
    .filter((element) => !((element.getAttribute('aria-label') || element.getAttribute('title') || element.labels?.[0]?.textContent || element.textContent || '').trim()))
    .map((element) => `${element.tagName.toLowerCase()}#${element.id}`));
  expect(unnamed).toEqual([]);
  expect(errors).toEqual([]);
});

test('@mobile studio has no page overflow and keeps project, navigation and direct controls usable', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await expect(page.getByLabel('Arbeitsbereich auswählen')).toBeVisible();
  await expect(page.getByLabel('Arbeitsbereich auswählen').locator('option')).toHaveCount(7);
  await expect(page.locator('.discipline-nav')).toBeHidden();
  const sizes = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: innerWidth }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.width + 1);
  await openProject(page); await expect(page.locator('[data-template-id]')).toHaveCount(9);
  await page.locator('[data-template-id="bschuett"]').click();
  const focusTabs = page.locator('.mobile-focus-tabs:visible');
  await expect(focusTabs).toBeVisible();
  await focusTabs.getByRole('button', { name: /Szene/ }).click();
  await expect(page.locator('[data-focus-panel="scene"].mobile-active')).toBeVisible();
  await expect(page.locator('#level-canvas')).toBeVisible();
  await page.locator('[data-focus-panel="scene"] .sidebar-mode-tabs').getByRole('button', { name: /Szene/ }).click();
  await expect(page.locator('.scene-tree:visible')).toBeVisible();
  await page.screenshot({ path: 'output/playwright/mobile-focus-panels.png' });
  const sceneSheet = await page.locator('[data-focus-panel="scene"].mobile-active').boundingBox();
  if (!sceneSheet) throw new Error('Mobiles Szenen-Sheet besitzt keine Bounding Box.');
  await page.mouse.click(8, Math.max(8, sceneSheet.y - 8));
  await expect(page.locator('.mobile-panel-scrim')).toHaveCount(0);
  await focusTabs.getByRole('button', { name: /Details/ }).click();
  await expect(page.locator('[data-focus-panel="inspector"].mobile-active')).toBeVisible();
  await focusTabs.getByRole('button', { name: /Canvas/ }).click();
  await expect(page.locator('#level-canvas')).toBeVisible();
  await switchWorkspace(page, 'playtest'); await page.locator('#start-playtest').click();
  await expect(page.locator('.playtest-top-overlay')).toBeVisible({ timeout: 15_000 });
  const skipIntro = page.getByRole('button', { name: /Intro überspringen/ });
  if (await skipIntro.isVisible()) await skipIntro.click();
  await expect(page.locator('.mobile-dpad')).toBeVisible();
  await page.locator('.mobile-dpad button').first().tap();
  expect(errors).toEqual([]);
});

test('@mobile one scene selection opens the inferred specialist and its detail sheet', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'zauberberg');
  const focusTabs = page.locator('.mobile-focus-tabs:visible');
  await focusTabs.getByRole('button', { name: /Szene/ }).click();
  await page.locator('.level-sidebar.mobile-active .sidebar-mode-tabs').getByRole('button', { name: /Szene/ }).click();
  await page.locator('.level-sidebar.mobile-active [data-scene-key="decoration:zauberberg-box"] .scene-node-main').click();
  await expect(page.locator('[data-workspace="objects"]')).toHaveAttribute('aria-current', 'page');
  const inspector = page.locator('.object-inspector.mobile-active');
  await expect(inspector).toBeVisible();
  await expect(inspector.locator('.selection-summary')).toContainText('Objekt · Objektwerkstatt');
  await expect(inspector).toContainText('Konzertbox');
  expect(errors).toEqual([]);
});

test('@mobile assets open visibly, can be edited and require an explicit placement action', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'hals');
  await switchWorkspace(page, 'objects');
  const library = page.locator('.object-sidebar.mobile-active');
  await expect(library).toBeVisible();
  await expect(library.locator('.asset-list')).toBeVisible();
  await library.locator('[data-asset-id="music-note"]').click();
  const inspector = page.locator('.object-inspector.mobile-active');
  await expect(inspector).toHaveAttribute('data-object-context', 'asset');
  await expect(inspector).toContainText('GLOBALE ASSET-VORLAGE');
  await inspector.locator('[data-asset-setting="description"]').fill('Sofort mobil bearbeitet');
  await inspector.locator('[data-action="place-asset"]').click();
  await expect(page.locator('.object-inspector.mobile-active')).toHaveCount(0);
  const target = await canvasPoint(page, 3, 3); await page.mouse.click(target.x, target.y);
  await expect(page.locator('.object-inspector.mobile-active')).toHaveAttribute('data-object-context', 'instance');
  await expect(page.locator('.object-inspector.mobile-active')).toContainText('LEVEL-INSTANZ');
  expect(errors).toEqual([]);
});

test('object previews show renderer output and text blocks stay freely editable', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await openObjectLibrary(page);
  await expect(page.locator('.asset-list .object-thumbnail')).toHaveCount(16);
  await expect(page.locator('[data-asset-id="music-note"] canvas')).toBeVisible();
  await expect(page.locator('[data-asset-id="zauberberg-note"] canvas')).toBeVisible();
  await selectAssetForPlacement(page, 'text-block');
  const target = await canvasPoint(page, 8, 8); await page.mouse.click(target.x, target.y);
  await openSceneTree(page);
  await page.locator('.scene-tree .scene-node-main').filter({ hasText: 'Freier Textblock' }).click();
  await page.locator('.object-inspector').getByLabel('Text', { exact: true }).fill('Frei in Passau'); await page.locator('.object-inspector').getByLabel('Text', { exact: true }).blur();
  await page.getByLabel('Hintergrund transparent').check();
  await expect(page.getByLabel('Rahmen ausblenden')).toBeChecked();
  await page.locator('.object-inspector .effect-editor').getByRole('button', { name: '＋ Effekt' }).click();
  await expect(page.locator('.object-inspector [data-effect-type="glitch"]')).toHaveCount(1);
  await page.locator('.secondary-inspector').click();
  await page.locator('.edge-effect-editor').getByRole('button', { name: '＋ Rand-Effekt' }).click();
  await expect(page.locator('.edge-effect-card')).toHaveCount(1);
  await expect(page.locator('#level-canvas')).toHaveAttribute('data-selection-count', '1');
  await expect(page.getByLabel('Hintergrund transparent')).toBeChecked();
  const xInput = page.locator('.object-inspector').getByLabel('X', { exact: true });
  const yInput = page.locator('.object-inspector').getByLabel('Y', { exact: true });
  const widthInput = page.locator('.object-inspector').getByLabel('Breite');
  const fontInput = page.locator('.object-inspector').getByLabel('Schriftgröße');
  await page.locator('[data-tool="transform"]').click();
  const moveFrom = await canvasExactPoint(page, 10, 9); const moveTo = await canvasExactPoint(page, 12.35, 11.15);
  await page.mouse.move(moveFrom.x, moveFrom.y); await page.mouse.down(); await page.mouse.move(moveTo.x, moveTo.y, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => Number(await xInput.inputValue())).toBeGreaterThan(10);
  await expect.poll(async () => Number(await yInput.inputValue())).toBeGreaterThan(10);
  const beforeWidth = Number(await widthInput.inputValue()); const beforeFont = Number(await fontInput.inputValue());
  const x = Number(await xInput.inputValue()); const y = Number(await yInput.inputValue());
  const height = Number(await page.locator('.object-inspector').getByLabel('Höhe').inputValue());
  const scaleFrom = await canvasExactPoint(page, x + beforeWidth, y + height); const scaleTo = await canvasExactPoint(page, x + beforeWidth + 1.5, y + height + 0.75);
  await page.mouse.move(scaleFrom.x, scaleFrom.y); await page.mouse.down(); await page.mouse.move(scaleTo.x, scaleTo.y, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => Number(await widthInput.inputValue())).toBeGreaterThan(beforeWidth);
  await expect.poll(async () => {
    const widthScale = Number(await widthInput.inputValue()) / beforeWidth;
    const fontScale = Number(await fontInput.inputValue()) / beforeFont;
    return Math.abs(widthScale - fontScale);
  }).toBeLessThan(0.01);
  await expect(page.locator('#level-canvas')).toHaveClass(/transform-tool/);
  await expect(page.locator('.transform-hint')).toContainText('Eckgriffe');
  expect(errors).toEqual([]);
});

test('thumbnail surfaces select exact profiles and animated assets sleep while scrolled offscreen', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await openObjectLibrary(page);
  const animated = page.locator('[data-asset-id="music-note"] .object-thumbnail');
  const staticPreview = page.locator('[data-asset-id="tree"] .object-thumbnail');
  await expect(animated).toHaveAttribute('data-render-profile', 'thumbnail-animated');
  await expect(staticPreview).toHaveAttribute('data-render-profile', 'thumbnail-static');
  const staticCount = await waitForStableRenderCount(staticPreview, 2_500);
  expect(staticCount).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await expect(staticPreview).toHaveAttribute('data-render-count', String(staticCount));

  const animatedStart = Number(await animated.getAttribute('data-render-count'));
  await expect.poll(async () => Number(await animated.getAttribute('data-render-count'))).toBeGreaterThan(animatedStart);
  await page.locator('.object-sidebar').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(animated).not.toBeInViewport();
  await page.waitForTimeout(100);
  const offscreenCount = Number(await animated.getAttribute('data-render-count'));
  await page.waitForTimeout(400);
  await expect(animated).toHaveAttribute('data-render-count', String(offscreenCount));
  await page.locator('.object-sidebar').evaluate((element) => { element.scrollTop = 0; });
  await expect(animated).toBeInViewport();
  await expect.poll(async () => Number(await animated.getAttribute('data-render-count'))).toBeGreaterThan(offscreenCount);

  await loadTemplate(page, 'home');
  await switchWorkspace(page, 'characters');
  const actorPreviews = page.locator('.actor-browser .actor-thumbnail');
  await expect(actorPreviews).toHaveCount(4);
  await expect(actorPreviews.first()).toHaveAttribute('data-render-profile', /thumbnail-(?:static|animated)/);
  await expect.poll(async () => actorPreviews.evaluateAll((items) => items.some((item) => item.dataset.renderProfile === 'thumbnail-animated'))).toBe(true);
  expect(errors).toEqual([]);
});
test('sprite and transform animation studios expose keyframes, scrubbing and playback', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await openObjectLibrary(page); await page.locator('[data-asset-id="zauberberg-note"]').click();
  await page.getByRole('button', { name: /Sprite-Keyframes bearbeiten/ }).click();
  await expect(page.locator('.keyframe-ruler')).toBeVisible();
  const spriteSurface = page.locator('.sprite-playback-stage');
  await expect(spriteSurface).toHaveAttribute('data-render-profile', 'thumbnail-animated');
  await expect(spriteSurface.locator('.actor-thumbnail')).toHaveAttribute('data-render-profile', 'thumbnail-static');
  await page.getByRole('button', { name: '▶ Playback' }).click();
  await expect(page.getByRole('button', { name: 'Ⅱ Pause' })).toBeVisible();
  const playbackStart = Number(await spriteSurface.getAttribute('data-render-count'));
  await expect.poll(async () => Number(await spriteSurface.getAttribute('data-render-count'))).toBeGreaterThan(playbackStart);
  const spriteStart = Number(await spriteSurface.getAttribute('data-render-count'));
  await page.waitForTimeout(1000);
  const spriteFrames = Number(await spriteSurface.getAttribute('data-render-count')) - spriteStart;
  expect(spriteFrames).toBeGreaterThan(0);
  expect(spriteFrames).toBeLessThanOrEqual(31);
  expect(Number(await spriteSurface.getAttribute('data-playhead'))).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Ⅱ Pause' }).click();
  await page.waitForTimeout(100);
  const spritePaused = Number(await spriteSurface.getAttribute('data-render-count'));
  await page.waitForTimeout(350);
  await expect(spriteSurface).toHaveAttribute('data-render-count', String(spritePaused));
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await page.getByRole('button', { name: /Bewegung mit Keyframes/ }).click();
  await expect(page.locator('.motion-studio')).toBeVisible();
  const motionSurface = page.locator('.motion-preview');
  await expect(motionSurface).toHaveAttribute('data-render-profile', 'thumbnail-animated');
  await page.getByRole('button', { name: '▶ Playback' }).click();
  const motionStart = Number(await motionSurface.getAttribute('data-render-count'));
  await expect.poll(async () => Number(await motionSurface.getAttribute('data-render-count'))).toBeGreaterThan(motionStart);
  await page.getByRole('button', { name: 'Ⅱ Pause' }).click();
  await page.waitForTimeout(100);
  const motionPaused = Number(await motionSurface.getAttribute('data-render-count'));
  await page.waitForTimeout(350);
  await expect(motionSurface).toHaveAttribute('data-render-count', String(motionPaused));
  const motionPlayhead = Number(await motionSurface.getAttribute('data-playhead'));
  await page.getByRole('button', { name: '＋ Keyframe am Playhead' }).click();
  await expect(page.locator('.motion-editor-grid > aside button.active b')).toHaveText(motionPlayhead.toFixed(2) + ' s');
  expect(errors).toEqual([]);
});
test('paused sprite preview presents nested pixel and palette edits exactly once before sleeping', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await openObjectLibrary(page);
  await page.locator('[data-asset-id="music-note"]').click();
  await page.getByRole('button', { name: /Sprite-Keyframes bearbeiten/ }).click();
  const preview = page.locator('.sprite-playback-preview');
  await expect(preview).toHaveAttribute('data-render-profile', 'thumbnail-static');
  await page.waitForTimeout(1100);
  const pixelStart = Number(await preview.getAttribute('data-render-count'));
  const pixelSignature = await canvasSignature(preview);
  await page.locator('.pixel-grid button[data-x="0"][data-y="0"]').click();
  await expect.poll(async () => Number(await preview.getAttribute('data-render-count')), { timeout: 2500 }).toBe(pixelStart + 1);
  await expect.poll(() => canvasSignature(preview)).not.toBe(pixelSignature);
  await page.waitForTimeout(1200);
  await expect(preview).toHaveAttribute('data-render-count', String(pixelStart + 1));

  const paletteStart = Number(await preview.getAttribute('data-render-count'));
  const paletteColors = await canvasOpaqueColors(preview);
  await page.getByLabel('Ausgewählte Farbe').evaluate((input) => {
    input.value = '#ff4f87';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(async () => Number(await preview.getAttribute('data-render-count')), { timeout: 2500 }).toBe(paletteStart + 1);
  await expect.poll(() => canvasOpaqueColors(preview)).not.toEqual(paletteColors);
  await page.waitForTimeout(1200);
  await expect(preview).toHaveAttribute('data-render-count', String(paletteStart + 1));

  const keyframeCount = await page.locator('.sheet-grid > button').count();
  await page.getByRole('button', { name: '＋ Keyframe duplizieren' }).click();
  await expect(page.locator('.sheet-grid > button')).toHaveCount(keyframeCount + 1);
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toBeInViewport();
  await page.waitForTimeout(1200);
  const frameStart = Number(await preview.getAttribute('data-render-count'));
  const frameSignature = await canvasSignature(preview);
  await page.getByRole('button', { name: 'Leeren', exact: true }).dispatchEvent('click');
  await expect.poll(async () => Number(await preview.getAttribute('data-render-count')), { timeout: 2500 }).toBe(frameStart + 1);
  await expect.poll(() => canvasSignature(preview)).not.toBe(frameSignature);
  await page.waitForTimeout(1200);
  await expect(preview).toHaveAttribute('data-render-count', String(frameStart + 1));
  expect(errors).toEqual([]);
});

test('reduced-motion effect edits update visible thumbnail output once before sleeping', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await openCleanEditor(page);
  await openObjectLibrary(page);
  const objectCard = page.locator('[data-asset-id="tree"]');
  await objectCard.click();
  const preview = page.locator('.asset-inspector-preview .object-thumbnail');
  await expect(preview).toHaveAttribute('data-render-profile', 'thumbnail-static');
  await page.waitForTimeout(1100);
  const surfaceId = await preview.getAttribute('data-surface-id');
  const effectStart = Number(await preview.getAttribute('data-render-count'));
  const effectSignature = await canvasSignature(preview);
  await page.locator('.object-inspector .effect-editor').getByRole('button', { name: '＋ Effekt' }).click();
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toBeInViewport();
  await expect(preview).toHaveAttribute('data-surface-id', surfaceId);
  await expect.poll(async () => Number(await preview.getAttribute('data-render-count')), { timeout: 2500 }).toBe(effectStart + 1);
  await expect.poll(() => canvasSignature(preview)).not.toBe(effectSignature);
  await page.waitForTimeout(1200);
  await expect(preview).toHaveAttribute('data-render-count', String(effectStart + 1));
  expect(errors).toEqual([]);
});

test('actor and object finite thumbnails keep local time while combined effects continue cadence', async ({ page }) => {
  const errors = await openCleanEditor(page);
  await loadTemplate(page, 'home');
  await switchWorkspace(page, 'characters');
  await page.locator('.actor-browser button').filter({ hasText: 'Franz & Lola' }).click();
  await page.getByRole('button', { name: /Sprite-Sheet bearbeiten/ }).click();
  await page.getByLabel('Dauer').fill('1');
  await page.getByLabel('Dauer').press('Tab');
  await page.getByRole('checkbox', { name: 'Loop' }).uncheck();
  await page.getByRole('button', { name: 'Sprite übernehmen' }).click();
  await page.locator('.property-panel .effect-editor').getByRole('button', { name: '＋ Effekt' }).click();
  const actor = page.locator('.character-hero .actor-thumbnail');
  await expect(actor).toHaveAttribute('data-render-profile', 'thumbnail-animated');
  await expect(actor).toHaveAttribute('data-animation-elapsed', /\d/);
  expect(Number(await actor.getAttribute('data-animation-elapsed'))).toBeLessThan(1);
  await expect.poll(async () => Number(await actor.getAttribute('data-animation-elapsed')), { timeout: 3500 }).toBeGreaterThanOrEqual(1);
  const actorAmbient = Number(await actor.getAttribute('data-render-count'));
  await page.waitForTimeout(650);
  await expect.poll(async () => Number(await actor.getAttribute('data-render-count'))).toBeGreaterThan(actorAmbient + 5);
  await expect(actor).toHaveAttribute('data-render-profile', 'thumbnail-animated');

  await switchWorkspace(page, 'objects');
  await page.locator('#create-object').click();
  const creator = page.getByRole('dialog', { name: 'Was soll im Level erscheinen?' });
  await creator.getByLabel('Name').fill('Non Loop Probe');
  await creator.getByRole('radio', { name: /Leere Leinwand/ }).check();
  await creator.getByRole('button', { name: /Im Sprite-Studio gestalten/ }).click();
  await page.getByRole('button', { name: '＋ Keyframe duplizieren' }).click();
  await page.getByLabel('Dauer').fill('1');
  await page.getByLabel('Dauer').press('Tab');
  await page.getByRole('checkbox', { name: 'Loop' }).uncheck();
  await page.getByRole('button', { name: 'Sprite übernehmen' }).click();
  await page.locator('.object-sidebar .sidebar-mode-tabs').getByRole('button', { name: /Assets/ }).click();
  const objectCard = page.locator('.asset-list [data-asset-id]').filter({ hasText: 'Non Loop Probe' });
  await objectCard.click();
  await page.getByRole('button', { name: /Bewegung mit Keyframes/ }).click();
  await page.getByLabel('Dauer').fill('1');
  await page.getByRole('checkbox', { name: 'Loop' }).uncheck();
  await page.getByRole('button', { name: 'Animation übernehmen' }).click();
  await page.locator('.object-inspector .effect-editor').getByRole('button', { name: '＋ Effekt' }).click();
  await objectCard.scrollIntoViewIfNeeded();
  await expect(objectCard).toBeInViewport();
  const storedObject = await page.evaluate(() => JSON.parse(localStorage.getItem('franz-lola-object-library-v1'))
    .find((entry) => entry.name === 'Non Loop Probe'));
  expect(storedObject.animation).toMatchObject({ type: 'keyframes', duration: 1, loop: false });
  expect(storedObject.animation.keyframes.length).toBeGreaterThan(1);
  expect(storedObject.effects).toHaveLength(1);
  expect(storedObject.appearance.animations[0]).toMatchObject({ duration: 1, loop: false });
  expect(storedObject.appearance.animations[0].keyframes).toHaveLength(2);
  const object = objectCard.locator('.object-thumbnail');
  await expect(object).toHaveAttribute('data-render-profile', 'thumbnail-animated');
  await expect(object).toHaveAttribute('data-animation-elapsed', /\d/);
  expect(Number(await object.getAttribute('data-animation-elapsed'))).toBeLessThan(1);
  await expect.poll(async () => Number(await object.getAttribute('data-animation-elapsed')), { timeout: 3500 }).toBeGreaterThanOrEqual(1);
  const objectAmbient = Number(await object.getAttribute('data-render-count'));
  await page.waitForTimeout(650);
  await expect.poll(async () => Number(await object.getAttribute('data-render-count'))).toBeGreaterThan(objectAmbient + 5);
  await expect(object).toHaveAttribute('data-render-profile', 'thumbnail-animated');

  await objectCard.click();
  await page.getByRole('button', { name: /Sprite-Keyframes bearbeiten/ }).click();
  await page.getByRole('checkbox', { name: 'Loop' }).check();
  await page.getByRole('button', { name: 'Sprite übernehmen' }).click();
  await objectCard.scrollIntoViewIfNeeded();
  await expect(objectCard).toBeInViewport();
  const storedLoop = await page.evaluate(() => JSON.parse(localStorage.getItem('franz-lola-object-library-v1'))
    .find((entry) => entry.name === 'Non Loop Probe').appearance.animations[0].loop);
  expect(storedLoop).toBe(true);
  const loopStart = Number(await object.getAttribute('data-render-count'));
  await page.waitForTimeout(650);
  await expect.poll(async () => Number(await object.getAttribute('data-render-count'))).toBeGreaterThan(loopStart + 5);
  await expect(object).toHaveAttribute('data-render-profile', 'thumbnail-animated');
  expect(errors).toEqual([]);
});
test('browser session retries reentrant exceptional profile switches on the final surface', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ coordinatorUrl }) => {
    const [{ createRenderCoordinator }, { createStudioRenderSession }] = await Promise.all([
      import(coordinatorUrl),
      import('/src/render/studio-render-session.svelte.js'),
    ]);
    let pending = null;
    let nextHandle = 1;
    const clock = {
      adapter: {
        requestFrame(callback) {
          if (pending) throw new Error('duplicate browser frame');
          pending = { callback, handle: nextHandle++ };
          return pending.handle;
        },
        cancelFrame(handle) { if (pending?.handle === handle) pending = null; },
        now: () => 0,
      },
      present(timestamp) { const frame = pending; pending = null; frame?.callback(timestamp); },
      pendingCount: () => pending ? 1 : 0,
    };
    const coordinator = createRenderCoordinator(clock.adapter);
    const frames = [];
    let failOnce = true;
    let session;
    session = createStudioRenderSession({
      coordinator,
      id: 'browser-reentrant-session',
      profile: 'editor',
      visible: false,
      render(frame) {
        frames.push({ profile: frame.profile, reason: frame.reason, resume: frame.visibilityResume });
        if (failOnce) {
          failOnce = false;
          session.setProfile('editor');
          session.setProfile('thumbnail-static');
          session.setProfile('editor');
          throw new Error('browser retry once');
        }
      },
    });
    session.invalidate('project:hidden-edit');
    session.setReducedMotion(true);
    session.setProfile('playtest');
    session.setVisible(true);
    let thrown = '';
    try { clock.present(1000); } catch (error) { thrown = error.message; }
    const failedSurface = coordinator.snapshot().surfaces['browser-reentrant-session'];
    clock.present(1017);
    clock.present(1034);
    clock.present(1051);
    const finalSurface = coordinator.snapshot().surfaces['browser-reentrant-session'];
    session.destroy();
    return { thrown, frames, failedSurface, finalSurface, pending: clock.pendingCount() };
  }, { coordinatorUrl: renderCoordinatorBrowserUrl });
  expect(result.thrown).toBe('browser retry once');
  expect(result.frames).toEqual([
    { profile: 'playtest', reason: 'project:hidden-edit', resume: true },
    { profile: 'editor', reason: 'project:hidden-edit', resume: true },
    { profile: 'editor', reason: 'motion:reduced', resume: false },
  ]);
  expect(result.failedSurface).toMatchObject({ profile: 'editor', visible: true, active: true, dirty: true });
  expect(result.finalSurface).toMatchObject({ profile: 'editor', visible: true, active: false, dirty: false });
  expect(result.pending).toBe(0);
});
