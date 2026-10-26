// Sailing ships, bow vs travel: node tools/ships.mjs <outdir> [--name prefix] -> <prefix>.webm (8 s, camera beside ship 0),
// <prefix>.png and <prefix>.json (bow · travel per frame for every drawn ship; 1 = bow first, -1 = stern first). Exit 1 when any < 0.9.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const out = args.shift();
if (!out) {
  console.error('usage: node tools/ships.mjs <outdir> [--name prefix]');
  process.exit(2);
}
const i = args.indexOf('--name');
const name = i < 0 ? 'ships' : args[i + 1];
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
let worst = 1;
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${server.resolvedUrls.local[0]}?scene=overview&nokids&quality=high`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const v = window.mooblox;
    // Ships ride at y -3.4 (their waterline) and are 7 m long: rowboats and buoys are smaller.
    const isShips = (o) => {
      if (!o.isInstancedMesh || !o.count || Math.abs(o.instanceMatrix.array[13] + 3.4) > 0.3) return false;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      return o.geometry.boundingSphere.radius > 3;
    };
    const last = new Map();
    window.__dots = [];
    v.onFrame(() => {
      let ships = null;
      v.stage.scene.traverse((o) => {
        if (!ships && (o.name === 'ships' || isShips(o))) ships = o;
      });
      if (!ships) return;
      const a = ships.instanceMatrix.array;
      for (let k = 0; k < ships.count; k++) {
        const e = a.subarray(k * 16, k * 16 + 16);
        const key = `${Math.round(Math.hypot(e[12], e[14]))}`;
        const prev = last.get(key);
        last.set(key, [e[12], e[14]]);
        if (!prev) continue;
        const vx = e[12] - prev[0];
        const vz = e[14] - prev[1];
        const len = Math.hypot(vx, vz);
        const bl = Math.hypot(e[8], e[10]);
        if (len > 1e-3 && len < 2) window.__dots.push((vx * e[8] + vz * e[10]) / (len * bl));
      }
      const e = a.subarray(0, 16);
      const bl = Math.hypot(e[8], e[10]);
      const [bx, bz] = [e[8] / bl, e[10] / bl];
      // Beside ship 0, a little behind its bow line, looking at it.
      v.stage.camera.position.set(e[12] - bz * 20 - bx * 6, 6, e[14] + bx * 20 - bz * 6);
      v.stage.camera.lookAt(e[12], 0, e[14]);
      v.gate.invalidate();
    });
  });
  await page.waitForTimeout(1000);
  const b64 = await page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const canvas = window.mooblox.stage.renderer.domElement;
        const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 4e6 });
        const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
          const buf = new Uint8Array(await new Blob(chunks).arrayBuffer());
          let s = '';
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          resolve(btoa(s));
        };
        rec.start(500);
        setTimeout(() => rec.stop(), ms);
      }),
    8000,
  );
  await page.screenshot({ path: join(out, `${name}.png`) });
  const raw = join(out, `${name}.raw.webm`);
  writeFileSync(raw, Buffer.from(b64, 'base64'));
  if (spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-c', 'copy', join(out, `${name}.webm`)]).status === 0) rmSync(raw);
  else renameSync(raw, join(out, `${name}.webm`));
  const dots = await page.evaluate(() => window.__dots);
  worst = dots.length ? Math.min(...dots) : -2;
  const mean = dots.reduce((s, d) => s + d, 0) / (dots.length || 1);
  writeFileSync(join(out, `${name}.json`), JSON.stringify({ samples: dots.length, worst, mean }, null, 1));
  console.log(`${worst >= 0.9 ? 'ok  ' : 'FAIL'} ships bow · travel over ${dots.length} samples: worst ${worst.toFixed(3)}, mean ${mean.toFixed(3)}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(worst >= 0.9 ? 0 : 1);
