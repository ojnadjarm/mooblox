// Hub logo sign stills on the dev hub page: node tools/sign-shots.mjs <outdir> <prefix> [--widths 1366,400]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const [out, prefix = 'sign', ...rest] = process.argv.slice(2);
const at = rest.indexOf('--widths');
const widths = (at >= 0 ? rest[at + 1] : '1366,400').split(',').map(Number);
const HEIGHT = { 400: 860, 768: 1024, 1366: 768, 1920: 1080, 2560: 1440 };
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const w of widths) {
    const page = await browser.newPage({ viewport: { width: w, height: HEIGHT[w] ?? 900 }, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => console.error('pageerror:', e.message));
    await page.goto(`${server.resolvedUrls.local[0]}hub.html?n=6`);
    await page.waitForSelector('#mooblox-root[data-ready="1"]', { timeout: 30000 });
    await page.waitForTimeout(13000);
    await page.screenshot({ path: join(out, `${prefix}-spawn-${w}.jpg`), type: 'jpeg', quality: 85 });
    // Close view: the spawn view cropped round the sign at twice the pixels.
    const box = await page.evaluate(() => {
      const cam = window.mooblox.stage.camera;
      const V = cam.position.constructor;
      const pts = [];
      for (const x of [-8.2, 8.2]) for (const y of [9, 13.4]) for (const z of [-27.4, -25.2]) pts.push(new V(x, y, z).project(cam));
      const xs = pts.map((p) => ((p.x + 1) / 2) * innerWidth);
      const ys = pts.map((p) => ((1 - p.y) / 2) * innerHeight);
      return { x: Math.min(...xs), y: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
    });
    const pad = 12;
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    await page.screenshot({ path: join(out, `${prefix}-close-${w}.jpg`), type: 'jpeg', quality: 90, clip: { x, y, width: Math.min(w, box.r + pad) - x, height: box.b + pad - y }, scale: 'device' });
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
