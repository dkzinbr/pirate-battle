import { expect, test } from '@playwright/test';
import { advance, hold, NO_SPAWNS, openApp, playTimedMatch, setOptions, spawnEnemy, startMatch, tap } from './support';

test.describe('visual regression', () => {
  test('main menu', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('menu.png');
  });

  test('arena in a stable state', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS, seed: 7 });
    await startMatch(page);
    await spawnEnemy(page, 'chaser', 1250, 160, Math.PI);
    await spawnEnemy(page, 'shooter', 540, 790, -Math.PI / 4);
    await hold(page, 'KeyW', 700);
    await hold(page, 'KeyD', 300);
    await tap(page, 'Space');
    await advance(page, 120);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await setOptions(page, { duration: 60 });
    await playTimedMatch(page, { scoreOne: true });
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'confirmed');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('result.png');
  });
});
