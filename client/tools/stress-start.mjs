// Stress start-up probe: node tools/stress-start.mjs [out.json] [--roots dirA,dirB] [--pairs 3] [--shape demo] [--cool 45000] [--query k=v]
//   [--modes cold,warm|warmov|warmidle] [--perf prefix [--perf-all]] [--trace prefix]
// The perf gate's stress rig (SwiftShader, 400x800 DPR 1, low, walk=far, 6x CPU from ready), runs alternating per root: every frame for 7 s from
// ready -> gate-window worst (1.5-6.5 s, as perf.mjs samples), first-5-s worst, frames > 50 ms, and per spike [s, ms, programs, textures,
// geometries, calls, buffer KB, tex calls, tex KB, mipmaps, links, draws, fb ops, new draw-state keys] (WebGL calls since the previous frame);
// `keyed` lists frames that drew a new pipeline-like state (program, vertex layout, blend/depth/cull, target) or program+texture set.
// --modes runs each page in a fresh browser (a cold GPU process); warm* first open a throwaway page for 3 s (walk, overview, idle).
// --perf: sudo perf record of the GPU process (or the whole host with --perf-all, cpu-clock) over the window; --trace: a Chrome trace (2.5 s).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { build, preview } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = args[0] && !args[0].startsWith('--') ? args[0] : null;
const roots = opt('roots', '.').split(',').map((r) => resolve(r));
const pairs = Number(opt('pairs', '3'));
const shape = opt('shape', 'demo');
const cool = Number(opt('cool', '45000'));
const more = opt('query', '');
/** `--perf prefix`: sudo perf record of the GPU process over the recorded window, one file per run (prefix-<pair>-<root>.data). */
const perfOut = opt('perf', null);

