import { expect, type Page, test } from '@playwright/test';
import { advance, hold, NO_SPAWNS, openApp, startMatch, state } from './support';

async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('pause', () => {
  test('manual pause stops the clock and the ship until resumed', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
    await advance(page, 5000);
    await page.keyboard.down('KeyW');
    await advance(page, 500);

    await page.keyboard.press('KeyP');
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('pause-resume')).toBeFocused();
    await expect(page.getByTestId('pause-reason')).toHaveText('Ready when you are.');
    await expect(page.getByTestId('status-state')).toHaveText('Paused');

    const paused = await state(page);
    expect(paused.phase).toBe('paused');
    expect(await advance(page, 10_000)).toBe(0);
    const still = await state(page);
    expect(still.elapsed).toBe(paused.elapsed);
    expect(still.player).toMatchObject({ x: paused.player.x, y: paused.player.y });
    await page.keyboard.up('KeyW');

    // Keys held during the pause do not leak into the resumed match.
    await page.getByTestId('pause-resume').click();
    await expect(dialog).toBeHidden();
    await advance(page, 1000);
    const resumed = await state(page);
    expect(resumed.elapsed).toBeCloseTo(paused.elapsed + 1, 5);
    expect(resumed.player.speed).toBeLessThan(paused.player.speed);
  });

  test('the HUD button and Escape toggle the pause dialog', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
    await page.getByTestId('hud-pause').click();
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
    expect((await state(page)).phase).toBe('running');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  });

  test('losing window focus pauses automatically', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByTestId('pause-reason')).toHaveText('The game window lost focus.');
    await expect(page.getByTestId('match-announcement')).toHaveText('Game paused because the window lost focus.');
    expect(await advance(page, 3000)).toBe(0);
    // Regaining focus does not resume by itself.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    expect((await state(page)).phase).toBe('paused');
  });

  test('hiding the tab pauses and real time does not advance the timer', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS, manualClock: false });
    await startMatch(page);
    await page.waitForFunction(() => (window.__pirate.getState()?.elapsed ?? 0) > 0.5);

    await setTabHidden(page, true);
    await expect(page.getByTestId('pause-reason')).toHaveText('The tab was hidden.');
    const atPause = (await state(page)).elapsed;
    const clockAtPause = await page.getByTestId('hud-time').textContent();
    await page.waitForTimeout(2000);
    await setTabHidden(page, false);
    expect((await state(page)).elapsed).toBe(atPause);
    await expect(page.getByTestId('hud-time')).toHaveText(clockAtPause ?? '');

    // Resuming does not simulate the 2 s spent paused.
    const atResume = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="pause-resume"]')?.click();
      return window.__pirate.getState()?.elapsed ?? -1;
    });
    expect(atResume).toBe(atPause);
    await page.waitForTimeout(400);
    const later = (await state(page)).elapsed;
    expect(later).toBeGreaterThan(atPause);
    expect(later - atPause).toBeLessThan(1.2);
  });

  test('game keys are only captured during gameplay', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
    await page.keyboard.press('KeyP');
    await page.getByTestId('pause-options').click();
    const name = page.getByTestId('option-captain-name');
    await name.fill('');
    await name.pressSequentially('Wasd Qe');
    await expect(name).toHaveValue('Wasd Qe');
    expect((await state(page)).player).toMatchObject({ x: 768, y: 448 });
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByTestId('pause-resume').click();
    await hold(page, 'KeyW', 300);
    expect((await state(page)).player.y).toBeLessThan(448);
  });
});
