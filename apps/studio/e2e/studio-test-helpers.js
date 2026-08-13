import { expect } from '@playwright/test';

export async function openCleanEditor(page, url = '/') {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(150);
  if (!await page.locator('#level-canvas').count()) throw new Error(`Editor konnte nicht starten: ${errors.join(' | ') || 'keine Page-Error-Meldung'}`);
  await expect(page.locator('#level-canvas')).toBeVisible();
  return errors;
}

export async function loadStaticCanvasFixture(page) {
  await page.evaluate(() => {
    const key = 'franz-lola-level-editor-workspace-v2';
    const workspace = JSON.parse(localStorage.getItem(key));
    const level = workspace.drafts[workspace.activeId].level;
    level.collectibles.powerUps = [];
    level.theme = { ...level.theme, landmark: 'dog-park', edgeEffects: [], elements: [] };
    level.board.walls = [];
    level.actors = {
      ...level.actors,
      cats: [],
      characters: [],
      player: {
        ...level.actors.player,
        animation: '',
        effects: [],
        appearance: {
          width: 4,
          height: 4,
          palette: ['transparent', '#f4eee0'],
          pixels: ['0110', '1111', '1001', '0110'],
          animations: [{ id: 'idle', fps: 4, loop: true, frames: [{ pixels: ['0110', '1111', '1001', '0110'] }] }],
          stateAnimations: { idle: 'idle' },
        },
      },
    };
    level.decorations = [{ type: 'rock', x: 5, y: 5, width: 1, height: 1 }];
    level.events = [];
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload();
  await expect(page.locator('#level-canvas')).toBeVisible();
}

export async function persistActiveDraft(page) {
  const wallTool = page.locator('[data-tool="wall"]');
  if (!await wallTool.isVisible()) await page.getByRole('navigation', { name: 'Mobile Arbeitsansicht' }).getByRole('button', { name: /Szene/ }).click();
  await wallTool.click();
  const canvas = page.locator('#level-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Level canvas has no actionable bounding box.');
  await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * 0.06);
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('franz-lola-level-editor-workspace-v2'));
    return Boolean(workspace?.drafts?.[workspace.activeId]?.level);
  });
}