const chromium = await loadChromium();
const launch = () => chromium.launch({ headless: true, args: ['--mute-audio', '--enable-precise-memory-info', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
/** `--modes cold,warm`: each run in a fresh browser; warm opens the page once (3 s) before the measured one. Default: one shared browser. */
const modes = opt('modes', null)?.split(',') ?? [null];
let browser = await launch();

/** Init script: counts WebGL uploads per frame (buffer bytes, texture calls and bytes, generateMipmap, links, draws). */
function instrument() {
  const all = [];
  window.__all = all;
  let prev = null;
  const loop = (t) => {
    if (prev !== null) all.push([+t.toFixed(1), +(t - prev).toFixed(1)]);
    prev = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const c = { buf: 0, tex: 0, texBytes: 0, mip: 0, link: 0, draws: 0, fb: 0 };
  window.__gl = c;
  const P = WebGL2RenderingContext.prototype;
  const wrap = (name, f) => {
    const o = P[name];
    P[name] = function (...a) {
      f(a);
      return o.apply(this, a);
    };
  };
  wrap('bufferData', (a) => (c.buf += a[1]?.byteLength ?? (typeof a[1] === 'number' ? a[1] : 0)));
  wrap('bufferSubData', (a) => (c.buf += a[2]?.byteLength ?? 0));
  const tex = (a) => {
    c.tex++;
    const src = a.find((x) => x && typeof x === 'object' && ('width' in x || 'byteLength' in x));
    if (src) c.texBytes += src.byteLength ?? src.width * src.height * 4;
  };
  wrap('texImage2D', tex);
  wrap('texSubImage2D', tex);
  wrap('texStorage2D', (a) => (c.texBytes += a[3] * a[4] * 4));
  wrap('generateMipmap', () => c.mip++);
  wrap('linkProgram', () => c.link++);
  // Pipeline-ish state: what ANGLE keys a Vulkan pipeline on (program, vertex layout, blend, depth, cull, target, topology).
  const st = { prog: 0, vao: null, fb: null, en: {}, blend: '', depth: 1, mask: '', cull: 1029, front: 2305 };
  const ids = new WeakMap();
  let nid = 1;
  const id = (o) => (o ? ids.get(o) ?? (ids.set(o, nid++), ids.get(o)) : 0);
  const layouts = new WeakMap();
  const seen = new Set();
  c.newKeys = [];
  wrap('useProgram', (a) => (st.prog = id(a[0])));
  st.unit = 0;
  st.tex = {};
  wrap('activeTexture', (a) => (st.unit = a[0] - 33984));
  wrap('bindTexture', (a) => (st.tex[st.unit] = id(a[1])));
  wrap('bindVertexArray', (a) => (st.vao = a[0]));
  wrap('bindFramebuffer', (a) => (st.fb = id(a[1])));
  wrap('enable', (a) => (st.en[a[0]] = 1));
  wrap('disable', (a) => (st.en[a[0]] = 0));
  wrap('blendFuncSeparate', (a) => (st.blend = a.join(',')));
  wrap('blendFunc', (a) => (st.blend = a.join(',')));
  wrap('blendEquationSeparate', (a) => (st.blend += '/' + a.join(',')));
  wrap('depthMask', (a) => (st.depth = a[0] ? 1 : 0));
  wrap('depthFunc', (a) => (st.depthFunc = a[0]));
  wrap('colorMask', (a) => (st.mask = a.join('')));
  wrap('cullFace', (a) => (st.cull = a[0]));
  wrap('frontFace', (a) => (st.front = a[0]));
  const attr = (a) => {
    if (!st.vao) return;
    const l = layouts.get(st.vao) ?? {};
    l[a[0]] = a.slice(1).join(':');
    layouts.set(st.vao, l);
  };
  wrap('vertexAttribPointer', attr);
  wrap('vertexAttribIPointer', attr);
  wrap('vertexAttribDivisor', (a) => {
    if (!st.vao) return;
    const l = layouts.get(st.vao) ?? {};
    l['d' + a[0]] = a[1];
    layouts.set(st.vao, l);
  });
  const draw = (a) => {
    c.draws++;
    const l = st.vao ? layouts.get(st.vao) : null;
    const lay = l ? Object.keys(l).sort().map((k) => k + '=' + String(l[k]).replace(/:\d+$/, '')).join(';') : '-';
    const key = [st.prog, a[0], lay, st.fb, st.en[3042] ?? 0, st.blend, st.en[2929] ?? 0, st.depth, st.depthFunc, st.en[2884] ?? 0, st.cull, st.front, st.mask, st.en[32823] ?? 0].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      c.newKeys.push(key);
    }
    const tkey = st.prog + '|t' + Object.keys(st.tex).sort().map((u) => u + ':' + st.tex[u]).join(',');
    if (!seen.has(tkey)) {
      seen.add(tkey);
      c.newKeys.push(tkey);
    }
  };
  wrap('drawElements', draw);
  wrap('drawArrays', draw);
  wrap('drawElementsInstanced', draw);
  wrap('drawArraysInstanced', draw);
  wrap('framebufferTexture2D', () => c.fb++);
  wrap('renderbufferStorage', () => c.fb++);
}

/** In-page: every frame's interval and renderer counters for `ms`. */
function record(ms) {
  return new Promise((done) => {
    const r = window.mooblox.stage.renderer;
    const frames = [];
    const t0 = performance.now();
    let last = t0;
    const tick = (t) => {
      const g = window.__gl;
      frames.push([+(t - last).toFixed(1), r.info.programs.length, r.info.memory.textures, r.info.memory.geometries, r.info.render.calls, Math.round(g.buf / 1024), g.tex, Math.round(g.texBytes / 1024), g.mip, g.link, g.draws, g.fb, g.newKeys.length, g.newKeys]);
      for (const k in g) g[k] = 0;
      g.newKeys = [];
      last = t;
      if (t - t0 < ms) requestAnimationFrame(tick);
      else done(frames);
    };
    requestAnimationFrame(tick);
  });
}

function stats(frames) {
  let t = 0;
  const gate = [];
  const first5 = [];
  const spikes = [];
  const keyed = [];
  for (const f of frames) {
    t += f[0];
    if (t <= 5000) first5.push(f[0]);
    if (t >= 1500 && t <= 6500) gate.push(f[0]);
    if (f[0] > 50) spikes.push([+(t / 1000).toFixed(2), ...f.slice(0, -1)]);
    if (f[12]) keyed.push([+(t / 1000).toFixed(2), f[0], f.at(-1)]);
  }
  return { n: frames.length, gateWorst: Math.max(...gate), first5Worst: Math.max(...first5), over50: spikes.length, fps: Math.round((gate.length * 1000) / 5000), spikes, keyed, frames2: frames.slice(0, 60).map((f) => f.slice(0, -1)) };
}

const rows = [];
const servers = [];
try {
  for (const root of roots) {
    const dist = mkdtempSync(join(tmpdir(), 'mooblox-stress-'));
    await build({ root, logLevel: 'error', build: { outDir: dist, emptyOutDir: true, rolldownOptions: { input: join(root, 'index.html') } } });
    const server = await preview({ root, logLevel: 'error', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
    servers.push({ root, server, dist });
  }
  for (let p = 0; p < pairs; p++) {
    const order = p % 2 ? [...servers].reverse() : servers;
    for (const { root, server } of order) for (const mode of p % 2 ? [...modes].reverse() : modes) {
      if (mode) {
        await browser.close();
        browser = await launch();
      }
      await new Promise((r) => setTimeout(r, cool));
      const url = server.resolvedUrls.local[0];
      const q = [shape === 'demo' ? '' : `shape=${shape}&course=${shape.length * 97 + 11}`, 'quality=low', 'walk=far', more].filter(Boolean).join('&');
      if (mode?.startsWith('warm') || args.includes('--warm')) {
        const w = await browser.newPage({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1, hasTouch: true });
        await w.goto(`${url}?${mode === 'warmov' ? q.replace('walk=far', 'scene=overview') : mode === 'warmidle' ? q.replace('walk=far', '') : q}`);
        await w.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 180000, polling: 50 });
        await w.waitForTimeout(3000);
        await w.close();
      }
      const page = await browser.newPage({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1, hasTouch: true });
      page.on('pageerror', (e) => console.error('pageerror:', e.message));
      const cdp = await page.context().newCDPSession(page);
      await page.addInitScript(instrument);
      await page.goto(`${url}?${q}`);
      await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 180000, polling: 50 });
      const readyAt = await page.evaluate(() => performance.now());
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      let perfProc = null;
      if (perfOut) {
        const pid = execSync("pgrep -n -f '[t]ype=gpu-process.*swiftshader'").toString().trim();
        perfProc = spawn('sudo', ['perf', 'record', '-q', '-k', 'CLOCK_MONOTONIC', ...(args.includes('--perf-all') ? ['-a', '-e', 'cpu-clock', '-F', '999'] : ['-g', '-F', '1999', '-p', pid]), '-o', `${perfOut}-${p + 1}-${servers.indexOf(servers.find((x) => x.root === root))}.data`, '--', 'sleep', '7.3'], { stdio: 'ignore' });
        perfProc = new Promise((r) => perfProc.on('exit', r));
      }
      const traceOut = opt('trace', null);
      if (traceOut) await browser.startTracing(page, { path: `${traceOut}-${p + 1}.json`, categories: ['gpu', 'gpu.angle', 'disabled-by-default-gpu.angle', 'gpu.service', 'gpu.decoder', 'disabled-by-default-gpu.decoder', 'viz', 'cc', 'blink', 'v8', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel'] });
      const frames = await page.evaluate(record, traceOut ? 2500 : 7000);
      if (traceOut) await browser.stopTracing();
      if (perfProc) await perfProc;
      const all = await page.evaluate(() => window.__all);
      const pre = all.filter((f) => f[0] < readyAt);
      const preSpikes = pre.filter((f) => f[1] > 50).map((f) => [+((f[0] - readyAt) / 1000).toFixed(2), f[1]]);
      const row = { mode, readyS: +(readyAt / 1000).toFixed(2), preFrames: pre.length, preSpikes, root: root.split('/').slice(-2).join('/'), pair: p + 1, load: +loadavg()[0].toFixed(2), ...stats(frames) };
      rows.push(row);
      console.log(JSON.stringify({ ...row, frames2: undefined, keyed: row.keyed.map((k) => [k[0], k[1], k[2].length]) }));
      await page.close();
    }
  }
} finally {
  await browser.close();
  for (const { server, dist } of servers) {
    await server.close();
    rmSync(dist, { recursive: true, force: true });
  }
}
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));

