// Headless checks of the rewards UI on rewards.html: node tools/rewards.mjs <hud|levelup|wardrobe|pet> [outdir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const [mode = 'hud', out = '/tmp/mooblox-rewards'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const WIDTHS = [[400, 860], [768, 1024], [1366, 768], [1920, 1080], [2560, 1440]];
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const base = `${server.resolvedUrls.local[0]}rewards.html`;
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

/** Opens the dev page at a size and waits for the rewards wiring. */
async function open(w, h, query = '', extra = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 800, ...extra });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${base}?nokids&${query}`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  return page;
}

/** Bounding box of a selector, or null when absent or hidden. */
const box = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e || e.hidden) return null;
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
}, sel);

const modes = {
  async hud() {
    for (const [w, h] of WIDTHS) {
      const page = await open(w, h, 'weeks=3');
      const b = await box(page, '.mooblox-hud-rewards');
      const book = await box(page, '.mooblox-hud-book');
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
      const text = await page.evaluate(() => document.querySelector('.mooblox-hud-rewards')?.textContent?.replace(/\s+/g, ' ').trim());
      check(!!b && b.x >= 12 && b.right <= w - 12 && b.y >= book.bottom, `${w}: HUD inside the screen under Book (${b && Math.round(b.w)}x${b && Math.round(b.h)})`);
      check(scroll === w, `${w}: no horizontal scroll (${scroll})`);
      check(/0.*45 \/ 50 XP.*3.*Read every page.*3\/4/.test(text ?? ''), `${w}: shows level 0, 45 / 50 XP, weeks 3, quest 3/4`);
      await page.screenshot({ path: join(out, `hud-${w}.png`) });
      await page.close();
    }
    const off = await open(1366, 768, 'off');
    check((await off.evaluate(() => document.querySelectorAll('.mooblox-hud-rewards').length)) === 0, 'rewards off: no HUD built');
    await off.close();
  },
};

try {
  await modes[mode]();
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
