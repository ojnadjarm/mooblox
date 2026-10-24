// Art-round stills and walk clip: node tools/art-stills.mjs <outdir> [--shapes demo,8x12] [--prefix after] [--views a,b] [--video]
// Same cameras every round: overview 1366 (high), play 1366 (high), play 400 (low), plus the concept cameras hub, district and
// shore 1366 (high, `?scene=shot&cam=`, kids on); JPEGs `<prefix>-<shape>-<view>.jpg`.
// --video records `walk.webm` (12 s, 1366x768 high, autopilot to the farthest demo plot) from the canvas stream.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith('--')) {
  console.error('usage: node tools/art-stills.mjs <outdir> [--shapes demo,8x12] [--prefix after] [--views a,b] [--video]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const shapes = opt('shapes', 'demo,8x12').split(',');
const prefix = opt('prefix', 'after');
mkdirSync(out, { recursive: true });

const VIEWS = [
  { name: 'overview-1366', w: 1366, h: 768, tier: 'high', extra: 'scene=overview' },
  { name: 'play-1366', w: 1366, h: 768, tier: 'high', extra: 'nokids' },
  { name: 'play-400', w: 400, h: 800, tier: 'low', extra: 'nokids' },
  { name: 'hub-1366', w: 1366, h: 768, tier: 'high', extra: 'scene=shot&cam=hub' },
  { name: 'district-1366', w: 1366, h: 768, tier: 'high', extra: 'scene=shot&cam=district' },
  { name: 'shore-1366', w: 1366, h: 768, tier: 'high', extra: 'scene=shot&cam=shore' },
];
const only = opt('views', '');
const views = only ? VIEWS.filter((v) => only.split(',').includes(v.name)) : VIEWS;
const query = (shape, tier, extra) => `${shape === 'demo' ? '' : `shape=${shape}&course=${shape.length * 97 + 11}&`}quality=${tier}&${extra}`;

const dist = mkdtempSync(join(tmpdir(), 'mooblox-art-'));
await build({ logLevel: 'error', build: { outDir: dist, emptyOutDir: true, rolldownOptions: { input: 'index.html' } } });
const server = await preview({ logLevel: 'error', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(w, h, q) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 800 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${url}?${q}`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 120000, polling: 50 });
  await page.waitForFunction(() => window.mooblox.streaming.pending === 0, null, { timeout: 60000, polling: 100 });
  return page;
}

try {
  for (const shape of shapes) {
    for (const v of views) {
      const page = await open(v.w, v.h, query(shape, v.tier, v.extra));
      await page.waitForTimeout(1200);
      const n = await page.evaluate(() => {
        const r = window.mooblox.stage.renderer;
        return { calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length };
      });
      const file = join(out, `${prefix}-${shape}-${v.name}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
      console.log(`${file} ${v.tier} calls=${n.calls} tris=${n.tris} programs=${n.programs}`);
      await page.close();
    }
  }
  if (args.includes('--video')) {
    const page = await open(1366, 768, query('demo', 'high', 'nokids&walk=far'));
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
      12000,
    );
    const raw = join(out, 'walk.raw.webm');
    writeFileSync(raw, Buffer.from(b64, 'base64'));
    // MediaRecorder writes no duration; a stream copy through ffmpeg adds it (kept raw when ffmpeg is missing).
    if (spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-c', 'copy', join(out, 'walk.webm')]).status === 0) rmSync(raw);
    else renameSync(raw, join(out, 'walk.webm'));
    console.log(`${join(out, 'walk.webm')} ${Math.round((b64.length * 0.75) / 1024)} KB`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((res) => server.httpServer.close(res));
  rmSync(dist, { recursive: true, force: true });
}
