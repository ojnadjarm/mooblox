// Hub hint vs logo sign at t = 1 s on the dev hub page: node tools/hint-shots.mjs <outdir> <prefix> [--widths 400,768,1366,1920,2560]
// Writes <prefix>-<w>.jpg and <prefix>-overlap.json; exit 1 when the hint covers the sign or another HUD control at any width.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const [out, prefix = 'hint', ...rest] = process.argv.slice(2);
const at = rest.indexOf('--widths');
const widths = (at >= 0 ? rest[at + 1] : '400,768,1366,1920,2560').split(',').map(Number);
const HEIGHT = { 400: 860, 768: 1024, 1366: 768, 1920: 1080, 2560: 1440 };
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const rows = [];
try {
  for (const w of widths) {
    const touch = w <= 768;
    const page = await browser.newPage({ viewport: { width: w, height: HEIGHT[w] ?? 900 }, deviceScaleFactor: 1, hasTouch: touch });
    page.on('pageerror', (e) => console.error('pageerror:', e.message));
    await page.goto(`${server.resolvedUrls.local[0]}hub.html?n=6${touch ? '&touch' : ''}`);
    await page.waitForSelector('#mooblox-root[data-ready="1"]', { timeout: 30000 });
    await page.waitForTimeout(1000);
    const m = await page.evaluate(() => {
      const cam = window.mooblox.stage.camera;
      const V = cam.position.constructor;
      const pts = [];
      for (const x of [-8.2, 8.2]) for (const y of [9, 13.4]) for (const z of [-27.4, -25.2]) pts.push(new V(x, y, z).project(cam));
      const xs = pts.map((p) => ((p.x + 1) / 2) * innerWidth);
      const ys = pts.map((p) => ((1 - p.y) / 2) * innerHeight);
      const sign = { x: Math.min(...xs), y: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
      const el = document.querySelector('.mooblox-hub-hint');
      const h = el.getBoundingClientRect();
      const hint = { x: h.left, y: h.top, r: h.right, b: h.bottom };
      const ow = Math.max(0, Math.min(sign.r, hint.r) - Math.max(sign.x, hint.x));
      const oh = Math.max(0, Math.min(sign.b, hint.b) - Math.max(sign.y, hint.y));
      const covers = [];
      for (const other of document.querySelectorAll('.mooblox-prompt:not([hidden]), .mooblox-stick, .mooblox-jump, .mooblox-look-tip:not([hidden])')) {
        const o = other.getBoundingClientRect();
        if (o.width && Math.min(o.right, hint.r) > Math.max(o.left, hint.x) && Math.min(o.bottom, hint.b) > Math.max(o.top, hint.y)) covers.push(other.className);
      }
      return { sign, hint, covers, fontPx: parseFloat(getComputedStyle(el).fontSize), visible: getComputedStyle(el).opacity !== '0', overlapPx: Math.round(ow * oh), scrollW: document.documentElement.scrollWidth };
    });
    await page.screenshot({ path: join(out, `${prefix}-${w}.jpg`), type: 'jpeg', quality: 85 });
    rows.push({ width: w, ...m });
    console.log(`${w}: overlap ${m.overlapPx} px², covers [${m.covers}], hint font ${m.fontPx}px, visible ${m.visible}, scrollW ${m.scrollW}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(join(out, `${prefix}-overlap.json`), JSON.stringify(rows, null, 1));
process.exit(rows.some((r) => r.overlapPx > 0 || r.covers.length > 0 || !r.visible) ? 1 : 0);
