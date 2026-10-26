// Hub checks: node tools/hub.mjs <outdir> [--n 0,1,3,6,12,40] [--widths 400,768,1366,1920,2560] [--video] [--perf] [--prefix hub]
//   [--live <site> --user <name> --password <pw>]  (live: the 5.2 site's index.php instead of the dev page; exit 0 = all pass)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const out = args.shift();
if (!out) {
  console.error('usage: node tools/hub.mjs <outdir> [--n ..] [--widths ..] [--video] [--perf] [--live site --user u --password p]');
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
const live = flag('--live', '');
const user = flag('--user', '');
const password = flag('--password', '');
const counts = flag('--n', live ? 'live' : '0,1,3,6,12,40').split(',').filter(Boolean);
const widths = flag('--widths', '400,768,1366,1920,2560').split(',').map(Number);
const video = has('--video');
const perf = has('--perf');
const prefix = flag('--prefix', 'hub');
mkdirSync(out, { recursive: true });
const HEIGHT = { 400: 860, 768: 1024, 1366: 768, 1920: 1080, 2560: 1440 };

let server = null;
let base = live;
if (!live) {
  server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  base = server.resolvedUrls.local[0];
}
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
let fails = 0;
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

async function context(w, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: HEIGHT[w] ?? 900 }, deviceScaleFactor: 1, hasTouch: w < 800, isMobile: false, ...opts });
  if (live) {
    const page = await ctx.newPage();
    await page.goto(`${live}/login/index.php`);
    await page.fill('#username', user);
    await page.fill('#password', password);
    await Promise.all([page.waitForNavigation(), page.click('#loginbtn')]);
    await page.close();
  }
  return ctx;
}

async function open(ctx, n, query = '') {
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  const started = Date.now();
  await page.goto(live ? `${live}/local/mooblox/index.php${query ? `?${query}` : ''}` : `${base}hub.html?n=${n}${query ? `&${query}` : ''}`);
  await page.waitForSelector('#mooblox-root[data-ready="1"]', { timeout: 30000 });
  const paint = Date.now() - started;
  await page.waitForTimeout(800);
  return { page, paint };
}

/** Layout facts: scroll width, HUD rects (margins to each side), render numbers. */
const facts = (page) =>
  page.evaluate(() => {
    const rect = (sel) => {
      const e = document.querySelector(sel);
      if (!e || e.hidden || getComputedStyle(e).display === 'none') return null;
      const r = e.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(innerWidth - r.right), top: Math.round(r.top), bottom: Math.round(innerHeight - r.bottom), width: Math.round(r.width) };
    };
    const r = window.mooblox.stage.renderer;
    return {
      scrollW: document.documentElement.scrollWidth,
      title: rect('.mooblox-hub-title'),
      floor: rect('.mooblox-hub-floor'),
      sound: rect('.mooblox-sound'),
      hint: rect('.mooblox-hub-hint'),
      empty: rect('.mooblox-hub-empty'),
      calls: r.info.render.calls,
      tris: r.info.render.triangles,
      programs: r.info.programs.length,
      courses: window.mooblox.courses.length,
      floors: window.mooblox.floors,
      links: document.querySelectorAll('.mooblox-hub-list a').length,
    };
  });

const overlap = (a, b, w) => a && b && a.left < w - b.right && b.left < w - a.right && a.top < b.top + 60 && b.top < a.top + 60;
const whiteOut = (page) => page.evaluate(() => Number(document.querySelector('.mooblox-hub-flash').style.opacity || 0));
const navigated = (page) => page.evaluate(() => document.getElementById('mooblox-root').dataset.navigated ?? '');

