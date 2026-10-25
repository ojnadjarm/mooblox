// Close-up stills of placed kit models in the demo world: node tools/asset-stills.mjs <outdir> [--prefix before] [--ids a,b] [--tier high] [--turn 0] [--query shape=8x12&course=399] [--zoom 0.5] [--look 0.4] [--eye 3.8] [--width 400]
// For each id the placement nearest the hub gets a front three-quarter camera fitted to its footprint (wide fountains, tall
// stalls fill the frame from outside); JPEG `<prefix>-<pack>__<name>.jpg`.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const IDS = ['town/lantern', 'town/stall-bench', 'nature/fence_simple', 'nature/sign', 'pirate/crate', 'pirate/barrel', 'town/stall-green', 'suburb/building-type-a'];
const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith('--')) {
  console.error('usage: node tools/asset-stills.mjs <outdir> [--prefix before] [--ids a,b] [--tier high] [--turn 0] [--query shape=8x12&course=399] [--zoom 0.5] [--look 0.4] [--eye 3.8] [--width 400]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const prefix = opt('prefix', 'after');
const ids = opt('ids', IDS.join(',')).split(',');
const tier = opt('tier', 'high');
const turn = Number(opt('turn', '0'));
const query = opt('query', '');
const zoom = Number(opt('zoom', '1'));
const look = Number(opt('look', '0.4'));
const eye = opt('eye', '');
const width = Number(opt('width', '1366'));
const footprints = JSON.parse(readFileSync(new URL('../src/world/model-footprints.json', import.meta.url), 'utf8'));
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width, height: width < 800 ? 800 : 768 }, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  await page.goto(`${server.resolvedUrls.local[0]}?quality=${tier}&nokids&scene=overview${query ? `&${query}` : ''}`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 90000 });
  await page.evaluate(() => window.mooblox.stopOverview());
  for (const id of ids) {
    const shot = await page.evaluate(([id, turn, fp, zoom, look, eye]) => {
      const v = window.mooblox;
      const hub = v.layout.hub;
      const all = v.dressing.districts.flatMap((d) => d.placements).filter((p) => p.id === id);
      if (!all.length) return null;
      const p = all.reduce((a, b) => (Math.hypot(b.x - hub.x, b.z - hub.z) < Math.hypot(a.x - hub.x, a.z - hub.z) ? b : a));
      const scale = fp ? (p.width ? p.width / fp.w : p.height / fp.h) : 1;
      const h = fp ? fp.h * scale : p.height;
      const r = Math.hypot(fp ? fp.r * scale : h / 2, h / 2);
      const d = Math.max(r * 2.3, r + 1.2) * zoom;
      const a = p.yaw + 0.55 + turn;
      v.follow({ x: p.x, z: p.z });
      const y = eye === '' ? p.y + h * (look + 0.1) + d * 0.3 + 0.25 : p.y + Number(eye);
      v.stage.camera.position.set(p.x + Math.sin(a) * d, y, p.z + Math.cos(a) * d);
      v.stage.camera.lookAt(p.x, p.y + h * look, p.z);
      v.stage.focusShadow(p.x, p.z, 12);
      return { x: p.x, z: p.z, h, count: all.length };
    }, [id, turn, footprints[id], zoom, look, eye]);
    if (!shot) {
      console.log(`${id}: not placed in the demo world`);
      continue;
    }
    await page.waitForTimeout(900);
    const file = join(out, `${prefix}-${id.replace('/', '__')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
    const info = await page.evaluate(() => window.mooblox.stage.renderer.info.render);
    console.log(`${id}: ${file} placed=${shot.count} h=${shot.h.toFixed(2)} calls=${info.calls} tris=${info.triangles}`);
  }
} finally {
  await browser.close();
  await server.close();
}
