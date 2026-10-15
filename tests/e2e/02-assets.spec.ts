import { expect, test } from '@playwright/test';
import { openApp, startMatch, waitForSession } from './support';

// The mock API service worker would hide asset requests from page.route, and
// these tests do not need the mocked backend.
test.use({ serviceWorkers: 'block' });

const ATLAS = /ships_miscellaneous_sheet[^/]*\.xml/;

test.describe('asset loading', () => {
  test('shows progress while the battle assets download', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(ATLAS, async (route) => {
      await gate;
      await route.continue();
    });
    await openApp(page);
    await page.getByTestId('menu-play').click();

    const loading = page.getByTestId('loading');
    await expect(loading).toBeVisible();
    const bar = loading.getByRole('progressbar', { name: 'Loading assets' });
    await expect(bar).toBeVisible();
    await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(100);

    release();
    await waitForSession(page);
    await expect(loading).toBeHidden();
  });

  test('reports a failure and recovers on retry', async ({ page }) => {
    let failures = 0;
    await page.route(ATLAS, async (route) => {
      if (failures < 1) {
        failures += 1;
        await route.abort('connectionfailed');
        return;
      }
      await route.continue();
    });
    await openApp(page);
    await page.getByTestId('menu-play').click();

    const error = page.getByTestId('load-error');
    await expect(error).toBeVisible();
    await expect(error.getByRole('alert')).toContainText('Could not load ships_miscellaneous_sheet');
    await expect(page.getByTestId('hud')).toHaveCount(0);

    await page.getByTestId('load-retry').click();
    await waitForSession(page);
    await expect(error).toBeHidden();
    expect(failures).toBe(1);
  });

  test('a corrupted atlas is reported instead of starting a broken match', async ({ page }) => {
    await page.route(ATLAS, (route) => route.fulfill({ status: 200, contentType: 'application/xml', body: '<oops' }));
    await openApp(page);
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('load-error').getByRole('alert')).toContainText('invalid atlas');

    await page.unroute(ATLAS);
    await page.getByTestId('load-retry').click();
    await waitForSession(page);
  });

  test('assets are reused by later matches', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (ATLAS.test(request.url())) requests.push(request.url());
    });
    await openApp(page);
    await startMatch(page);
    await page.getByTestId('hud-pause').click();
    await page.getByTestId('pause-exit').click();
    await startMatch(page);
    expect(requests).toHaveLength(1);
  });
});
