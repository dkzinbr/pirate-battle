// Ad-hoc visual probe used during development: node scripts/probe.mjs [url]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:5173/';
const out = process.env.PROBE_OUT ?? 'test-results/probe';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto(`${base}?e2e=1&seed=7&clock=manual`);
await page.waitForSelector('[data-testid="menu-play"]');
await page.screenshot({ path: `${out}/menu.png` });
await page.click('[data-testid="menu-play"]');
await page.waitForFunction(() => window.__pirate?.hasSession());
await page.evaluate(() => window.__pirate.advance(4000));
await page.screenshot({ path: `${out}/arena.png` });
await page.keyboard.down('KeyW');
await page.keyboard.down('Space');
await page.evaluate(() => window.__pirate.advance(1500));
await page.keyboard.up('Space');
await page.keyboard.down('KeyE');
await page.evaluate(() => window.__pirate.advance(300));
await page.keyboard.up('KeyE');
await page.keyboard.up('KeyW');
await page.screenshot({ path: `${out}/arena2.png` });
const state = await page.evaluate(() => window.__pirate.getState());
console.log(JSON.stringify({ player: state.player, enemies: state.enemies, projectiles: state.projectiles.length, score: state.score }, null, 1));
await page.evaluate(() => window.__pirate.advance(20000));
await page.screenshot({ path: `${out}/arena3.png` });
console.log(logs.join('\n'));
await browser.close();
