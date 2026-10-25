// Phone frame-pacing probe: node tools/pacing-probe.mjs [out.json] [--roots dirA,dirB] [--rigs dpr2,dpr3,..] [--shapes demo,20x30] [--hold ms]
// Per root (a client/ copy to A/B; default this one) x rig x shape: 400x800 touch page at DPR 2 or 3 on the real GPU under 4x CPU
// (cpu6: 6x, a CPU-bound phone; high: the high tier, a GPU-bound one; high-1366: the perf gate's GPU-bound high rig, 1366x768 DPR 1, 1x; high-1920 / high-2560: the same at 1920x1080 / 2560x1440; auto-1920 / auto-2560: the same picked high, not asked, so it may step down a tier;
// low-400: the perf gate's low rig, DPR 1 4x), walks to the farthest plot then idles `hold` ms (4000), and reads the frame intervals (avg, p99, 1% low fps, worst, frames > 33 ms), how
// often the canvas pixel ratio changed (each change is a resize hitch), the ratio range and the tier at the end.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, preview } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = args[0] && !args[0].startsWith('--') ? args[0] : null;
const roots = opt('roots', '.').split(',').map((r) => resolve(r));
const rigs = opt('rigs', 'dpr2,dpr3').split(',');
const shapes = opt('shapes', 'demo,20x30').split(',');
const RIG = {
  dpr2: { dpr: 2, quality: null, throttle: 4 },
  dpr3: { dpr: 3, quality: null, throttle: 4 },
  'dpr2-medium': { dpr: 2, quality: 'medium', throttle: 4 },
  'dpr3-medium': { dpr: 3, quality: 'medium', throttle: 4 },
  'dpr3-high': { dpr: 3, quality: 'high', throttle: 4 },
  'dpr3-high-cpu1': { dpr: 3, quality: 'high', throttle: 1 },
  'dpr2-cpu6': { dpr: 2, quality: 'medium', throttle: 6 },
  'high-1366': { dpr: 1, quality: 'high', throttle: 1, w: 1366, h: 768, touch: false },
  'high-1920': { dpr: 1, quality: 'high', throttle: 1, w: 1920, h: 1080, touch: false },
  'high-2560': { dpr: 1, quality: 'high', throttle: 1, w: 2560, h: 1440, touch: false },
  'auto-1920': { dpr: 1, quality: null, stored: 'high', throttle: 1, w: 1920, h: 1080, touch: false },
  'auto-2560': { dpr: 1, quality: null, stored: 'high', throttle: 1, w: 2560, h: 1440, touch: false },
  'low-400': { dpr: 1, quality: 'low', throttle: 4 },
};
const hold = Number(opt('hold', '4000'));

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });

/** In-page: every frame's interval, the canvas pixel ratio and the tier, from now on. */
function record() {
  const v = window.mooblox;
  const rec = { frames: [] };
  window.__pp = rec;
  let last = performance.now();
  const tick = (t) => {
    rec.frames.push([t - last, v.stage.renderer.getPixelRatio(), v.quality.tier, v.quality.gpuMs ?? null]);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function stats(frames) {
  const ms = frames.map((f) => f[0]);
  const sorted = [...ms].sort((a, b) => b - a);
  const worst1 = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 100)));
  let changes = 0;
  let t = 0;
  const steps = [];
  const tiers = [];
  const spikes = [];
  for (let i = 1; i < frames.length; i++) {
    t += frames[i][0];
    if (frames[i][0] > 50) spikes.push([+(t / 1000).toFixed(1), Math.round(frames[i][0])]);
    if (frames[i][2] !== frames[i - 1][2]) tiers.push([+(t / 1000).toFixed(1), frames[i][2]]);
    if (frames[i][1] === frames[i - 1][1]) continue;
    changes++;
    const gpu = frames.slice(Math.max(0, i - 60), i).map((f) => f[3]).filter((g) => g !== null).sort((a, b) => a - b);
    steps.push([+(t / 1000).toFixed(1), +frames[i][1].toFixed(2), gpu.length ? +gpu[Math.floor(gpu.length * 0.9)].toFixed(1) : null]);
  }
  const ratios = frames.map((f) => f[1]);
  return {
    frames: ms.length,
    avgMs: +(ms.reduce((s, x) => s + x, 0) / ms.length).toFixed(1),
    p99Ms: +sorted[Math.floor(sorted.length / 100)].toFixed(1),
    low1Fps: +(1000 / (worst1.reduce((s, x) => s + x, 0) / worst1.length)).toFixed(1),
    worstMs: +sorted[0].toFixed(1),
    over33: ms.filter((x) => x > 33.4).length,
    ratioChanges: changes,
    /** Each pixel ratio change: [s since start, new ratio, GPU p90 ms of the 60 frames before]. */
    steps,
    ratioMin: Math.min(...ratios),
    ratioEnd: ratios.at(-1),
    tierEnd: frames.at(-1)[2],
    /** Each tier change: [s since start, new tier]. */
    tiers,
    /** Each frame over 50 ms: [s since start, ms]. */
    spikes,
  };
}

const rows = [];
try {
  for (const root of roots) {
    const dist = mkdtempSync(join(tmpdir(), 'mooblox-pacing-'));
    await build({ root, logLevel: 'error', build: { outDir: dist, emptyOutDir: true, rolldownOptions: { input: join(root, 'index.html') } } });
    const server = await preview({ root, logLevel: 'error', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
    const url = server.resolvedUrls.local[0];
    try {
      for (const name of rigs) {
        const rig = RIG[name];
        for (const shape of shapes) {
          const q = [shape === 'demo' ? '' : `shape=${shape}&course=${shape.length * 97 + 11}`, rig.quality ? `quality=${rig.quality}` : '', 'walk=far'].filter(Boolean).join('&');
          const page = await browser.newPage({ viewport: { width: rig.w ?? 400, height: rig.h ?? 800 }, deviceScaleFactor: rig.dpr, hasTouch: rig.touch ?? true });
          page.on('pageerror', (e) => console.error('pageerror:', e.message));
          if (rig.stored) await page.addInitScript((t) => localStorage.setItem('mooblox-tier', t), rig.stored);
          const cdp = await page.context().newCDPSession(page);
          await page.goto(`${url}?${q}`);
          await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 180000, polling: 50 });
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: rig.throttle });
          await page.evaluate(record);
          await page.waitForFunction(() => window.mooblox.probe.reached, null, { timeout: 90000, polling: 200 }).catch(() => null);
          await page.waitForTimeout(hold);
          const frames = await page.evaluate(() => window.__pp.frames);
          const { cpuBound, gpuMs } = await page.evaluate(() => ({ cpuBound: window.mooblox.quality.dynamic.cpuBound ?? null, gpuMs: window.mooblox.quality.gpuMs ?? null }));
          const row = { root: root.split('/').slice(-2).join('/'), rig: name, shape, dpr: rig.dpr, throttle: rig.throttle, ...stats(frames), cpuBound, gpuMs };
          rows.push(row);
          console.log(JSON.stringify(row));
          await page.close();
        }
      }
    } finally {
      await server.close();
      rmSync(dist, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
}
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
