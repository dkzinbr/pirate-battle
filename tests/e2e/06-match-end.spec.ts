import { expect, test } from '@playwright/test';
import {
  advance,
  advanceUntilEnded,
  END_DELAY_MS,
  hold,
  NO_SPAWNS,
  openApp,
  setOptions,
  spawnEnemy,
  startMatch,
  state,
  tap,
  waitForSession,
} from './support';

test.describe('match end', () => {
  test('ends when time runs out and freezes the simulation', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await setOptions(page, { duration: 60 });
    await startMatch(page);
    await hold(page, 'KeyW', 1000);

    // Asking for more time than is left only simulates up to the end.
    const { timeLeft } = await state(page);
    const simulated = await advance(page, timeLeft * 1000 + 100);
    expect(Math.abs(simulated - timeLeft * 1000)).toBeLessThan(10);
    const s = await state(page);
    expect(s.status).toBe('ended');
    expect(s.phase).toBe('ending');
    expect(s.endReason).toBe('time_up');
    expect(s.elapsed).toBeCloseTo(60, 5);
    await expect(page.getByTestId('hud-time')).toHaveText('00:00');
    await expect(page.getByTestId('match-announcement')).toHaveText('Time is up. Final score 0.');

    // Input and time no longer affect the world.
    const frozen = s.player;
    await page.keyboard.down('KeyW');
    expect(await advance(page, 300)).toBe(0);
    await page.keyboard.up('KeyW');
    await tap(page, 'Space');
    const after = await state(page);
    expect(after.player).toMatchObject({ x: frozen.x, y: frozen.y, angle: frozen.angle });
    expect(after.projectiles.filter((p) => p.team === 'player')).toHaveLength(0);
    expect(after.elapsed).toBe(s.elapsed);

    await advance(page, END_DELAY_MS);
    await expect(page.getByTestId('result-panel')).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Time up');
    await expect(page.getByTestId('result-duration')).toHaveText('01:00');
  });

  test('ends when the player ship is sunk', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
    // Five rams of 20 damage sink the 100 hp player.
    const ring = [0, 1, 2, 3, 4].map((i) => (i / 5) * Math.PI * 2);
    for (const a of ring) await spawnEnemy(page, 'chaser', 768 + Math.cos(a) * 170, 448 + Math.sin(a) * 170);
    const s = await advanceUntilEnded(page, 6000);
    expect(s.endReason).toBe('destroyed');
    expect(s.player.alive).toBe(false);
    expect(s.score).toBe(0);
    expect(s.timeLeft).toBeGreaterThan(100);
    await expect(page.getByTestId('status-state')).toHaveText('Sunk');
    expect(await advance(page, 200)).toBe(0);
    expect((await state(page)).elapsed).toBe(s.elapsed);

    await advance(page, END_DELAY_MS);
    await expect(page.getByTestId('result-panel')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ship sunk' })).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Ship sunk');
  });

  test('play again starts a clean match', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await setOptions(page, { duration: 60 });
    await startMatch(page);
    await spawnEnemy(page, 'chaser', 768 + 200, 448);
    await hold(page, 'KeyW', 800);
    await tap(page, 'Space');
    await advance(page, 60_000 + END_DELAY_MS);
    await expect(page.getByTestId('result-panel')).toBeVisible();

    await page.getByTestId('result-play-again').click();
    await waitForSession(page);
    const s = await state(page);
    expect(s).toMatchObject({ phase: 'running', status: 'running', score: 0, elapsed: 0, timeLeft: 60 });
    expect(s.player).toMatchObject({ x: 768, y: 448, health: 100, speed: 0 });
    expect(s.enemies).toHaveLength(0);
    expect(s.projectiles).toHaveLength(0);
    await expect(page.getByTestId('hud-time')).toHaveText('01:00');
    await expect(page.getByTestId('hud-health')).toHaveText('100 / 100');
    // Only one canvas is ever attached.
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('restart from the pause menu discards the current match', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
    await hold(page, 'KeyW', 1500);
    await spawnEnemy(page, 'shooter', 300, 440);
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-restart').click();
    await waitForSession(page);
    const s = await state(page);
    expect(s).toMatchObject({ phase: 'running', elapsed: 0, score: 0 });
    expect(s.player).toMatchObject({ x: 768, y: 448 });
    expect(s.enemies).toHaveLength(0);
    expect(await page.evaluate(() => Object.keys(window.__pirate.outbox()))).toHaveLength(0);
  });
});
