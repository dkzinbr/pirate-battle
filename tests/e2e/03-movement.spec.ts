import { expect, test } from '@playwright/test';
import { advance, distanceToObstacle, hold, NO_SPAWNS, openApp, startMatch, state, turnTo, wrapAngle } from './support';

test.describe('movement', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { overrides: NO_SPAWNS });
    await startMatch(page);
  });

  test('starts a match at the spawn point with full health and timer', async ({ page }) => {
    const s = await state(page);
    expect(s.phase).toBe('running');
    expect(s.player).toMatchObject({ x: 768, y: 448, health: 100, alive: true });
    expect(s.player.angle).toBeCloseTo(-Math.PI / 2);
    await expect(page.getByTestId('hud-time')).toHaveText('02:00');
    await expect(page.getByTestId('hud-score')).toHaveText('0');
    await expect(page.getByTestId('hud-health')).toHaveText('100 / 100');
  });

  test('sails only forward along the bow and rotates both ways', async ({ page }) => {
    // Idle ships do not drift.
    await advance(page, 1000);
    expect((await state(page)).player).toMatchObject({ x: 768, y: 448 });

    await hold(page, 'KeyW', 1000);
    let s = await state(page);
    expect(s.player.y).toBeLessThan(448 - 60);
    expect(s.player.x).toBeCloseTo(768, 3);

    // There is no reverse: releasing W only slows the ship down.
    const y = s.player.y;
    await advance(page, 2000);
    s = await state(page);
    expect(s.player.y).toBeLessThanOrEqual(y);
    expect(s.player.speed).toBeCloseTo(0, 1);

    const before = s.player.angle;
    await hold(page, 'KeyD', 500);
    const afterRight = (await state(page)).player.angle;
    expect(afterRight - before).toBeCloseTo(1.3, 1);
    await hold(page, 'ArrowLeft', 1000);
    const afterLeft = (await state(page)).player.angle;
    expect(afterRight - afterLeft).toBeCloseTo(2.6, 1);
  });

  test('stays inside the arena borders', async ({ page }) => {
    await hold(page, 'KeyW', 6000);
    const { player } = await state(page);
    expect(player.y).toBeGreaterThanOrEqual(player.radius - 0.01);
    expect(player.y).toBeLessThan(player.radius + 1);

    await turnTo(page, Math.PI);
    await hold(page, 'KeyW', 8000);
    const after = (await state(page)).player;
    expect(after.x).toBeGreaterThanOrEqual(after.radius - 0.01);
    expect(after.x).toBeLessThan(after.radius + 1);
  });

  test('islands block the ship', async ({ page }) => {
    const s = await state(page);
    // South-east jungle island.
    const target = s.obstacles.find((o) => distanceToObstacle(1216, 640, o) < 0);
    if (!target) throw new Error('island not found');
    const cx = (target.minX + target.maxX) / 2;
    const cy = (target.minY + target.maxY) / 2;
    await turnTo(page, Math.atan2(cy - s.player.y, cx - s.player.x));

    // Keep sailing straight into the island, correcting the bow like a player would.
    await page.keyboard.down('KeyW');
    let minClearance = Number.POSITIVE_INFINITY;
    let last = { x: 0, y: 0 };
    for (let i = 0; i < 32; i++) {
      const { player } = await state(page);
      minClearance = Math.min(minClearance, distanceToObstacle(player.x, player.y, target) - player.radius);
      last = { x: player.x, y: player.y };
      const diff = wrapAngle(Math.atan2(cy - player.y, cx - player.x) - player.angle);
      if (Math.abs(diff) > 0.05) {
        await hold(page, diff > 0 ? 'KeyD' : 'KeyA', Math.min(250, (Math.abs(diff) / 2.6) * 1000));
      } else {
        await advance(page, 250);
      }
    }
    await page.keyboard.up('KeyW');

    expect(minClearance).toBeGreaterThan(-0.5);
    // It reached the shore and stopped there instead of passing through.
    expect(distanceToObstacle(last.x, last.y, target) - s.player.radius).toBeLessThan(2);
  });
});
