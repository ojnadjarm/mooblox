// Logo places on the live 5.2 site: node tools/logo-shots.mjs <outdir> <prefix> [--widths 400,768,1366,1920,2560] [--only course,loading,hud,hub,fallback]
// Writes <prefix>-<place>-<w>.jpg plus <prefix>-favicons.json (the icon links of play.php and index.php) and <prefix>-layout.json (horizontal overflow per shot).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChromium } from './playwright.mjs';

const [out, prefix = 'post', ...rest] = process.argv.slice(2);
const flag = (name, def) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : def);
const widths = flag('--widths', '400,768,1366,1920,2560').split(',').map(Number);
const only = flag('--only', 'course,loading,hud,hub,fallback').split(',');
const site = process.env.MOOBLOX_MOODLE ?? 'http://localhost:8052';
const user = process.env.MOOBLOX_USER ?? 'mooblox_student';
const courseid = Number(process.env.MOOBLOX_COURSE ?? 30);
mkdirSync(out, { recursive: true });

const chromium = await loadChromium();
const gpu = ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'];
const layout = {};

async function session(args) {
  const browser = await chromium.launch({ headless: true, args });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${site}/login/index.php`);
  await page.fill('#username', user);
  await page.fill('#password', 'Testdata1!');
  await Promise.all([page.waitForNavigation(), page.click('#loginbtn')]);
  return { browser, page };
}

const height = (w) => (w <= 400 ? 860 : w <= 768 ? 1024 : Math.round(w * 0.5625));

async function shoot(page, place, w) {
  const name = `${prefix}-${place}-${w}.jpg`;
  layout[name] = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 80 });
  console.log(name, `overflow ${layout[name]}`);
}

const { browser, page } = await session(gpu);
try {
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: height(w) });
    if (only.includes('course')) {
      await page.goto(`${site}/course/view.php?id=${courseid}`);
      await shoot(page, 'course', w);
    }
    if (only.includes('loading')) {
      // A slow bundle keeps the page at its first paint, as a slow network does.
      const slow = (route) => setTimeout(() => route.continue().catch(() => {}), 4000);
      await page.route('**/client/dist/mooblox.js*', slow);
      await page.goto(`${site}/local/mooblox/play.php?id=${courseid}`, { waitUntil: 'load' }).catch(() => {});
      await page.waitForTimeout(1200);
      await shoot(page, 'loading', w);
      await page.unroute('**/client/dist/mooblox.js*', slow);
    }
    if (only.includes('hud')) {
      await page.goto(`${site}/local/mooblox/play.php?id=${courseid}`);
      await page.waitForFunction(() => window.mooblox?.interaction, null, { timeout: 90000 });
      await page.waitForTimeout(2500);
      await shoot(page, 'hud', w);
    }
    if (only.includes('hub')) {
      await page.goto(`${site}/local/mooblox/index.php`);
      await page.waitForFunction(() => window.mooblox, null, { timeout: 90000 });
      await page.waitForTimeout(2500);
      await shoot(page, 'hub', w);
    }
  }
  const icons = {};
  for (const path of [`/local/mooblox/play.php?id=${courseid}`, '/local/mooblox/index.php']) {
    await page.goto(`${site}${path}`, { waitUntil: 'domcontentloaded' });
    icons[path] = await page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"]')].map((l) => ({ rel: l.rel, type: l.type, href: l.href })));
  }
  writeFileSync(join(out, `${prefix}-favicons.json`), JSON.stringify(icons, null, 2));
} finally {
  await browser.close();
}

if (only.includes('fallback')) {
  const s = await session(['--mute-audio', '--disable-3d-apis']);
  try {
    for (const w of widths) {
      await s.page.setViewportSize({ width: w, height: height(w) });
      await s.page.goto(`${site}/local/mooblox/play.php?id=${courseid}`);
      await s.page.waitForSelector('.mooblox-fallback', { timeout: 60000 });
      await s.page.waitForTimeout(800);
      await shoot(s.page, 'fallback', w);
    }
  } finally {
    await s.browser.close();
  }
}
writeFileSync(join(out, `${prefix}-layout.json`), JSON.stringify(layout, null, 2));
