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

/** Opens activity `cmid` through the world's interaction, then closes the panel with Esc. */
async function openAndClose(page, cmid) {
  await page.evaluate((id) => {
    const a = window.mooblox.world.sections.flatMap((s) => s.activities).find((x) => x.id === id);
    void window.mooblox.interaction.open(a);
  }, cmid);
  const panel = page.locator('.mooblox-panel-backdrop');
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden', timeout: 5000 });
}

/** Counts level-up cards shown from now on (a MutationObserver on the page). */
const countCards = (page) => page.evaluate(() => {
  window.__cards = 0;
  new MutationObserver((rs) => {
    for (const r of rs) for (const n of r.addedNodes) if (n.classList?.contains('mooblox-levelup')) window.__cards++;
  }).observe(document.body, { childList: true, subtree: true });
});

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
  async levelup() {
    for (const [w, h] of [[1366, 768], [400, 860]]) {
      const page = await open(w, h);
      await countCards(page);
      await openAndClose(page, 42);
      await page.waitForSelector('.mooblox-levelup', { timeout: 5000 }).catch(() => null);
      const text = await page.evaluate(() => document.querySelector('.mooblox-levelup')?.textContent?.replace(/\s+/g, ' ').trim());
      check(/Level 1!.*You unlocked: Explorer hat/.test(text ?? ''), `${w}: complete an activity -> card "${text}"`);
      check(await page.evaluate(() => !!document.querySelector('.mooblox-levelup canvas')), `${w}: confetti canvas while moving`);
      const hud = await page.evaluate(() => document.querySelector('.mooblox-hud-rewards')?.textContent?.replace(/\s+/g, ' '));
      check(/55 \/ 150 XP/.test(hud ?? ''), `${w}: HUD now level 1, 55 / 150 XP`);
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(out, `levelup-${w}.png`) });
      await page.keyboard.press('Space');
      check(!(await page.evaluate(() => !!document.querySelector('.mooblox-levelup'))), `${w}: any key skips`);
      await openAndClose(page, 43);
      await page.waitForTimeout(800);
      check((await page.evaluate(() => window.__cards)) === 1, `${w}: shown once (another completion at the same level adds none)`);
      await page.reload();
      await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
      await page.waitForTimeout(800);
      check(!(await page.evaluate(() => !!document.querySelector('.mooblox-levelup'))), `${w}: no card on reload`);
      await page.close();
    }
    const calm = await open(1366, 768, '', { reducedMotion: 'reduce' });
    await openAndClose(calm, 42);
    await calm.waitForSelector('.mooblox-levelup', { timeout: 5000 }).catch(() => null);
    const state = await calm.evaluate(() => ({ card: !!document.querySelector('.mooblox-levelup.is-calm .mooblox-levelup-card'), canvas: !!document.querySelector('.mooblox-levelup canvas') }));
    check(state.card && !state.canvas, 'reduced motion: static card, no confetti');
    await calm.screenshot({ path: join(out, 'levelup-reduced-1366.png') });
    await calm.mouse.click(30, 700);
    check(!(await calm.evaluate(() => !!document.querySelector('.mooblox-levelup'))), 'reduced motion: a tap skips');
    await calm.close();
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
