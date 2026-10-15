import { expect, test } from '@playwright/test';
import { NO_SPAWNS, openApp, playTimedMatch, serverMatches, setOptions } from './support';

test.describe('network resilience', () => {
  test('a submission that times out after being stored is retried without duplicates', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pirate-battle.api-timeout-ms', '1000');
    });
    await openApp(page, { overrides: NO_SPAWNS, scenario: 'submit-timeout-after-commit' });
    await setOptions(page, { duration: 60 });

    const posts: number[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/matches')) posts.push(Date.now());
    });
    await playTimedMatch(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'confirmed', { timeout: 15_000 });
    expect(posts.length).toBeGreaterThanOrEqual(2);

    const outbox = await page.evaluate(() => Object.values(window.__pirate.outbox()));
    expect(outbox).toHaveLength(1);
    const matchId = outbox[0]?.record.matchId;
    const stored = (await serverMatches(page)).filter((m) => m.matchId === matchId);
    expect(stored).toHaveLength(1);

    await page.getByTestId('result-menu').click();
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
  });

  test('a late response for an older query never replaces the current view', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking', scenario: 'instant' });
    await expect(page.getByTestId('ranking-row')).toHaveCount(5);

    // Odd requests take 2.5 s, even ones 150 ms.
    await page.evaluate(() => {
      window.__pirate.setScenario('out-of-order');
    });
    const rows = page.getByTestId('ranking-row');
    await page.getByTestId('bracket-spawn').selectOption('5'); // request 1: slow
    await page.getByTestId('bracket-duration').selectOption('60'); // 60 s / 5 s -> request 2: fast
    await page.getByTestId('bracket-spawn').selectOption('3'); // 60 s / 3 s -> request 3: slow
    await page.getByTestId('bracket-duration').selectOption('180'); // 180 s / 3 s -> request 4: fast, empty
    await expect(page.getByTestId('log-empty')).toBeVisible();
    await page.getByTestId('bracket-spawn').selectOption('2'); // 180 s / 2 s -> request 5: slow
    await page.getByTestId('bracket-duration').selectOption('60'); // back to 60 s / 2 s -> request 6: fast, empty
    await page.getByTestId('bracket-duration').selectOption('180'); // 180 s / 2 s already loading

    await expect(rows).toHaveCount(3, { timeout: 8000 });
    await expect(rows.first()).toContainText('61');
    // Every slow response has arrived by now; none of them took over the screen.
    await page.waitForTimeout(3000);
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('61');
    await expect(page.getByTestId('bracket-duration')).toHaveValue('180');
    await expect(page.getByTestId('bracket-spawn')).toHaveValue('2');
  });

  test('a slow, older history snapshot does not hide a newly confirmed match', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS, scenario: 'submit-unavailable' });
    await setOptions(page, { duration: 60 });
    await playTimedMatch(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'failed', { timeout: 20_000 });

    // After the reload the record submission and the history query race each other.
    await page.goto('/?e2e=1&scenario=out-of-order#/log/history');
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(1, { timeout: 10_000 });
    await page.waitForTimeout(3000);
    await expect(rows).toHaveCount(1);
    await expect(page.getByTestId('pending-banner')).toBeHidden();
    const outbox = await page.evaluate(() => Object.values(window.__pirate.outbox()));
    const matchId = outbox[0]?.record.matchId;
    expect((await serverMatches(page)).filter((m) => m.matchId === matchId)).toHaveLength(1);
  });

  test('no retries for client errors', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/ranking')) requests.push(request.url());
    });
    await openApp(page, { hash: '#/log/ranking', scenario: 'client-error' });
    await expect(page.getByTestId('log-error')).toContainText('The request was rejected.');
    await page.waitForTimeout(1500);
    expect(requests).toHaveLength(1);
  });
});
