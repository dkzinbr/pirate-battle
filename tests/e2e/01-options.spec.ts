import { expect, test } from '@playwright/test';
import { openApp, startMatch, state } from './support';

test.describe('options', () => {
  test('menu navigation works with the keyboard and focus is visible', async ({ page }) => {
    await openApp(page);
    const play = page.getByTestId('menu-play');
    await play.focus();
    await page.keyboard.press('Tab');
    const options = page.getByTestId('menu-options');
    await expect(options).toBeFocused();
    const outline = await options.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Options' })).toBeFocused();
    await expect(page).toHaveURL(/#\/options$/);
    await page.goBack();
    await expect(page.getByTestId('menu-play')).toBeVisible();
  });

  test('rejects invalid values with accessible messages', async ({ page }) => {
    await openApp(page, { hash: '#/options' });
    const session = page.getByTestId('option-session-time');
    const spawn = page.getByTestId('option-spawn-time');
    const name = page.getByTestId('option-captain-name');

    await session.fill('45');
    await spawn.fill('0');
    await name.fill('X');
    await page.getByTestId('options-save').click();

    await expect(page.getByText('Choose between 60 and 180 seconds.')).toBeVisible();
    await expect(page.getByText('The spawn interval must be positive.')).toBeVisible();
    await expect(page.getByText('Use 2 to 18 characters.')).toBeVisible();
    await expect(session).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('options-status')).toHaveText('Fix the highlighted fields before saving.');

    await session.fill('65');
    await page.getByTestId('options-save').click();
    await expect(page.getByText('Use steps of 10 seconds.')).toBeVisible();
    await spawn.fill('');
    await expect(page.getByText('Enter a number of seconds.')).toBeVisible();

    // Nothing invalid was persisted.
    await page.reload();
    await expect(session).toHaveValue('120');
    await expect(spawn).toHaveValue('3');
  });

  test('persists valid options and applies them to the next match', async ({ page }) => {
    await openApp(page, { hash: '#/options' });
    await page.getByTestId('option-session-time').fill('90');
    await page.getByTestId('option-spawn-time').fill('2.5');
    await page.getByTestId('option-captain-name').fill('Anne Bonny');
    await page.getByTestId('options-save').click();
    await expect(page.getByTestId('options-status')).toHaveText('Options saved.');

    await page.reload();
    await expect(page.getByTestId('option-session-time')).toHaveValue('90');
    await expect(page.getByTestId('option-spawn-time')).toHaveValue('2.5');
    await expect(page.getByTestId('option-captain-name')).toHaveValue('Anne Bonny');

    // Steppers respect limits.
    await page.getByRole('button', { name: /increase game session time/i }).click();
    await expect(page.getByTestId('option-session-time')).toHaveValue('100');

    await page.goto(page.url().replace(/#.*$/, '#/'));
    await startMatch(page);
    const s = await state(page);
    expect(s.config).toEqual({ durationSec: 90, spawnIntervalSec: 2.5 });
    await expect(page.getByTestId('hud-time')).toHaveText('01:30');
  });

  test('falls back to defaults when stored options are corrupted', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('pirate-battle.options.v1', '{"sessionDurationSec":9999,"spawnIntervalSec":"x"');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await openApp(page, { hash: '#/options' });
    await expect(page.getByTestId('option-session-time')).toHaveValue('120');
    await expect(page.getByTestId('option-spawn-time')).toHaveValue('3');
  });
});
