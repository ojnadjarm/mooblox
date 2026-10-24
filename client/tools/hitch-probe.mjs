// First-appearance hitch probe: node tools/hitch-probe.mjs [out.json] [--rigs low,medium] [--shapes demo,20x30] [--throttle 4]
// Builds the dev pages, then per rig triggers each effect twice (first appearance, then a repeat) and reads the worst frame in a
// window after it, the programs and textures the world renderer added in that window, and long tasks: sparkles, a collectible
// pick-up, the class-goal fireworks, the wardrobe (open, wear, save), the pet (on medium and up), and a walk to the farthest plot
// (impostors, decals, new islands). Low = the realistic proxy (Iris Xe, DPR 1, 400x800, 4x CPU); medium = 1366x768 at the same CPU.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = args[0] && !args[0].startsWith('--') ? args[0] : null;
const rigs = opt('rigs', 'low,medium').split(',');
const shapes = opt('shapes', 'demo,20x30').split(',');
const throttle = Number(opt('throttle', '4'));
const RIG = { low: { w: 400, h: 800, touch: true }, medium: { w: 1366, h: 768, touch: false } };

const dist = mkdtempSync(join(tmpdir(), 'mooblox-hitch-'));
await build({ logLevel: 'error', build: { outDir: dist, emptyOutDir: true, rolldownOptions: { input: ['index.html', 'rewards.html'] } } });
const server = await preview({ logLevel: 'error', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });

/** In-page: records every frame (time, length, world programs, textures) and long tasks; `__hp.at()` is now. */
function record() {
  const v = window.mooblox;
  const r = v.stage.renderer;
  const hp = { frames: [], long: [], at: () => performance.now() };
  window.__hp = hp;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) hp.long.push([e.startTime, e.duration]);
  }).observe({ type: 'longtask' });
  let last = performance.now();
  const tick = (t) => {
    hp.frames.push([t, t - last, r.info.programs.length, r.info.memory.textures]);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  hp.names = () => r.info.programs.map((p) => /mooblox-[\w-]+/.exec(p.cacheKey)?.[0] ?? p.cacheKey.slice(0, 40));
}

async function open(rig, page, q) {
  const p = await browser.newPage({ viewport: { width: rig.w, height: rig.h }, deviceScaleFactor: 1, hasTouch: rig.touch });
  p.on('pageerror', (e) => console.error('pageerror:', e.message));
  const cdp = await p.context().newCDPSession(p);
  await p.goto(`${url}${page}?${q}`);
  await p.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 180000, polling: 50 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await p.evaluate(record);
  return p;
}

/** Worst frame, frames over 33 ms, programs and textures added and long tasks between two marks. */
async function windowOf(page, from, to, names0) {
  return page.evaluate(([a, b, n0]) => {
    const hp = window.__hp;
    const f = hp.frames.filter(([t]) => t > a && t <= b + 34);
    const before = hp.frames.filter(([t]) => t <= a).at(-1) ?? f[0];
    const end = f.at(-1) ?? before;
    const names = hp.names();
    return {
      maxFrame: +Math.max(0, ...f.map((x) => x[1])).toFixed(1),
      over33: f.filter((x) => x[1] > 33).length,
      programs: end[2] - before[2],
      newPrograms: names.slice(n0),
      textures: end[3] - before[3],
      longMs: Math.round(hp.long.filter(([s]) => s > a && s <= b).reduce((s, [, d]) => s + d, 0)),
    };
  }, [from, to, names0]);
}

/** Runs `act`, then waits `ms`; the window's numbers. */
async function measure(page, label, act, ms) {
  await page.waitForTimeout(600);
  const n0 = await page.evaluate(() => window.__hp.names().length);
  const from = await page.evaluate(() => window.__hp.at());
  await act();
  await page.waitForTimeout(ms);
  const to = await page.evaluate(() => window.__hp.at());
  const w = await windowOf(page, from, to, n0);
  return { event: label, ...w };
}

