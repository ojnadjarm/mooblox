// Frame times of one autopilot walk over the bridges: node tools/crossing.mjs <out.json> [--shapes demo,8x12] [--rigs low,stress,medium,high] [--query k=v] [--walk far|tour|bridge|<cmid>] [--profile dir]
// Per shape x rig (the perf gate's rigs: low = Iris Xe 400x800 4x CPU, stress = SwiftShader 6x, medium/high = Iris Xe 1366) the
// player walks from the spawn to the farthest plot (demo, 1x2) or on a tour over 5-6 bridges (bigger shapes, `?walk=tour`: two
// near districts and back, then the farthest within ~150 m; `bridge` = the plot just across the spawn hub's straightest bridge); every frame's time, island and time in pump/render/resize/player/collider/whole frame/off-screen renders are kept. A crossing window is 2 s either side of
// each island change. Writes { rows: [{ shape, rig, frames: [[t, dt, island, pump, render, resize, player, solids, frame, offscreen, links, bufMb, tex, calls, geometries, textures, captures, pipes]], crossings: [t], worst, crossingWorst }] }.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build, preview } from 'vite';
import { loadChromium } from './playwright.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith('--')) {
  console.error('usage: node tools/crossing.mjs <out.json> [--shapes ..] [--rigs ..] [--query k=v] [--profile dir]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const shapes = opt('shapes', 'demo,1x2,8x12,20x30').split(',');
const rigs = opt('rigs', 'low,stress,medium,high').split(',');
const more = opt('query', '');
const profile = opt('profile', null);
const WINDOW_MS = 2000;
const MAX_WALK_MS = 70000;
const RIG = {
  low: { tier: 'low', browser: 'gpu', w: 400, h: 800, throttle: 4, touch: true },
  stress: { tier: 'low', browser: 'soft', w: 400, h: 800, throttle: 6, touch: true },
  medium: { tier: 'medium', browser: 'gpu', w: 1366, h: 768, throttle: 1, touch: false },
  high: { tier: 'high', browser: 'gpu', w: 1366, h: 768, throttle: 1, touch: false },
};
const query = (shape, tier, walk = 'far') => `${shape === 'demo' ? '' : `shape=${shape}&course=${shape.length * 97 + 11}&`}quality=${tier}&walk=${walk}${more ? `&${more}` : ''}`;

/** The plot just across the spawn hub's straightest bridge: the autopilot's beeline from the spawn then runs along the deck. */
async function bridgePlot(browser, shape, tier) {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await page.goto(`${url}?${query(shape, tier, '0')}`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 180000, polling: 50 });
  const id = await page.evaluate(() => {
    const v = window.mooblox;
    const hub = v.layout.hubs[0];
    let best = null;
    for (const z of v.layout.zones) {
      if (z.anchor !== hub) continue;
      const dx = z.x - hub.x;
      const dz = z.z - hub.z;
      const l = Math.hypot(dx, dz);
      for (const p of z.plots) {
        const along = ((p.x - hub.x) * dx + (p.z - hub.z) * dz) / l;
        const off = Math.abs((p.x - hub.x) * dz - (p.z - hub.z) * dx) / l;
        const score = off * 4 + along;
        if (!best || score < best.score) best = { id: p.activityId, score };
      }
    }
    return best?.id ?? 0;
  });
  await page.close();
  return id;
}

