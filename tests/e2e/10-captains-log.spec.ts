import { expect, type Page, test } from '@playwright/test';
import { openApp } from './support';

async function seedPlayerHistory(page: Page): Promise<void> {
  await page.getByTestId('open-network-lab').click();
  await page.getByTestId('lab-seed-history').click();
  await page.getByTestId('lab-close').click();
}

test.describe("captain's log", () => {
  test('ranking is filtered by settings and paginated', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking' });
    const rows = page.getByTestId('ranking-row');
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 3');
    await expect(rows.first()).toContainText('38');
    await expect(rows.first()).toContainText('01');
    await expect(page.getByTestId('page-prev')).toBeDisabled();

    await page.getByTestId('page-next').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 2 of 3');
    await expect(rows.first()).toContainText('06');
    await page.getByTestId('page-next').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 3 of 3');
    await expect(rows).toHaveCount(3);
    await expect(page.getByTestId('page-next')).toBeDisabled();
    await page.getByTestId('page-prev').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 2 of 3');

    // Changing the bracket shows only matches played with those settings and resets to page 1.
    await page.getByTestId('bracket-duration').selectOption('60');
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 1');
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText('17');

    await page.getByTestId('bracket-duration').selectOption('150');
    await expect(page.getByTestId('log-empty')).toBeVisible();
  });

  test('ranking tabs are keyboard accessible', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking' });
    const ranking = page.getByTestId('tab-ranking');
    await ranking.focus();
    await expect(ranking).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('tab-history')).toBeFocused();
    await expect(page.getByTestId('tab-history')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-history');
    await expect(page).toHaveURL(/#\/log\/history$/);
  });

  test('match history lists the player battles newest first, paginated', async ({ page }) => {
    await openApp(page);
    await seedPlayerHistory(page);
    await page.getByTestId('menu-history').click();
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 3');
    await expect(rows.first()).toContainText('24');
    await page.getByTestId('page-next').click();
    await page.getByTestId('page-next').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 3 of 3');
    await expect(rows).toHaveCount(2);
    await expect(rows.last()).toContainText('19');
  });

  test('shows loading states on a slow network', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking', scenario: 'slow' });
    await expect(page.getByTestId('log-loading')).toBeVisible();
    await expect(page.getByTestId('ranking-row')).toHaveCount(5, { timeout: 8000 });

    // Paging keeps the previous page visible while the next one loads.
    await page.getByTestId('page-next').click();
    await expect(page.getByTestId('log-refreshing')).toBeVisible();
    await expect(page.getByTestId('ranking-row')).toHaveCount(5);
    await expect(page.getByTestId('page-label')).toHaveText('Page 2 of 3', { timeout: 8000 });
  });

  test('shows empty states', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking', scenario: 'empty' });
    await expect(page.getByTestId('log-empty')).toBeVisible();
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();
    await expect(page.getByTestId('history-row')).toHaveCount(0);
  });

  test('shows errors and recovers on retry', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking', scenario: 'ranking-error' });
    const error = page.getByTestId('log-error');
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toContainText('temporarily unavailable');

    await page.evaluate(() => {
      window.__pirate.setScenario('instant');
    });
    await page.getByTestId('log-retry').click();
    await expect(page.getByTestId('ranking-row')).toHaveCount(5);
    await expect(error).toBeHidden();
  });

  test('a failing tab without data shows an error; with data it keeps the saved list', async ({ page }) => {
    await openApp(page, { hash: '#/log/history', scenario: 'history-error' });
    await expect(page.getByTestId('log-error')).toContainText('Match history could not be read.', { timeout: 15_000 });
    // Ranking is unaffected by a history outage.
    await page.getByTestId('tab-ranking').click();
    await expect(page.getByTestId('ranking-row')).toHaveCount(5);

    await page.evaluate(() => {
      window.__pirate.setScenario('ranking-error');
    });
    // Returning to the tab refetches it.
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();
    // Refetching the ranking now fails, but the rows already shown stay visible.
    await page.getByTestId('tab-ranking').click();
    await expect(page.getByTestId('log-refreshing')).toContainText('Showing saved data', { timeout: 15_000 });
    await expect(page.getByTestId('ranking-row')).toHaveCount(5);
  });
});
