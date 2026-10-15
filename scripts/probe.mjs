// Ad-hoc visual probe used during development: node scripts/probe.mjs [url]
import { chromium, devices } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:5173/';
const out = process.env.PROBE_OUT ?? 'test-results/probe';
const browser = await chromium.launch();
const logs = [];

async function desktop() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => logs.push(`[desktop ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[desktop pageerror] ${err.message}`));
  await page.goto(`${base}?e2e=1&seed=7&clock=manual&scenario=instant`);
  await page.click('[data-testid="menu-options"]');
  await page.fill('[data-testid="option-spawn-time"]', '0');
  await page.click('[data-testid="options-save"]');
  await page.screenshot({ path: `${out}/options.png` });
  await page.goto(`${base}?e2e=1&seed=7&clock=manual&scenario=instant#/log/ranking`);
  await page.waitForSelector('[data-testid="ranking-row"]');
  await page.screenshot({ path: `${out}/ranking.png` });
  await page.goto(`${base}?e2e=1&seed=7&clock=manual&scenario=instant#/`);
  await page.click('[data-testid="menu-play"]');
  await page.waitForFunction(() => window.__pirate?.hasSession());
  await page.evaluate(() => window.__pirate.advance(6000));
  await page.keyboard.press('KeyP');
  await page.screenshot({ path: `${out}/pause.png` });
  await page.click('[data-testid="pause-resume"]');
  await page.evaluate(() => window.__pirate.advance(130000));
  await page.waitForSelector('[data-testid="result-panel"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/result.png` });
  await page.click('[data-testid="result-menu"]');
  await page.click('[data-testid="menu-history"]');
  await page.waitForSelector('[data-testid="history-row"]');
  await page.screenshot({ path: `${out}/history.png` });
  await page.close();
}

async function mobile() {
  const context = await browser.newContext({ ...devices['Pixel 7 landscape'] });
  const page = await context.newPage();
  page.on('console', (msg) => logs.push(`[mobile ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[mobile pageerror] ${err.message}`));
  await page.goto(`${base}?e2e=1&seed=7&clock=manual&scenario=instant`);
  await page.screenshot({ path: `${out}/m-menu.png` });
  await page.click('[data-testid="menu-play"]');
  await page.waitForFunction(() => window.__pirate?.hasSession());
  await page.evaluate(() => window.__pirate.advance(5000));
  await page.screenshot({ path: `${out}/m-arena.png` });
  await context.close();
}

await desktop();
await mobile();
console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('React DevTools') && !l.includes('GPU stall')).join('\n'));
await browser.close();
