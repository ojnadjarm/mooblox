// Close-up stills of placed kit models in the demo world: node tools/asset-stills.mjs <outdir> [--prefix before] [--ids a,b] [--tier high] [--turn 0]
// For each id the placement nearest the hub gets an eye-level camera (front three-quarter); JPEG `<prefix>-<pack>__<name>.jpg`.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const IDS = ['town/lantern', 'town/stall-bench', 'nature/fence_simple', 'nature/sign', 'pirate/crate', 'pirate/barrel', 'town/stall-green', 'suburb/building-type-a'];
const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith('--')) {
  console.error('usage: node tools/asset-stills.mjs <outdir> [--prefix before] [--ids a,b] [--tier high] [--turn 0]');
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
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  await page.goto(`${server.resolvedUrls.local[0]}?quality=${tier}&nokids&scene=overview`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 90000 });
  await page.evaluate(() => window.mooblox.stopOverview());
  for (const id of ids) {
    const shot = await page.evaluate(([id, turn]) => {
      const v = window.mooblox;
      const hub = v.layout.hub;
      const all = v.dressing.districts.flatMap((d) => d.placements).filter((p) => p.id === id);
      if (!all.length) return null;
      const p = all.reduce((a, b) => (Math.hypot(b.x - hub.x, b.z - hub.z) < Math.hypot(a.x - hub.x, a.z - hub.z) ? b : a));
      const size = Math.max(p.height, p.width ?? p.height);
      const d = size * 1.25 + 1.2;
      const a = p.yaw + 0.55 + turn;
      v.follow({ x: p.x, z: p.z });
      v.stage.camera.position.set(p.x + Math.sin(a) * d, p.y + p.height * 0.55 + 0.4, p.z + Math.cos(a) * d);
      v.stage.camera.lookAt(p.x, p.y + p.height * 0.45, p.z);
      v.stage.focusShadow(p.x, p.z, 12);
      return { x: p.x, z: p.z, h: p.height, count: all.length };
    }, [id, turn]);
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
