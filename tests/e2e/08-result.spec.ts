import { expect, test } from '@playwright/test';
import { NO_SPAWNS, openApp, playTimedMatch, setOptions } from './support';

test.describe('result', () => {
  test('shows the outcome and survives a refresh', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await setOptions(page, { duration: 60 });
    await playTimedMatch(page, { scoreOne: true });

    await expect(page).toHaveURL(/#\/result$/);
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeFocused();
    await expect(page.getByTestId('result-score')).toHaveText('1');
    await expect(page.getByTestId('result-duration')).toHaveText('01:00');
    await expect(page.getByTestId('result-reason')).toHaveText('Time up');
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'confirmed');

    await page.reload();
    await expect(page.getByTestId('result-score')).toHaveText('1');
    await expect(page.getByTestId('result-duration')).toHaveText('01:00');
    await expect(page.getByTestId('result-reason')).toHaveText('Time up');
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'confirmed');

    // Browser back does not re-enter the finished match.
    await page.getByTestId('result-menu').click();
    await expect(page.getByTestId('menu-play')).toBeVisible();
  });

  test('reloading during a match abandons it and returns to the menu', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page).toHaveURL(/#\/$/);
  });
});
