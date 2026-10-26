// Close-up stills of the world's animals: node tools/critter-stills.mjs <outdir> [--prefix after] [--kinds dog,cat,duck] [--tier high] [--width 1366] [--query q]
// For each kind the camera follows its first visible instance every frame (front three-quarter, 1.3 m away at its head height),
// so the walking animal stays framed; JPEG `<prefix>-<kind>.jpg`.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith('--')) {
  console.error('usage: node tools/critter-stills.mjs <outdir> [--prefix after] [--kinds dog,cat,duck] [--tier high] [--width 1366] [--query q]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const prefix = opt('prefix', 'after');
const kinds = opt('kinds', 'dog,cat,duck').split(',');
const tier = opt('tier', 'high');
const width = Number(opt('width', '1366'));
const query = opt('query', '');
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
  for (const kind of kinds) {
    const found = await page.evaluate((kind) => {
      const v = window.mooblox;
      const mesh = v.stage.scene.getObjectByName(kind);
      if (!mesh) return false;
      const m = new mesh.matrix.constructor();
      const look = { x: 0, y: 0, z: 0 };
      cancelAnimationFrame(window.__critterCam ?? 0);
      // Until an instance is in view (pets show only on islands the camera sees), stand by the first one's home.
      const home = v.dressing.critters.find((c) => c.kind === kind);
      const frame = () => {
        if (mesh.count === 0 && home) {
          v.follow({ x: home.x, z: home.z });
          v.stage.camera.position.set(home.x + 3, home.y + 2, home.z + 3);
          v.stage.camera.lookAt(home.x, home.y, home.z);
        } else if (mesh.count > 0) {
          mesh.getMatrixAt(0, m);
          const e = m.elements;
          const s = Math.hypot(e[8], e[9], e[10]) || 1;
          const [fx, fz] = [e[8] / s, e[10] / s];
          const [x, y, z] = [e[12], e[13], e[14]];
          const a = Math.atan2(fx, fz) + 0.6;
          const d = kind === 'duck' ? 0.9 : 1.3;
          look.x = x + fx * 0.25;
          look.y = y + (kind === 'duck' ? 0.25 : 0.5);
          look.z = z + fz * 0.25;
          v.follow({ x, z });
          v.stage.camera.position.set(x + Math.sin(a) * d, look.y + 0.25, z + Math.cos(a) * d);
          v.stage.camera.lookAt(look.x, look.y, look.z);
          v.stage.focusShadow(x, z, 6);
        }
        window.__critterCam = requestAnimationFrame(frame);
      };
      frame();
      return true;
    }, kind);
    if (!found) {
      console.log(`${kind}: no mesh`);
      continue;
    }
    await page.waitForTimeout(2500);
    const file = join(out, `${prefix}-${kind}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
    console.log(`${kind}: ${file}`);
  }
} finally {
  await browser.close();
  await server.close();
}
