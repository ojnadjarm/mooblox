// Far view, bridges, kids and the plaza ring at one set of cameras: node tools/far-stills.mjs <outdir> [--shapes demo,8x12] [--tiers high,xhigh]
// [--sizes 1920x1080,2560x1440] [--query k=v] [--video]
// Per shape x tier x size: the player stands on the spawn hub 6 m in from the rim facing the first zone's bridge (`out`), then on
// the first zone facing the hub (`back`); stills after streaming and captures settle, plus draws, triangles, programs, heap and
// the characters drawn off the current island. `--video` records the spawn plaza ring while the camera circles it (`ring.webm`).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith('--')) {
  console.error('usage: node tools/far-stills.mjs <outdir> [--shapes ..] [--tiers ..] [--sizes ..] [--query k=v] [--video]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const shapes = opt('shapes', 'demo,8x12').split(',');
const tiers = opt('tiers', 'high,xhigh').split(',');
const sizes = opt('sizes', '1920x1080,2560x1440').split(',').map((s) => s.split('x').map(Number));
const extra = opt('query', '');
const video = args.includes('--video');
mkdirSync(out, { recursive: true });
const query = (shape, tier) => `${shape === 'demo' ? '' : `shape=${shape}&course=${shape.length * 97 + 11}&`}quality=${tier}${extra ? `&${extra}` : ''}`;

const dist = mkdtempSync(join(tmpdir(), 'mooblox-far-'));
await build({ logLevel: 'error', build: { outDir: dist, emptyOutDir: true, rolldownOptions: { input: 'index.html' } } });
const server = await preview({ logLevel: 'error', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });

/** Teleports the player `inset` m in from island `from`'s rim towards island `to`, facing it. */
const stand = (page, from, to, inset) =>
  page.evaluate(
    ([f, t, r]) => {
      const v = window.mooblox;
      const islands = [...v.layout.hubs, ...v.layout.zones];
      const a = islands[f];
      const b = islands[t];
      const ang = Math.atan2(b.z - a.z, b.x - a.x);
      const d = a.radius - r;
      v.player.teleport(a.x + Math.cos(ang) * d, a.z + Math.sin(ang) * d, Math.atan2(Math.cos(ang), Math.sin(ang)));
    },
    [from, to, inset],
  );

/** Draws, triangles, programs, heap and characters drawn off the current island, over 2 s of frames. */
const measure = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const v = window.mooblox;
        const r = v.stage.renderer;
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 2000) return requestAnimationFrame(tick);
          const islands = [...v.layout.hubs, ...v.layout.zones];
          // The dev handle spreads the view (its getters froze at boot): the player's island is the circle it stands in.
          const me = v.player.avatar.root.position;
          const here = islands.find((c) => Math.hypot(me.x - c.x, me.z - c.z) <= c.radius + 2) ?? islands[0];
          let off = 0;
          let on = 0;
          const offAt = [];
          v.stage.scene.traverseVisible((o) => {
            if (o.name !== 'character' || o === v.player.avatar.root) return;
            const p = o.getWorldPosition(o.position.clone());
            if (Math.hypot(p.x - here.x, p.z - here.z) <= here.radius + 2) on++;
            else {
              off++;
              offAt.push([+p.x.toFixed(1), +p.z.toFixed(1), o.parent?.name ?? '']);
            }
          });
          resolve({ fps: Math.round((n * 1000) / (performance.now() - t0)), calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length, geometries: r.info.memory.geometries, textures: r.info.memory.textures, heapMb: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), kidsOn: on, kidsOff: off, offAt, island: islands.indexOf(here) });
        };
        requestAnimationFrame(tick);
      }),
  );

const jpeg = async (page, name) => {
  const png = join(out, `${name}.png`);
  await page.screenshot({ path: png });
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '2', png.replace(/\.png$/, '.jpg')]);
  rmSync(png);
};

const settle = async (page) => {
  await page.waitForFunction(() => window.mooblox.streaming.pending === 0, null, { timeout: 60000, polling: 100 });
  await page.waitForTimeout(12000);
};

const rows = [];
try {
  for (const shape of shapes) {
    for (const tier of tiers) {
      for (const [w, h] of sizes) {
        const vdir = join(out, 'video-tmp');
        const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(video ? { recordVideo: { dir: vdir, size: { width: 1280, height: 720 } } } : {}) });
        const page = await context.newPage();
        page.on('pageerror', (e) => console.error('pageerror:', e.message));
        await page.goto(`${url}?${query(shape, tier)}`);
        await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 120000, polling: 100 });
        const tag = `${shape}-${tier}-${w}`;
        const hubs = await page.evaluate(() => window.mooblox.layout.hubs.length);
        for (const [view, from, to, inset] of [['out', 0, hubs, 6], ['back', hubs, 0, 10]]) {
          await stand(page, from, to, inset);
          await settle(page);
          const m = await measure(page);
          await jpeg(page, `${tag}-${view}`);
          const row = { shape, tier, w, h, view, ...m };
          rows.push(row);
          console.log(JSON.stringify(row));
        }
        if (video) {
          // The camera circles the spawn plaza ring: the player walks a slow arc 9.5 m out, facing the fountain.
          await page.evaluate(
            () =>
              new Promise((resolve) => {
                const v = window.mooblox;
                const hub = v.layout.hubs[0];
                const t0 = performance.now();
                const tick = () => {
                  const t = (performance.now() - t0) / 1000;
                  const a = 0.4 + t * 0.35;
                  v.player.teleport(hub.x + Math.cos(a) * 9.5, hub.z + Math.sin(a) * 9.5, Math.atan2(-Math.cos(a), -Math.sin(a)));
                  if (t < 6) requestAnimationFrame(tick);
                  else resolve();
                };
                requestAnimationFrame(tick);
              }),
          );
          await jpeg(page, `${tag}-ring`);
        }
        await context.close();
        if (video) {
          for (const f of readdirSync(vdir)) renameSync(join(vdir, f), join(out, `${tag}-ring.webm`));
          rmSync(vdir, { recursive: true, force: true });
        }
      }
    }
  }
} finally {
  await browser.close();
  await new Promise((res) => server.httpServer.close(res));
  rmSync(dist, { recursive: true, force: true });
}
writeFileSync(join(out, 'stills.json'), `${JSON.stringify(rows, null, 1)}\n`);