const sparkle = (page) => page.evaluate(() => {
  const p = window.mooblox.player.avatar.root.position;
  window.mooblox.sparkle(p.x + 1, p.y + 1, p.z);
});
/** Opens activity `cmid` through the world's interaction and closes it with Esc (the close completes it). */
async function openAndClose(page, cmid, act) {
  await page.evaluate((id) => {
    const a = window.mooblox.world.sections.flatMap((s) => s.activities).find((x) => x.id === id);
    void window.mooblox.interaction.open(a);
  }, cmid);
  const panel = page.locator('.mooblox-panel-backdrop');
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);
  return act(async () => {
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden', timeout: 5000 });
  });
}
/** Stands the player 3 m from an unfound collectible of `kind` (a teleport: its island builds at once); `step` walks onto it. */
const approach = (page, kind) => page.evaluate((k) => {
  const v = window.mooblox;
  const s = v.rewards.collectibles.spots.find((x) => x.kind === k && !v.rewards.store.rewards.collectibles.find((c) => c.key === x.key)?.found && !window.__hpTaken?.includes(x.key));
  if (!s) return false;
  (window.__hpTaken ??= []).push(s.key);
  window.__hpSpot = s;
  v.player.teleport(s.x + 3, s.z, -Math.PI / 2);
  return true;
}, kind);
const step = (page) => page.evaluate(() => {
  const s = window.__hpSpot;
  window.mooblox.player.teleport(s.x + 0.2, s.z, -Math.PI / 2);
});
async function collect(page, kind, label) {
  if (!(await approach(page, kind))) return { event: label, missing: true };
  await page.waitForTimeout(2500);
  return measure(page, label, () => step(page), 2000);
}
async function wardrobe(page, item) {
  await page.click('.mooblox-hud-avatar');
  await page.click('.mooblox-creator-tab[data-tab="wardrobe"]');
  await page.waitForSelector('.mooblox-ward-item');
  if (item) await page.click(`.mooblox-ward-item[data-item="${item}"]`);
}

const rows = [];
const log = (row) => {
  rows.push(row);
  console.log(JSON.stringify(row));
};
try {
  for (const tier of rigs) {
    const rig = RIG[tier];
    const tag = { tier, w: rig.w, throttle };
    // Rewards page: the goal one completion short, so closing an activity sets off the fireworks.
    const page = await open(rig, 'rewards.html', `nokids&goal=5/6&xp=60&collect=all&quality=${tier}`);
    await page.waitForFunction(() => window.mooblox.rewards.goal?.monument && window.mooblox.rewards.collectibles?.spots.length, null, { timeout: 20000 });
    log({ ...tag, ...(await measure(page, 'idle', async () => {}, 1500)) });
    for (const n of ['1st', '2nd']) log({ ...tag, ...(await measure(page, `sparkles ${n}`, () => sparkle(page), 1500)) });
    for (const n of ['1st', '2nd', '3rd']) log({ ...tag, ...(await collect(page, 'gem', `collect gem ${n}`)) });
    log({ ...tag, ...(await collect(page, 'star', 'collect star 1st')) });
    log({ ...tag, ...(await openAndClose(page, 42, (close) => measure(page, 'fireworks 1st', close, 3500))) });
    log({ ...tag, ...(await measure(page, 'wardrobe open 1st', () => wardrobe(page, null), 1200)) });
    log({ ...tag, ...(await measure(page, 'wardrobe wear hat 1st', () => page.click('.mooblox-ward-item[data-item="hat-cap"]'), 1200)) });
    log({ ...tag, ...(await measure(page, 'wardrobe save 1st', () => page.click('.mooblox-creator-save'), 1500)) });
    log({ ...tag, ...(await measure(page, 'wardrobe open 2nd', () => wardrobe(page, null), 1200)) });
    log({ ...tag, ...(await measure(page, 'wardrobe save 2nd', () => page.click('.mooblox-creator-save'), 1500)) });
    await page.close();
    if (tier !== 'low') {
      // The pet walks in the world from medium up; it loads and first draws a moment after ready.
      const pp = await open(rig, 'rewards.html', `nokids&pet=pet-dog&quality=${tier}`);
      const from = await pp.evaluate(() => window.__hp.at());
      const n0 = await pp.evaluate(() => window.__hp.names().length);
      await pp.waitForFunction(() => !!window.mooblox.rewards.pet.pet, null, { timeout: 20000 });
      await pp.waitForTimeout(2000);
      const to = await pp.evaluate(() => window.__hp.at());
      log({ ...tag, event: 'pet appears', ...(await windowOf(pp, from, to, n0)) });
      await pp.close();
    }
    for (const shape of shapes) {
      const q = `${shape === 'demo' ? '' : `shape=${shape}&course=${shape.length * 97 + 11}&`}quality=${tier}&walk=far`;
      const wp = await open(rig, 'index.html', q);
      const from = await wp.evaluate(() => window.__hp.at());
      const n0 = await wp.evaluate(() => window.__hp.names().length);
      await wp.waitForFunction(() => window.mooblox.probe.reached, null, { timeout: 60000, polling: 200 }).catch(() => null);
      await wp.waitForTimeout(1000);
      const to = await wp.evaluate(() => window.__hp.at());
      log({ ...tag, event: `walk ${shape}`, ...(await windowOf(wp, from, to, n0)) });
      await wp.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
  rmSync(dist, { recursive: true, force: true });
}
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
