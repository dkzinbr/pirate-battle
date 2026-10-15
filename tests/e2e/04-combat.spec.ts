import { expect, test } from '@playwright/test';
import { advance, NO_SPAWNS, openApp, spawnEnemy, startMatch, state, tap } from './support';

const playerShots = async (page: Parameters<typeof state>[0]) => (await state(page)).projectiles.filter((p) => p.team === 'player');

test.describe('combat', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
  });

  test('bow cannon fires a single ball along the bow and respects its cooldown', async ({ page }) => {
    await tap(page, 'Space');
    let shots = await playerShots(page);
    expect(shots).toHaveLength(1);
    expect(shots[0]?.x).toBeCloseTo(768, 0);
    expect(shots[0]?.y).toBeLessThan(448);

    // Still reloading (0.45 s): pressing again does nothing.
    await advance(page, 150);
    await tap(page, 'Space');
    shots = await playerShots(page);
    expect(shots).toHaveLength(1);

    await advance(page, 400);
    await tap(page, 'KeyK');
    expect(await playerShots(page)).toHaveLength(2);
  });

  test('broadsides fire three parallel balls to each side with their own cooldown', async ({ page }) => {
    await tap(page, 'KeyQ');
    const left = await playerShots(page);
    expect(left).toHaveLength(3);
    // Facing north, the port side is west; balls are spread along the hull.
    for (const shot of left) expect(shot.x).toBeLessThan(768);
    const ys = left.map((s) => s.y).sort((a, b) => a - b);
    expect((ys[1] ?? 0) - (ys[0] ?? 0)).toBeCloseTo(22, 0);
    expect((ys[2] ?? 0) - (ys[1] ?? 0)).toBeCloseTo(22, 0);

    await advance(page, 100);
    const moved = await playerShots(page);
    const dx = moved.map((s, i) => s.x - (left[i]?.x ?? 0));
    const dy = moved.map((s, i) => s.y - (left[i]?.y ?? 0));
    for (const d of dx) expect(d).toBeCloseTo(dx[0] ?? 0, 3);
    for (const d of dy) expect(d).toBeCloseTo(0, 3);

    // Right broadside has an independent cooldown.
    await tap(page, 'KeyE');
    const all = await playerShots(page);
    expect(all.filter((s) => s.x > 768)).toHaveLength(3);

    // Left broadside is still reloading (1.6 s).
    await tap(page, 'KeyQ');
    expect(await playerShots(page)).toHaveLength(6);
    await advance(page, 1600);
    await tap(page, 'KeyQ');
    const reloaded = await playerShots(page);
    expect(reloaded).toHaveLength(3);
    for (const shot of reloaded) expect(shot.x).toBeLessThan(768);
  });

  test('hits apply damage once and a kill scores exactly one point', async ({ page }) => {
    const id = await spawnEnemy(page, 'shooter', 768, 248, Math.PI / 2);
    await tap(page, 'Space');
    await advance(page, 500);
    let enemy = (await state(page)).enemies.find((e) => e.id === id);
    expect(enemy?.health).toBe(30);
    expect(await playerShots(page)).toHaveLength(0);

    for (let i = 0; i < 6; i++) {
      await tap(page, 'Space');
      await advance(page, 500);
    }
    const s = await state(page);
    enemy = s.enemies.find((e) => e.id === id);
    expect(enemy?.alive ?? false).toBe(false);
    expect(s.score).toBe(1);
    await expect(page.getByTestId('hud-score')).toHaveText('1');
    await expect(page.getByTestId('status-score')).toHaveText('1');
    await expect(page.getByTestId('match-announcement')).toHaveText('Score 1.');
  });

  test('several balls hitting the same ship at once still score once', async ({ page }) => {
    // A chaser (30 hp) on the port side takes the whole 3-ball broadside (3 × 12).
    await spawnEnemy(page, 'chaser', 768 - 140, 448, 0);
    await tap(page, 'KeyQ');
    await advance(page, 600);
    const s = await state(page);
    expect(s.enemies.filter((e) => e.alive)).toHaveLength(0);
    expect(s.score).toBe(1);
    expect(s.player.health).toBe(100);
    await advance(page, 1000);
    expect((await state(page)).score).toBe(1);
  });
});
