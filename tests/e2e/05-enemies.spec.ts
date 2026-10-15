import { expect, test } from '@playwright/test';
import { advance, NO_SPAWNS, openApp, setOptions, spawnEnemy, startMatch, state } from './support';

test.describe('enemies', () => {
  test('a chaser pursues the player, rams and explodes without scoring', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
    const id = await spawnEnemy(page, 'chaser', 768 + 320, 448, Math.PI / 2);

    const distances: number[] = [];
    for (let i = 0; i < 20; i++) {
      await advance(page, 200);
      const s = await state(page);
      const chaser = s.enemies.find((e) => e.id === id);
      if (!chaser) break;
      distances.push(Math.hypot(chaser.x - s.player.x, chaser.y - s.player.y));
    }
    expect(distances.length).toBeGreaterThan(2);
    expect(distances[distances.length - 1]).toBeLessThan(distances[0] ?? 0);

    const s = await state(page);
    expect(s.enemies.find((e) => e.id === id)).toBeUndefined();
    expect(s.player.health).toBe(80);
    expect(s.score).toBe(0);
    await expect(page.getByTestId('hud-health')).toHaveText('80 / 100');
  });

  test('a shooter closes in, keeps its distance and fires', async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
    const id = await spawnEnemy(page, 'shooter', 768, 448 - 420, Math.PI / 2);

    let minDistance = Number.POSITIVE_INFINITY;
    let sawEnemyShot = false;
    for (let i = 0; i < 40; i++) {
      await advance(page, 150);
      const s = await state(page);
      const shooter = s.enemies.find((e) => e.id === id);
      if (!shooter) throw new Error('shooter disappeared');
      minDistance = Math.min(minDistance, Math.hypot(shooter.x - s.player.x, shooter.y - s.player.y));
      sawEnemyShot ||= s.projectiles.some((p) => p.team === 'enemy');
    }
    const s = await state(page);
    expect(sawEnemyShot).toBe(true);
    expect(s.player.health).toBeLessThan(100);
    // It approached from 420 but never rammed: it holds its preferred range.
    expect(minDistance).toBeLessThan(360);
    expect(minDistance).toBeGreaterThan(200);
    expect(s.player.health % 10).toBe(0);
  });

  test('spawns follow the configured interval, away from the player, with both types', async ({ page }) => {
    await openApp(page);
    await setOptions(page, { spawn: 2 });
    await startMatch(page);

    const total = async () => {
      const { spawned } = await state(page);
      return spawned.chaser + spawned.shooter;
    };
    const seen = new Set<number>();
    const checkNewSpawns = async () => {
      const s = await state(page);
      for (const enemy of s.enemies) {
        if (seen.has(enemy.id)) continue;
        seen.add(enemy.id);
        expect(Math.hypot(enemy.x - s.player.x, enemy.y - s.player.y)).toBeGreaterThan(440);
      }
    };

    // First spawn after the 1.5 s grace period, then one every 2 s.
    await advance(page, 1400);
    expect(await total()).toBe(0);
    await advance(page, 150);
    expect(await total()).toBe(1);
    await checkNewSpawns();
    await advance(page, 1900);
    expect(await total()).toBe(1);
    await advance(page, 150);
    expect(await total()).toBe(2);
    await checkNewSpawns();
    await advance(page, 2000);
    expect(await total()).toBe(3);
    await checkNewSpawns();

    const { spawned } = await state(page);
    expect(spawned.chaser).toBeGreaterThanOrEqual(1);
    expect(spawned.shooter).toBeGreaterThanOrEqual(1);
  });
});
