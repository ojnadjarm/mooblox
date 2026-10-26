// T1397 round 5 stills: node tools/r5-shots.mjs <outdir> <prefix>: each shelf stair from the plaza below, looking up at its destination (near and wide), a video of the course arrival after a warp (dev pages, 1366).
// The first run (post) writes <outdir>/lookouts.json (pages, stairs, kinds); a later run (pre) shoots the same stairs.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const [out, prefix = 'post'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const PAGES = ['', '?shape=8x12', '?shape=3x6&course=1', '?shape=3x6&course=4', '?shape=6x6&course=12'];
const VIEW = { width: 1366, height: 768 };
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
try {
  const file = join(out, 'lookouts.json');
  const known = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const seen = [];
  for (const [p, query] of PAGES.entries()) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('pageerror:', e.message));
    await page.goto(`${base}index.html?nokids&scene=overview${query.replace('?', '&')}`);
    await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 90000 });
    await page.evaluate(() => window.mooblox.stopOverview());
    const stairs = known
      ? known.filter((k) => k.page === p)
      : await page.evaluate((page) => window.mooblox.dressing.lookouts.map((l) => ({ page, kind: l.kind, x: l.stair.x, z: l.stair.z, to: { x: l.x, y: l.y, z: l.z } })), p);
    const all = await page.evaluate(() => window.mooblox.dressing.stairs.map((s) => ({ x: s.x, z: s.z, face: s.face, run: s.run })));
    for (const [i, k] of stairs.slice(0, 2).entries()) {
      const s = all.find((s) => Math.hypot(s.x - k.x, s.z - k.z) < 0.3);
      if (!s) continue;
      seen.push(k);
      for (const [view, back, side, eye] of [['foot', s.run + 6, 1.2, 2.4], ['wide', s.run + 11, -4, 5]]) {
        await page.evaluate(([s, k, back, side, eye]) => {
          const v = window.mooblox;
          const [fx, fz] = [Math.sin(s.face), Math.cos(s.face)];
          const cam = { x: s.x + fx * back + fz * side, z: s.z + fz * back - fx * side };
          cancelAnimationFrame(window.__shotCam ?? 0);
          const frame = () => {
            v.follow({ x: s.x, z: s.z });
            v.stage.camera.position.set(cam.x, eye, cam.z);
            v.stage.camera.lookAt(k.to.x, k.to.y + 0.9, k.to.z);
            v.stage.focusShadow(k.to.x, k.to.z, 14);
            window.__shotCam = requestAnimationFrame(frame);
          };
          frame();
        }, [s, k, back, side, eye]);
        await page.waitForTimeout(2500);
        await page.screenshot({ path: join(out, `${prefix}-lookout-${p}-${i}-${view}.png`) });
      }
    }
    await page.close();
  }
  if (!known) writeFileSync(file, JSON.stringify(seen));
  const video = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, recordVideo: { dir: out, size: VIEW } });
  const page = await video.newPage();
  await page.goto(`${base}index.html?warp=1`);
  await page.waitForFunction(() => window.mooblox?.arrival?.t === -1, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const webm = await page.video().path();
  await video.close();
  renameSync(webm, join(out, `${prefix}-arrival.webm`));
} finally {
  await browser.close();
  await server.close();
}
