import { expect, test } from '@playwright/test';
import { advance, hold, NO_SPAWNS, openApp, serverMatches, startMatch, state } from './support';

test.describe('navigation', () => {
  test('abandoning a match records nothing', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    const before = (await serverMatches(page)).length;
    await startMatch(page);
    await advance(page, 3000);
    await page.getByTestId('hud-pause').click();
    await page.getByTestId('pause-exit').click();
    await expect(page.getByTestId('menu-play')).toBeVisible();
    expect(await page.evaluate(() => window.__pirate.hasSession())).toBe(false);
    expect(await page.evaluate(() => Object.keys(window.__pirate.outbox()))).toHaveLength(0);
    expect(await serverMatches(page)).toHaveLength(before);

    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();
  });

  test('repeated navigation between screens keeps a single clean game instance', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openApp(page, { overrides: NO_SPAWNS });

    let baseline: number | null = null;
    let textureBaseline: number | null = null;
    for (let i = 0; i < 5; i++) {
      await startMatch(page);
      await expect(page.locator('canvas')).toHaveCount(1);
      const stats = await page.evaluate(() => window.__pirate.renderStats());
      baseline ??= stats?.displayObjects ?? null;
      expect(stats?.displayObjects).toBe(baseline);
      await hold(page, 'KeyW', 300);
      await page.keyboard.press('Escape');
      await page.getByTestId('pause-exit').click();
      await expect(page.locator('canvas')).toHaveCount(0);

      // Leaving a match frees its scene; the shared atlases are uploaded once.
      const gpu = await page.evaluate(() => window.__pirate.gpuStats());
      expect(gpu.stageChildren).toBe(0);
      textureBaseline ??= gpu.textureSources;
      expect(gpu.textureSources).toBe(textureBaseline);

      await page.getByTestId('menu-options').click();
      await page.getByRole('button', { name: 'Main Menu' }).click();
      await page.getByTestId('menu-ranking').click();
      await expect(page.getByTestId('ranking-row').first()).toBeVisible();
      await page.getByTestId('tab-history').click();
      await page.getByTestId('log-menu').click();
    }
    // Back/forward through the history stack never resurrects old matches.
    await page.goBack();
    await page.goBack();
    expect(errors).toEqual([]);
  });

  test('touch controls steer and fire', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Touch controls are only shown on touch devices');
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
    await expect(page.getByTestId('touch-controls')).toBeVisible();
    await expect(page.locator('.keyboard-hint')).toHaveCount(0);

    const forward = page.getByTestId('touch-forward');
    const right = page.getByTestId('touch-turnRight');
    // Two fingers at once: sail forward while turning right.
    await forward.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true });
    await right.dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch', isPrimary: false, bubbles: true });
    await advance(page, 600);
    await right.dispatchEvent('pointerup', { pointerId: 12, pointerType: 'touch', bubbles: true });
    await advance(page, 400);
    await forward.dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch', bubbles: true });

    let s = await state(page);
    expect(s.player.angle).toBeCloseTo(-Math.PI / 2 + 2.6 * 0.6, 1);
    expect(s.player.x).toBeGreaterThan(768 + 20);
    expect(s.player.y).toBeLessThan(448);

    // A quick tap still fires (taps shorter than a frame are latched).
    await page.getByTestId('touch-fireFront').tap();
    await advance(page, 20);
    s = await state(page);
    expect(s.projectiles.filter((p) => p.team === 'player')).toHaveLength(1);
    await page.getByTestId('touch-fireRight').tap();
    await advance(page, 20);
    s = await state(page);
    expect(s.projectiles.filter((p) => p.team === 'player')).toHaveLength(4);

    // HUD and controls fit the screen without overlapping the arena edges.
    const viewport = page.viewportSize();
    for (const id of ['hud', 'touch-controls']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box).not.toBeNull();
      if (box && viewport) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      }
    }
  });

  test('portrait orientation pauses the match on touch devices', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Orientation handling only applies to touch devices');
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(page.getByTestId('rotate-hint')).toBeVisible();
    expect((await state(page)).phase).toBe('paused');
    expect(await advance(page, 1000)).toBe(0);
    await page.setViewportSize({ width: 915, height: 412 });
    await expect(page.getByTestId('rotate-hint')).toBeHidden();
    await expect(page.getByTestId('pause-reason')).toHaveText('Rotate your device to landscape to keep playing.');
    await page.getByTestId('pause-resume').click();
    expect((await state(page)).phase).toBe('running');
  });
});
