// Far-view options at one camera: node tools/near-island.mjs <outdir> [--modes fog,full,silhouette,impostor] [--shapes demo,8x12,20x30] [--tier medium] [--size 1366x768]
// Per shape x mode: the player stands on the spawn hub 6 m in from the rim facing the first zone's bridge (eye level, looking out
// over the ring), waits for streaming, haze and captures to settle, then reads fps, draws, triangles, programs and a still.
// Writes options.json and <shape>-<mode>.jpg (ffmpeg) into outdir.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith('--')) {
  console.error('usage: node tools/near-island.mjs <outdir> [--modes ..] [--shapes ..] [--tier medium] [--size 1366x768]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const modes = opt('modes', 'fog,full,silhouette,impostor').split(',');
const shapes = opt('shapes', 'demo,8x12,20x30').split(',');
const tier = opt('tier', 'medium');
const [w, h] = opt('size', '1366x768').split('x').map(Number);
mkdirSync(out, { recursive: true });
const query = (shape, extra) => `${shape === 'demo' ? '' : `shape=${shape}&course=${shape.length * 97 + 11}&`}quality=${tier}&nokids&${extra}`;

const dist = mkdtempSync(join(tmpdir(), 'mooblox-near-'));
await build({ logLevel: 'error', build: { outDir: dist, emptyOutDir: true, rolldownOptions: { input: 'index.html' } } });
const server = await preview({ logLevel: 'error', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const rows = [];
try {
  for (const shape of shapes) {
    for (const mode of modes) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 800 });
      page.on('pageerror', (e) => console.error('pageerror:', e.message));
      await page.goto(`${url}?${query(shape, `far=${mode}`)}`);
      await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 120000, polling: 100 });
      await page.evaluate(() => {
        const v = window.mooblox;
        const hub = v.layout.hubs[0];
        const zone = v.layout.zones[0];
        const a = Math.atan2(zone.z - hub.z, zone.x - hub.x);
        const r = hub.radius - 6;
        v.player.teleport(hub.x + Math.cos(a) * r, hub.z + Math.sin(a) * r, Math.atan2(Math.cos(a), Math.sin(a)));
      });
      await page.waitForFunction(() => window.mooblox.streaming.pending === 0, null, { timeout: 60000, polling: 100 });
      await page.waitForTimeout(mode === 'impostor' ? 15000 : 2500);
      const m = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const r = window.mooblox.stage.renderer;
            let n = 0;
            const t0 = performance.now();
            const tick = () => {
              n++;
              if (performance.now() - t0 < 3000) return requestAnimationFrame(tick);
              resolve({ fps: Math.round((n * 1000) / (performance.now() - t0)), calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length, heapMb: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) });
            };
            requestAnimationFrame(tick);
          }),
      );
      const png = join(out, `${shape}-${mode}.png`);
      await page.screenshot({ path: png });
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '3', png.replace(/\.png$/, '.jpg')]);
      rmSync(png);
      await page.close();
      const row = { shape, mode, tier, w, h, ...m };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
} finally {
  await browser.close();
  await new Promise((res) => server.httpServer.close(res));
  rmSync(dist, { recursive: true, force: true });
}
writeFileSync(join(out, 'options.json'), `${JSON.stringify(rows, null, 1)}\n`);
