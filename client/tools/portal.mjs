// Portal checks (T1396): node tools/portal.mjs <outdir> [--prefix post] [--only closeups] [--video]
//   closeups: hub portal with cups, hub lift (dev hub page, 1366); checks: walk-through warp, pad does nothing, lift needs E,
//   course arrival from a portal, return portal back to the hub (dev pages). Exit 0 = all pass.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const out = args.shift();
if (!out) {
  console.error('usage: node tools/portal.mjs <outdir> [--prefix p] [--only closeups] [--video]');
  process.exit(2);
}
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i < 0 ? dflt : args.splice(i, 2)[1];
};
const has = (name) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const prefix = flag('--prefix', 'post');
const only = flag('--only', '');
const video = has('--video');
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
let fails = 0;
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

async function open(ctx, path) {
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${base}${path}`);
  await page.waitForSelector('#mooblox-root[data-ready="1"]', { timeout: 60000 });
  await page.waitForTimeout(800);
  return page;
}
const navigated = (page) => page.evaluate(() => document.getElementById('mooblox-root').dataset.navigated ?? '');
const recorded = (name) => ({ recordVideo: { dir: join(out, `video-${name}`), size: { width: 1366, height: 768 } } });
const context = (rec) => browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, ...(video && rec ? recorded(rec) : {}) });

/** Puts the kid `d` metres from the hub centre on the bearing of pad `i`, facing out towards its arch. */
const facePad = (page, i, d) =>
  page.evaluate(
    ([k, dist]) => {
      const a = -Math.PI / 3 + (k * 2 * Math.PI) / 3 / 4;
      const x = Math.sin(a) * dist;
      const z = -Math.cos(a) * dist;
      window.mooblox.player.teleport(x, z, Math.atan2(x, z));
    },
    [i, d],
  );

try {
  {
    const ctx = await context('');
    const page = await open(ctx, 'hub.html?n=6&done=2');
    const done = await page.evaluate(() => window.mooblox.courses.slice(0, 5).findIndex((c) => c.completed));
    await facePad(page, done, 11.6);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, `${prefix}-portal-cups.png`) });
    await facePad(page, 2, 12.2);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, `${prefix}-portal-open.png`) });
    await page.evaluate(() => window.mooblox.player.teleport(0, 5.2, Math.PI));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, `${prefix}-lift.png`) });
    await ctx.close();
  }
  if (only !== 'closeups') {
    // Walking through a portal's fluid warps; standing on its pad does not.
    {
      const ctx = await context('walk-through');
      const page = await open(ctx, 'hub.html?n=6');
      const url = await page.evaluate(() => window.mooblox.courses[2].url);
      await facePad(page, 2, 15);
      await page.waitForTimeout(1500);
      check('standing on a pad does not warp', (await page.evaluate(() => window.mooblox.warping)) < 0 && (await navigated(page)) === '');
      await facePad(page, 2, 12);
      await page.waitForTimeout(600);
      await page.keyboard.down('KeyW');
      await page.waitForFunction(() => window.mooblox.warping >= 0, null, { timeout: 8000 }).catch(() => undefined);
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(out, `${prefix}-warp.png`) });
      await page.waitForFunction(() => document.getElementById('mooblox-root').dataset.navigated, null, { timeout: 5000 }).catch(() => undefined);
      const nav = await navigated(page);
      check('walking through the portal warps into its course', nav.startsWith(url) && nav.includes('warp=1'), nav);
      await page.waitForTimeout(300);
      await ctx.close();
    }
    // The lift: stepping on it does nothing, E rides up a floor, the number shows the floor.
    {
      const ctx = await context('lift');
      const page = await open(ctx, 'hub.html?n=12');
      await page.evaluate(() => window.mooblox.player.teleport(0, 6, Math.PI));
      await page.waitForTimeout(600);
      await page.evaluate(() => window.mooblox.walkToLift());
      await page.waitForTimeout(3500);
      check('stepping onto the lift does not change floor', (await page.evaluate(() => window.mooblox.floor)) === 0);
      const prompt = await page.evaluate(() => {
        const p = document.querySelector('.mooblox-hub-lift');
        return p && !p.hidden ? p.textContent : '';
      });
      check('the lift shows an E prompt', /E/.test(prompt), prompt.trim());
      await page.screenshot({ path: join(out, `${prefix}-lift-prompt.png`) });
      await page.keyboard.press('KeyE');
      await page.waitForFunction(() => window.mooblox.floor === 1, null, { timeout: 4000 }).catch(() => undefined);
      check('E rides the lift up a floor', (await page.evaluate(() => window.mooblox.floor)) === 1);
      check('the lift centre shows the floor number', (await page.evaluate(() => window.mooblox.liftNumber)) === '2');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(out, `${prefix}-lift-floor2.png`) });
      await page.click('.mooblox-hub-lift button');
      await page.waitForFunction(() => window.mooblox.floor === 2, null, { timeout: 4000 }).catch(() => undefined);
      check('the prompt button rides the lift too', (await page.evaluate(() => window.mooblox.floor)) === 2);
      await page.waitForTimeout(800);
      await ctx.close();
    }
    // The Guide: E presses "Show me" (badge on the button), the nearest E action wins over a farther one.
    {
      const ctx = await context('guide-e');
      const page = await open(ctx, 'index.html');
      await page.waitForFunction(() => {
        const b = document.querySelector('.mooblox-bubble');
        return b && !b.hidden && !b.querySelector('.mooblox-bubble-go').hidden;
      }, null, { timeout: 15000 }).catch(() => undefined);
      const badge = await page.evaluate(() => {
        const k = document.querySelector('.mooblox-bubble-go kbd');
        return k && getComputedStyle(k).display !== 'none' ? k.textContent : '';
      });
      check('the Show me button shows an E badge on PC', badge === 'E', badge);
      await page.screenshot({ path: join(out, `${prefix}-guide-e.png`) });
      const before = await page.evaluate(() => window.mooblox.interaction.nearId);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(300);
      check('E presses Show me', await page.evaluate(() => window.mooblox.player.guided.active));
      check('E opens nothing else at the same time', !(await page.evaluate(() => !!document.querySelector('.mooblox-panel-backdrop:not([hidden])'))), String(before));
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(out, `${prefix}-guide-walk.png`) });
      await ctx.close();
    }
    // Course world: arrival from a portal, then back through the return portal.
    {
      const ctx = await context('course');
      const plain = await open(ctx, 'index.html');
      await plain.waitForTimeout(300);
      check('no arrival on a direct entry', (await plain.evaluate(() => window.mooblox.arrival?.t ?? -1)) === -1);
      await plain.close();
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.error('pageerror:', e.message));
      await page.goto(`${base}index.html?warp=1`);
      await page.waitForFunction(() => (window.mooblox?.arrival?.t ?? -1) >= 0, null, { timeout: 60000 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(out, `${prefix}-arrival.png`) });
      await page.waitForFunction(() => (window.mooblox.arrival?.t ?? -1) === -1, null, { timeout: 8000 }).catch(() => undefined);
      check('the arrival plays and ends', (await page.evaluate(() => window.mooblox.arrival?.t ?? -1)) === -1);
      check('the warp flag leaves the address', !(await page.evaluate(() => location.search)).includes('warp'), await page.evaluate(() => location.search));
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(out, `${prefix}-course-spawn.png`) });
      const site = await page.evaluate(() => window.mooblox.dressing.portal);
      check('the spawn island has a return portal', !!site, JSON.stringify(site));
      if (site) {
        await page.evaluate((s) => {
          const d = 6;
          const x = s.x + Math.sin(s.face) * d;
          const z = s.z + Math.cos(s.face) * d;
          window.mooblox.player.teleport(x, z, s.face + Math.PI);
        }, site);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: join(out, `${prefix}-return-portal.png`) });
        await page.keyboard.down('KeyW');
        await page.waitForFunction(() => document.getElementById('mooblox-root').dataset.warping, null, { timeout: 8000 }).catch(() => undefined);
        await page.keyboard.up('KeyW');
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(out, `${prefix}-return-warp.png`) });
        await page.waitForFunction(() => document.getElementById('mooblox-root').dataset.navigated, null, { timeout: 5000 }).catch(() => undefined);
        const nav = await navigated(page);
        check('the return portal warps back to the hub', nav.includes('hub'), nav);
      }
      await page.waitForTimeout(300);
      await ctx.close();
    }
  }
} finally {
  writeFileSync(join(out, `${prefix}-portal-checks.json`), JSON.stringify(results, null, 1));
  await browser.close();
  await server.close();
}
console.log(`${results.filter((r) => r.ok).length} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
