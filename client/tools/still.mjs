// Headless stills of the dev page: node tools/still.mjs <outdir> [WxH ...] [--query q] [--name prefix]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const out = args.shift();
if (!out) {
  console.error('usage: node tools/still.mjs <outdir> [WxH ...] [--query q] [--name prefix]');
  process.exit(2);
}
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i < 0 ? dflt : args.splice(i, 2)[1];
};
const query = flag('--query', '');
const prefix = flag('--name', 'still');
const sizes = (args.length ? args : ['1366x768', '400x860']).map((s) => s.split('x').map(Number));
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 800 });
    page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
    await page.goto(`${url}?${query}`);
    await page.waitForSelector('#mooblox-root[data-ready="1"]', { timeout: 60000 });
    await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const r = window.mooblox.stage.renderer;
      const gl = r.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
        calls: r.info.render.calls,
        triangles: r.info.render.triangles,
        programs: r.info.programs.length,
        scrollW: document.documentElement.scrollWidth,
        probe: JSON.stringify(Object.fromEntries(Object.entries(window.mooblox.probe ?? {}).filter(([k]) => k !== 'ready'))),
      };
    });
    const file = join(out, `${prefix}-${w}.png`);
    await page.screenshot({ path: file });
    console.log(`${w}x${h} ${file} calls=${info.calls} tris=${info.triangles} programs=${info.programs} scrollW=${info.scrollW} probe=${info.probe} gpu=${info.gpu}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