const dist = mkdtempSync(join(tmpdir(), 'mooblox-cross-'));
await build({ logLevel: 'error', build: { outDir: dist, emptyOutDir: true, rolldownOptions: { input: 'index.html' } } });
const server = await preview({ logLevel: 'error', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const common = ['--mute-audio', '--enable-precise-memory-info'];
const browsers = {
  gpu: await chromium.launch({ headless: true, args: [...common, '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] }),
  soft: await chromium.launch({ headless: true, args: [...common, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }),
};
const rows = [];
try {
  for (const shape of shapes) {
    for (const name of rigs) {
      const rig = RIG[name];
      // SwiftShader after back-to-back runs hits the host's power limit (200 ms stalls): the stress rig starts after 45 s idle, as in the perf gate.
      if (rig.browser === 'soft') await new Promise((r) => setTimeout(r, 45000));
      const page = await browsers[rig.browser].newPage({ viewport: { width: rig.w, height: rig.h }, deviceScaleFactor: 1, hasTouch: rig.touch });
      page.on('pageerror', (e) => console.error('pageerror:', e.message));
      const cdp = await page.context().newCDPSession(page);
      const asked = opt('walk', null) ?? (shape === 'demo' || shape === '1x2' ? 'far' : 'tour');
      const walk = asked === 'bridge' ? await bridgePlot(browsers.gpu, shape, rig.tier) : asked;
      await page.goto(`${url}?${query(shape, rig.tier, walk)}`);
      await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 180000, polling: 50 });
      if (rig.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: rig.throttle });
      if (profile) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
        await cdp.send('Profiler.start');
      }
      const { out: frames, tasks, reached } = await page.evaluate(
        (max) =>
          new Promise((resolve) => {
            const v = window.mooblox;
            // Per-frame time inside the main suspects (ms): streaming pump, render, resize, player step, collider swap, whole frame, off-screen renders.
            const spent = { pump: 0, render: 0, resize: 0, player: 0, solids: 0, frame: 0, offscreen: 0 };
            const wrap = (obj, name, key) => {
              const f = obj[name].bind(obj);
              obj[name] = (...a) => {
                const t = performance.now();
                const r = f(...a);
                spent[key] += performance.now() - t;
                return r;
              };
            };
            wrap(v.streaming, 'pump', 'pump');
            wrap(v.stage, 'render', 'render');
            wrap(v.stage, 'resize', 'resize');
            wrap(v.player, 'update', 'player');
            wrap(v.collider, 'set', 'solids');
            wrap(v.gate, 'frame', 'frame');
            // Off-screen renders: impostor captures and GPU pre-uploads.
            const r = v.stage.renderer;
            const draw = r.render.bind(r);
            r.render = (...a) => {
              const target = r.getRenderTarget();
              if (!target) return draw(...a);
              const t = performance.now();
              draw(...a);
              spent.offscreen += performance.now() - t;
              // The impostor atlas (2048x1024): its captures, one column on their own.
              if (target.width === 2048 && target.height === 1024) gpu.captures++;
            };
            // GPU work queued per frame: program links, buffer bytes (MB), texture uploads.
            const gl = v.stage.renderer.getContext();
            const gpu = { links: 0, bufMb: 0, tex: 0, captures: 0, pipes: 0 };
            // First draws of a (program, vertex layout, target, blend/depth/side) state: a software GL compiles a pipeline for each.
            const seen = new Set();
            const direct = r.renderBufferDirect.bind(r);
            r.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
              const t = r.getRenderTarget();
              const layout = Object.entries(geometry.attributes).map(([k, a]) => `${k}${a.itemSize}${a.normalized ? 'n' : ''}${a.array?.constructor.name ?? ''}`).sort().join();
              const key = `${material.type}${material.customProgramCacheKey?.() ?? ''}${material.defines ? JSON.stringify(material.defines) : ''}|${layout}|${object.isInstancedMesh ? 'i' : ''}${object.isSkinnedMesh ? 's' : ''}|${t ? `${t.width}x${t.height}${t.samples}` : 'screen'}|${material.blending}${material.transparent}${material.depthWrite}${material.depthTest}${material.side}${material.colorWrite}`;
              if (!seen.has(key)) {
                seen.add(key);
                gpu.pipes++;
              }
              return direct(camera, scene, geometry, material, object, group);
            };
            const count = (name, f) => {
              const orig = gl[name].bind(gl);
              gl[name] = (...a) => {
                f(a);
                return orig(...a);
              };
            };
            count('linkProgram', () => gpu.links++);
            count('bufferData', (a) => (gpu.bufMb += (a[1]?.byteLength ?? (typeof a[1] === 'number' ? a[1] : 0)) / 1048576));
            count('bufferSubData', (a) => (gpu.bufMb += (a[2]?.byteLength ?? 0) / 1048576));
            for (const n of ['texImage2D', 'texSubImage2D', 'texStorage2D', 'texImage3D']) count(n, () => gpu.tex++);
            const tasks = [];
            new PerformanceObserver((l) => {
              for (const e of l.getEntries()) tasks.push([+(e.startTime - t0).toFixed(1), +e.duration.toFixed(1)]);
            }).observe({ type: 'longtask' });
            const circles = [...v.layout.hubs, ...v.layout.zones];
            let island = 0;
            const out = [];
            let last = null;
            const t0 = performance.now();
            const tick = (t) => {
              const p = v.player.body.position;
              const on = circles.findIndex((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.radius);
              if (on >= 0) island = on;
              if (last !== null) out.push([+(t - t0).toFixed(1), +(t - last).toFixed(1), island, ...Object.values(spent).map((x) => +x.toFixed(1)), gpu.links, +gpu.bufMb.toFixed(2), gpu.tex, v.stage.renderer.info.render.calls, v.stage.renderer.info.memory.geometries, v.stage.renderer.info.memory.textures, gpu.captures, gpu.pipes]);
              for (const k in spent) spent[k] = 0;
              gpu.links = gpu.bufMb = gpu.tex = gpu.captures = gpu.pipes = 0;
              last = t;
              if (v.probe.reached || t - t0 > max) return resolve({ out, tasks, reached: v.probe.reached === true });
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        MAX_WALK_MS,
      );
      if (profile) {
        const { profile: p } = await cdp.send('Profiler.stop');
        mkdirSync(profile, { recursive: true });
        writeFileSync(join(profile, `${shape}-${name}.cpuprofile`), JSON.stringify(p));
      }
      await page.close();
      const crossings = [];
      for (let i = 1; i < frames.length; i++) if (frames[i][2] !== frames[i - 1][2]) crossings.push(frames[i][0]);
      const near = (t) => crossings.some((c) => Math.abs(c - t) <= WINDOW_MS);
      const worst = Math.max(...frames.map((f) => f[1]));
      const inWindow = frames.filter((f) => near(f[0]));
      const crossingWorst = inWindow.length ? Math.max(...inWindow.map((f) => f[1])) : null;
      const over = (ms) => frames.filter((f) => f[1] > ms).length;
      const row = { shape, rig: name, tier: rig.tier, walk, reached, frames, tasks, crossings, worst, crossingWorst, over20: over(20), over50: over(50), seconds: frames.length ? frames.at(-1)[0] / 1000 : 0 };
      rows.push(row);
      console.log(JSON.stringify({ ...row, frames: frames.length }));
    }
  }
} finally {
  await Promise.all(Object.values(browsers).map((b) => b.close()));
  await new Promise((res) => server.httpServer.close(res));
  rmSync(dist, { recursive: true, force: true });
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ query: more, rows })}\n`);
