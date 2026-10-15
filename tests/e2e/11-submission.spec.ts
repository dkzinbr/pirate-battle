import { expect, type Page, test } from '@playwright/test';
import { NO_SPAWNS, openApp, playTimedMatch, serverMatches, setOptions } from './support';

async function mineOnServer(page: Page) {
  const playerId = await page.evaluate(() => (JSON.parse(localStorage.getItem('pirate-battle.profile.v1') ?? '{}') as { playerId?: string }).playerId);
  return (await serverMatches(page)).filter((m) => m.playerId === playerId);
}

test.describe('match submission', () => {
  test('a finished match is recorded and both tabs refresh', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await setOptions(page, { duration: 60, name: 'Test Captain' });

    // Warm both caches first so the test proves they are refreshed, not just loaded.
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('ranking-row')).toHaveCount(4);
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();
    await page.getByTestId('log-menu').click();

    await playTimedMatch(page, { scoreOne: true });
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'confirmed');
    const mine = await mineOnServer(page);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.score).toBe(1);

    await page.getByTestId('result-menu').click();
    await page.getByTestId('menu-ranking').click();
    const rows = page.getByTestId('ranking-row');
    await expect(rows).toHaveCount(5);
    const myRow = rows.filter({ hasText: 'Test Captain' });
    await expect(myRow).toHaveCount(1);
    await expect(myRow).toContainText('You');
    await expect(myRow).toContainText('05');

    await page.getByTestId('tab-history').click();
    const history = page.getByTestId('history-row');
    await expect(history).toHaveCount(1);
    await expect(history.first()).toHaveAttribute('data-match-id', mine[0]?.matchId ?? '');
    await expect(history.first()).toContainText('Time up');
  });

  test('a record that could not be sent is kept and sent after a refresh', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS, scenario: 'submit-unavailable' });
    await setOptions(page, { duration: 60 });
    await playTimedMatch(page);

    const status = page.getByTestId('record-status');
    await expect(status).toHaveAttribute('data-status', 'failed', { timeout: 20_000 });
    await expect(status).toHaveAttribute('role', 'alert');
    await expect(page.getByText('Saving is temporarily unavailable.')).toBeVisible();
    expect(await mineOnServer(page)).toHaveLength(0);

    await page.getByTestId('result-menu').click();
    await expect(page.getByTestId('menu-pending')).toBeVisible();
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('pending-banner')).toBeVisible();
    await expect(page.getByTestId('log-empty')).toBeVisible();

    // The service recovers; the outbox survives the reload and is flushed.
    await page.goto('/?e2e=1&scenario=instant#/log/history');
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('pending-banner')).toBeHidden();
    expect(await mineOnServer(page)).toHaveLength(1);
  });

  test('a refresh while the record is in flight resends it once', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS, scenario: 'timeout' });
    await setOptions(page, { duration: 60 });
    await playTimedMatch(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'sending');

    await page.goto('/?e2e=1&scenario=instant#/result');
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'confirmed');
    expect(await mineOnServer(page)).toHaveLength(1);
  });

  test('the pending banner can retry manually', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS, scenario: 'submit-unavailable' });
    await setOptions(page, { duration: 60 });
    await playTimedMatch(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'failed', { timeout: 20_000 });
    await page.getByTestId('result-menu').click();
    await page.getByTestId('menu-history').click();

    await page.evaluate(() => {
      window.__pirate.setScenario('instant');
    });
    await page.getByTestId('pending-retry').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('pending-banner')).toBeHidden();
  });
});