try {
  for (const n of counts) {
    for (const w of widths) {
      const ctx = await context(w);
      const { page, paint } = await open(ctx, n);
      const f = await facts(page);
      const tag = `${live ? 'live' : `n${n}`}-${w}`;
      await page.screenshot({ path: join(out, `${prefix}-${tag}.png`) });
      check(`${tag} no horizontal scroll`, f.scrollW <= w, `scrollW ${f.scrollW}`);
      check(`${tag} first paint < 3 s`, paint < 3000, `${paint} ms`);
      check(`${tag} a link per course`, f.links === f.courses, `${f.links}/${f.courses}`);
      check(`${tag} floors of five`, f.floors === Math.max(1, Math.ceil(f.courses / 5)), `${f.floors} floors`);
      check(`${tag} HUD inside the screen, no overlaps`, [f.title, f.floor, f.sound].every((r) => !r || (r.left >= 0 && r.right >= 0)) && !overlap(f.title, f.sound, w) && !overlap(f.floor, f.sound, w), JSON.stringify({ t: f.title, f: f.floor, s: f.sound }));
      check(`${tag} title and floor share the margin`, !f.title || !f.floor || Math.abs(f.title.left - f.floor.right) < 2, `${f.title?.left} / ${f.floor?.right}`);
      if (f.courses === 0) check(`${tag} empty card centred`, !!f.empty && Math.abs(f.empty.left - f.empty.right) < 2 && f.empty.left >= 11, JSON.stringify(f.empty));
      if (f.hint) check(`${tag} hint centred`, Math.abs(f.hint.left - f.hint.right) < 2 && f.hint.left >= 11, JSON.stringify(f.hint));
      await page.evaluate(() => window.mooblox.player.teleport(0, 5, 0));
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(out, `${prefix}-${tag}-show.png`) });
      console.log(`${tag} paint ${paint} ms calls=${f.calls} tris=${f.tris} programs=${f.programs}`);
      results.push({ name: `${tag} numbers`, ok: true, detail: JSON.stringify({ paint, calls: f.calls, tris: f.tris, programs: f.programs }) });
      await ctx.close();
    }
  }

  if (perf) {
    const ctx = await context(1366);
    const { page } = await open(ctx, live ? 'live' : '6');
    const p = await page.evaluate(async () => {
      const f0 = window.mooblox.frames;
      const t0 = performance.now();
      let worst = 0;
      let last = t0;
      await new Promise((done) => {
        const tick = (t) => {
          worst = Math.max(worst, t - last);
          last = t;
          if (t - t0 < 5000) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      const heap = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : -1;
      const r = window.mooblox.stage.renderer.info;
      return { fps: ((window.mooblox.frames - f0) * 1000) / (performance.now() - t0), worst, heap, calls: r.render.calls, programs: r.programs.length };
    });
    check('fps >= 55 at 1366', p.fps >= 55, `${p.fps.toFixed(1)} fps, worst ${p.worst.toFixed(1)} ms, draws ${p.calls}, programs ${p.programs}`);
    check('heap <= 800 MB', p.heap < 800, `${p.heap.toFixed(0)} MB`);
    results.push({ name: 'perf numbers', ok: true, detail: JSON.stringify(p) });
    await ctx.close();
  }

  if (!live && counts.includes('12')) {
    const ctx = await context(1366);
    const { page } = await open(ctx, 12);
    await page.click('.mooblox-hub-floor button[aria-label="Floor above"]');
    await page.waitForTimeout(900);
    check('the floor button rides up a floor', (await page.evaluate(() => window.mooblox.floor)) === 1);
    await page.evaluate(() => window.mooblox.walkTo(5));
    await page.waitForFunction(() => window.mooblox.warping >= 0, null, { timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${prefix}-warp.png`) });
    await page.waitForFunction(() => document.getElementById('mooblox-root').dataset.navigated, null, { timeout: 5000 });
    const want = await page.evaluate(() => window.mooblox.courses[5].url);
    check('walking onto a pad warps into its course', (await navigated(page)) === want, await navigated(page));
    await page.close();
    const lift = await open(ctx, 12);
    await lift.page.evaluate(() => window.mooblox.walkTo(0));
    await lift.page.waitForTimeout(400);
    await lift.page.keyboard.down('KeyS');
    await lift.page.waitForTimeout(600);
    await lift.page.keyboard.up('KeyS');
    await lift.page.evaluate(() => window.mooblox.walkToLift());
    await lift.page.waitForFunction(() => window.mooblox.floor === 1, null, { timeout: 15000 }).catch(() => undefined);
    check('stepping onto the lift goes up a floor', (await lift.page.evaluate(() => window.mooblox.floor)) === 1);
    check('no warp from the lift', (await navigated(lift.page)) === '');
    await lift.page.close();
    const from = await open(ctx, 12, 'from=107');
    const back = await from.page.evaluate(() => ({ floor: window.mooblox.floor, i: window.mooblox.courses.findIndex((c) => c.id === 107), x: window.mooblox.player.body.position.x, z: window.mooblox.player.body.position.z }));
    check('coming back lands on the floor of that course', back.floor === Math.floor(back.i / 5), JSON.stringify(back));
    await from.page.waitForTimeout(1500);
    check('no warp on arrival', (await navigated(from.page)) === '');
    check('the arrival white-out clears', (await whiteOut(from.page)) === 0);
    await ctx.close();
  }

  if (video) {
    const vdir = join(out, 'video');
    const ctx = await context(1366, { recordVideo: { dir: vdir, size: { width: 1366, height: 768 } } });
    const { page } = await open(ctx, live ? 'live' : '6');
    const i = await page.evaluate(() => Math.min(1, window.mooblox.courses.length - 1));
    const want = await page.evaluate((k) => window.mooblox.courses[k].url, i);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.mooblox.player.teleport(0, 4, 0));
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.mooblox.player.teleport(0, -3.5, Math.PI));
    await page.waitForTimeout(800);
    if (live) {
      await Promise.all([page.waitForURL(/play\.php/, { timeout: 30000, waitUntil: 'commit' }), page.evaluate((k) => window.mooblox.walkTo(k), i)]);
      check('walking onto a pad opens play.php', page.url().includes(want.split('/local/')[1]), page.url());
      await page.waitForSelector('.mooblox-hud-hub', { timeout: 60000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(out, `${prefix}-play-back.png`) });
      await Promise.all([page.waitForURL(/index\.php\?from=/, { timeout: 15000, waitUntil: 'commit' }), page.click('.mooblox-hud-hub')]);
      check('the Hub button comes back to the hub', page.url().includes('/local/mooblox/index.php?from='), page.url());
      await page.waitForSelector('#mooblox-root[data-ready="1"]', { timeout: 60000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(out, `${prefix}-returned.png`) });
      const pos = await page.evaluate(() => window.mooblox.player.body.position);
      check('back in front of the pad', Math.hypot(pos.x, pos.z) > 8, JSON.stringify(pos));
      check('the arrival white-out clears', (await whiteOut(page)) === 0);
    } else {
      await page.evaluate((k) => window.mooblox.walkTo(k), i);
      await page.waitForFunction(() => document.getElementById('mooblox-root').dataset.navigated, null, { timeout: 20000 });
      check('video walk warps into the course', (await navigated(page)) === want, await navigated(page));
      await page.waitForTimeout(400);
    }
    await ctx.close();
    console.log(`video in ${vdir}`);
  }
} finally {
  writeFileSync(join(out, `${prefix}-checks.json`), JSON.stringify(results, null, 1));
  await browser.close();
  await server?.close();
}
console.log(`${results.filter((r) => r.ok).length} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
