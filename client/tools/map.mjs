// Course map checks: node tools/map.mjs <outdir> [--n 0,1,3,12,40] [--widths 400,768,1366,1920,2560] [--video] [--perf]
//   [--live <site> --user <name> --password <pw>]  (live: the 5.2 site's index.php instead of the dev page; exit 0 = all pass)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const out = args.shift();
if (!out) {
  console.error('usage: node tools/map.mjs <outdir> [--n ..] [--widths ..] [--video] [--perf] [--live site --user u --password p]');
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
const counts = flag('--n', live ? 'live' : '0,1,3,12,40').split(',');
const widths = flag('--widths', '400,768,1366,1920,2560').split(',').map(Number);
const video = has('--video');
const perf = has('--perf');
const prefix = flag('--prefix', 'map');
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

async function open(ctx, n) {
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  const started = Date.now();
  await page.goto(live ? `${live}/local/mooblox/index.php` : `${base}map.html?n=${n}`);
  await page.waitForSelector('#mooblox-root[data-ready="1"]', { timeout: 30000 });
  const paint = Date.now() - started;
  await page.waitForTimeout(500);
  return { page, paint };
}

/** Layout facts of the page: scroll width, label boxes (full ones must not overlap), card and title rects. */
const facts = (page) =>
  page.evaluate(() => {
    const labels = [...document.querySelectorAll('.mooblox-map-label')].filter((b) => !b.hidden);
    const full = labels.filter((b) => !b.classList.contains('is-compact')).map((b) => b.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < full.length; i++) for (let j = i + 1; j < full.length; j++) {
      const a = full[i], b = full[j];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
    }
    const rect = (sel) => {
      const e = document.querySelector(sel);
      if (!e || e.hidden) return null;
      const r = e.getBoundingClientRect();
      return { left: r.left, right: innerWidth - r.right, top: r.top, bottom: innerHeight - r.bottom, width: r.width };
    };
    const r = window.mooblox.stage.renderer;
    return {
      scrollW: document.documentElement.scrollWidth,
      labels: labels.length,
      named: full.length,
      overlaps,
      card: rect('.mooblox-map-card'),
      empty: rect('.mooblox-map-empty'),
      hint: rect('.mooblox-map-hint'),
      calls: r.info.render.calls,
      tris: r.info.render.triangles,
      programs: r.info.programs.length,
      courses: window.mooblox.courses.length,
    };
  });

try {
  for (const n of counts) {
    for (const w of widths) {
      const ctx = await context(w);
      const { page, paint } = await open(ctx, n);
      const f = await facts(page);
      const tag = `${live ? 'live' : `n${n}`}-${w}`;
      await page.screenshot({ path: join(out, `${prefix}-${tag}.png`) });
      check(`${tag} no horizontal scroll`, f.scrollW <= w, `scrollW ${f.scrollW}`);
      check(`${tag} one label per course`, f.labels === f.courses, `${f.labels}/${f.courses}`);
      check(`${tag} named labels do not overlap`, f.overlaps === 0, `${f.named} named, ${f.overlaps} overlaps`);
      if (f.courses === 0) check(`${tag} empty state centred`, !!f.empty && Math.abs(f.empty.left - f.empty.right) < 2, JSON.stringify(f.empty));
      if (f.courses > 0) {
        const pt = await page.evaluate(() => window.mooblox.islandPoint(0));
        if (w < 800) await page.tap('.mooblox-map-label >> nth=0');
        else await page.hover('.mooblox-map-label >> nth=0');
        await page.waitForTimeout(300);
        const g = await facts(page);
        check(`${tag} picking a label shows the card, no flight`, await page.evaluate(() => !document.querySelector('#mooblox-root').dataset.entering));
        check(`${tag} card shows and is centred`, !!g.card && Math.abs(g.card.left - g.card.right) < 2 && g.card.left >= 11, JSON.stringify(g.card));
        await page.screenshot({ path: join(out, `${prefix}-${tag}-card.png`) });
        void pt;
      }
      console.log(`${tag} paint ${paint} ms calls=${f.calls} tris=${f.tris} programs=${f.programs}`);
      results.push({ name: `${tag} numbers`, ok: true, detail: JSON.stringify({ paint, calls: f.calls, tris: f.tris, programs: f.programs }) });
      await ctx.close();
    }
  }

  if (video || perf) {
    const n = live ? 'live' : '6';
    const vdir = join(out, 'video');
    const ctx = await context(1366, video ? { recordVideo: { dir: vdir, size: { width: 1366, height: 768 } } } : {});
    const { page } = await open(ctx, n);
    if (perf) {
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
        return { fps: ((window.mooblox.frames - f0) * 1000) / (performance.now() - t0), worst, heap };
      });
      check('fps >= 55 at 1366', p.fps >= 55, `${p.fps.toFixed(1)} fps, worst ${p.worst.toFixed(1)} ms, heap ${p.heap.toFixed(0)} MB`);
      check('heap <= 800 MB', p.heap < 800, `${p.heap.toFixed(0)} MB`);
    }
    await page.mouse.move(683, 384);
    await page.waitForTimeout(800);
    const target = await page.evaluate(() => window.mooblox.islandPoint(Math.min(2, window.mooblox.courses.length - 1)));
    await page.mouse.move(target.x, target.y, { steps: 25 });
    await page.waitForTimeout(1200);
    const sel = await page.evaluate(() => window.mooblox.selected);
    check('hovering an island shows its card', sel >= 0 && (await page.isVisible('.mooblox-map-card')), `selected ${sel}`);
    const want = await page.evaluate((i) => window.mooblox.courses[i].url, sel);
    if (live) {
      await Promise.all([page.waitForURL(/play\.php/, { timeout: 15000 }), page.mouse.click(target.x, target.y)]);
      check('clicking flies there and opens play.php', page.url().includes(`play.php?id=`), page.url());
      await page.waitForSelector('.mooblox-hud-map', { timeout: 60000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(out, `${prefix}-play-back.png`) });
      await Promise.all([page.waitForURL(/index\.php/, { timeout: 15000 }), page.click('.mooblox-hud-map')]);
      check('map button goes back to the map', page.url().includes('/local/mooblox/index.php'), page.url());
      await page.waitForSelector('#mooblox-root[data-ready="1"]', { timeout: 60000 });
      await page.waitForTimeout(800);
    } else {
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(out, `${prefix}-flight.png`) });
      await page.waitForFunction(() => document.getElementById('mooblox-root').dataset.navigated, null, { timeout: 5000 });
      const got = await page.evaluate(() => document.getElementById('mooblox-root').dataset.navigated);
      check('clicking flies there and opens the course', got === want, got);
      await page.waitForTimeout(400);
    }
    await ctx.close();
    if (video) console.log(`video in ${vdir}`);
  }

  if (!live) {
    const ctx = await context(1366);
    const { page } = await open(ctx, 12);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    const a = await page.evaluate(() => window.mooblox.selected);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    const b = await page.evaluate(() => window.mooblox.selected);
    check('arrow keys move between islands', a >= 0 && b >= 0 && a !== b, `${a} -> ${b}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('mooblox-root').dataset.navigated, null, { timeout: 5000 });
    check('Enter opens the picked course', true);
    await ctx.close();
    const t = await context(400);
    const tp = await open(t, 3);
    const pt = await tp.page.evaluate(() => window.mooblox.islandPoint(1));
    await tp.page.touchscreen.tap(pt.x, pt.y);
    await tp.page.waitForTimeout(300);
    const first = await tp.page.evaluate(() => ({ sel: window.mooblox.selected, nav: document.getElementById('mooblox-root').dataset.navigated ?? '' }));
    check('first tap on an island shows the card', first.sel === 1 && first.nav === '', JSON.stringify(first));
    await tp.page.touchscreen.tap(pt.x, pt.y);
    await tp.page.waitForFunction(() => document.getElementById('mooblox-root').dataset.navigated, null, { timeout: 5000 });
    check('second tap flies in', true);
    await t.close();
  }
} finally {
  writeFileSync(join(out, `${prefix}-checks.json`), JSON.stringify(results, null, 1));
  await browser.close();
  await server?.close();
}
console.log(`${results.filter((r) => r.ok).length} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
