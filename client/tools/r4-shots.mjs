// T1397 stills: node tools/r4-shots.mjs <outdir> <prefix>: hub portal from behind, raised lawns from their stairs (dev pages, 1366).
// Lawn stairs go to <outdir>/stairs-<shape>.json; a later run shoots only stairs listed there (same spot pre and post).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const [out, prefix = 'pre'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
async function open(path) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${base}${path}`);
  await page.waitForSelector('#mooblox-root[data-ready="1"]', { timeout: 60000 });
  await page.waitForTimeout(800);
  return page;
}
try {
  const hub = await open('hub.html?n=6');
  await hub.evaluate(() => window.mooblox.player.teleport(0.6, -23.5, 0));
  await hub.waitForTimeout(1500);
  await hub.screenshot({ path: join(out, `${prefix}-portal-behind.png`) });
  await hub.evaluate(() => window.mooblox.player.teleport(-1.2, -21.2, 0.5));
  await hub.waitForTimeout(1200);
  await hub.screenshot({ path: join(out, `${prefix}-portal-behind-near.png`) });
  const low = await open('index.html?quality=low');
  await low.evaluate(() => {
    const s = window.mooblox.dressing.portal;
    window.mooblox.player.teleport(s.x - Math.sin(s.face) * 3, s.z - Math.cos(s.face) * 3, s.face);
  });
  await low.waitForTimeout(1500);
  await low.screenshot({ path: join(out, `${prefix}-return-portal-behind-low.png`) });
  for (const [shape, n] of [['', 3], ['?shape=8x12', 3]]) {
    const page = await open(`index.html${shape}`);
    const stairs = await page.evaluate(() => window.mooblox.dressing.stairs.filter((s) => !s.pier && s.high > 0.85 && s.high < 1.45 && s.width < 2).map((s) => ({ x: s.x, z: s.z, face: s.face, run: s.run })));
    const name = shape ? '8x12' : 'demo';
    const file = join(out, `stairs-${name}.json`);
    const known = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    const pick = known ? stairs.filter((s) => known.some((k) => Math.hypot(k.x - s.x, k.z - s.z) < 0.3)) : stairs;
    if (!known) writeFileSync(file, JSON.stringify(stairs));
    for (let i = 0; i < Math.min(n, pick.length); i++) {
      const s = pick[i];
      const d = s.run + 0.2;
      const side = 2.2;
      const x = s.x + Math.sin(s.face) * d + Math.cos(s.face) * side;
      const z = s.z + Math.cos(s.face) * d - Math.sin(s.face) * side;
      await page.evaluate(([x, z, y]) => window.mooblox.player.teleport(x, z, y), [x, z, s.face + Math.PI - 0.35]);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(out, `${prefix}-lawn-${name}-${i}.png`) });
    }
  }
} finally {
  await browser.close();
  await server.close();
}
