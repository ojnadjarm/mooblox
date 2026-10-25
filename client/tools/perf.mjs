// Perf gate + stills: node tools/perf.mjs [outdir] [--shapes demo,1x2,8x12,20x30] [--tiers low,medium] [--gate] [--stills] [--load]
// Builds the dev page, serves the build, then per shape x tier walks the player to the farthest plot and reads frame times,
// draw calls, triangles, programs, JS heap and a GPU memory estimate. Low runs on the real GPU at DPR 1, 400x800 under 4x CPU
// throttle (the realistic low-end proxy: no frame > 20 ms over the walk and its bridge crossing), then again on SwiftShader under
// 6x as a stress floor (30 fps on the first run, median worst frame of 3 runs <= 100 ms), after one cold first visit of the demo route on that browser (reported, not gated:
// a fresh SwiftShader GPU process stalls once, T1373 R11); memory = heap + GPU estimate <= 800 MB per page;
// the others on the real GPU (ANGLE Vulkan) at 1366x768. Reasoning: ~/agent-work/research/2026-10-24/T1366/PROFILE.md. --load adds first-playable time and bytes on Fast 4G,
// --browser gpu|soft and --throttle N override the rig (diagnosis), --query k=v appends to every page query (e.g. far=fog), --stills the overview and play stills at 1366 and 400, --gate asserts BUDGETS (exit 1 on any miss).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { loadChromium } from './playwright.mjs';

// Low programs 11: the impostor card (the default far view since T1369) is the one program the silhouettes did not need.
const BUDGETS = {
  low: { fps: 58, calls: 40, tris: 80000, programs: 11, shadow: 1024, post: false },
  medium: { fps: 58, calls: 60, tris: 200000, programs: 30, shadow: 1024, post: false },
};
/** Memory = JS heap + GPU estimate per page (owner, T1369: 800 MB, hard ceiling 1 GB; spend it on smoothness). */
const ALL = { loadMb: 3, loadS: 3, memoryMb: 800, frameMs: 50, bigCourse: 1.5 };
/** The realistic low-end proxy (Iris Xe DPR 1, 4x CPU) walks over a bridge without a dropped frame. */
const LOW_FRAME_MS = 20;
/** Software GL (SwiftShader) under 6x CPU, a floor; each page waits `coolMs` idle first (back-to-back runs hit the host's power limit: 200 ms stalls); worst frame gates on the median of `runs` (one random 83-200 ms SwiftShader frame per run, T1373 R13). */
const STRESS = { fps: 30, frameMs: 100, coolMs: 45000, runs: 3 };
const FAST_4G = { offline: false, latency: 165, downloadThroughput: (9e6 * 0.9) / 8, uploadThroughput: (1.5e6 * 0.9) / 8 };

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1].split(',') : fallback;
};
const out = args[0] && !args[0].startsWith('--') ? args[0] : null;
const shapes = opt('shapes', ['demo', '1x2', '8x12', '20x30']);
const tiers = opt('tiers', ['low', 'medium']);
const gate = flag('gate');
if (out) mkdirSync(out, { recursive: true });

const dist = mkdtempSync(join(tmpdir(), 'mooblox-perf-'));
await build({ logLevel: 'error', build: { outDir: dist, emptyOutDir: true, rolldownOptions: { input: 'index.html' } } });
const server = await preview({ logLevel: 'error', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const common = ['--mute-audio', '--enable-precise-memory-info'];
const browsers = {
  gpu: await chromium.launch({ headless: true, args: [...common, '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] }),
  soft: await chromium.launch({ headless: true, args: [...common, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }),
};
const RIG = {
  low: { browser: 'gpu', w: 400, h: 800, throttle: 4, touch: true },
  medium: { browser: 'gpu', w: 1366, h: 768, throttle: 1, touch: false },
  high: { browser: 'gpu', w: 1366, h: 768, throttle: 1, touch: false },
  xhigh: { browser: 'gpu', w: 1366, h: 768, throttle: 1, touch: false },
};

const more = opt('query', [''])[0];
const query = (shape, tier, extra) => `${shape === 'demo' ? '' : `shape=${shape}&course=${shape.length * 97 + 11}&`}quality=${tier}&${extra}${more ? `&${more}` : ''}`;

async function open(rig, q, network) {
  const page = await browsers[rig.browser].newPage({ viewport: { width: rig.w, height: rig.h }, deviceScaleFactor: 1, hasTouch: rig.touch });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text().slice(0, 300)));
  const cdp = await page.context().newCDPSession(page);
  let bytes = 0;
  if (network) {
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', FAST_4G);
    cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength));
  }
  const t0 = Date.now();
  await page.goto(`${url}?${q}`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 180000, polling: 50 });
  const loadS = (Date.now() - t0) / 1000;
  if (rig.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: rig.throttle });
  return { page, cdp, loadS, bytes: () => bytes };
}

/** In-page: frame times over `ms`, renderer counts of the last frame, heap and a GPU memory estimate. */
function sample(ms) {
  return new Promise((resolve) => {
    const v = window.mooblox;
    const r = v.stage.renderer;
    const deltas = [];
    let last = null;
    const t0 = performance.now();
    const tick = (t) => {
      if (last !== null) deltas.push(t - last);
      last = t;
      if (t - t0 < ms) return requestAnimationFrame(tick);
      const sorted = [...deltas].sort((a, b) => a - b);
      const geos = new Set();
      const textures = new Set();
      v.stage.scene.traverse((o) => {
        if (o.geometry) geos.add(o.geometry);
        for (const m of [o.material].flat()) {
          if (!m) continue;
          for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) if (m[k]) textures.add(m[k]);
        }
      });
      let geoBytes = 0;
      for (const g of geos) {
        for (const a of Object.values(g.attributes)) geoBytes += a.array?.byteLength ?? a.count * a.itemSize * 4;
        if (g.index) geoBytes += g.index.array.byteLength;
      }
      let texBytes = 0;
      for (const t of textures) {
        const img = t.image;
        if (img?.width) texBytes += img.width * img.height * 4 * 1.33;
      }
      const w = r.domElement.width;
      const h = r.domElement.height;
      const samples = r.getContext().getContextAttributes().antialias ? 4 : 1;
      const post = !!v.stage.post;
      const fbBytes = w * h * 8 * samples + (post ? w * h * 8 * 5 + w * h * 8 * 0.7 : 0);
      const shadow = v.stage.sun.castShadow ? v.stage.sun.shadow.mapSize.x : 0;
      const shadowBytes = shadow * shadow * 4;
      resolve({
        fps: Math.round((deltas.length * 1000) / (performance.now() - t0)),
        p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
        maxFrame: +sorted[sorted.length - 1].toFixed(1),
        calls: r.info.render.calls,
        tris: r.info.render.triangles,
        programs: r.info.programs.length,
        heapMb: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
        gpuMb: +((geoBytes + texBytes + fbBytes + shadowBytes) / 1048576).toFixed(1),
        shadow,
        post,
        dpr: r.getPixelRatio(),
        tier: v.quality.tier,
        extent: Math.round(v.layout.extent),
      });
    };
    requestAnimationFrame(tick);
  });
}

const results = [];
const fails = [];
let cold = null;
const check = (ok, line) => {
  if (!ok) fails.push(line);
  if (gate) console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
};

try {
  for (const shape of shapes) {
    for (const tier of tiers) {
      const rig = { ...RIG[tier], ...(opt('browser') ? { browser: opt('browser')[0] } : {}), ...(opt('throttle') ? { throttle: Number(opt('throttle')[0]) } : {}) };
      const { page } = await open(rig, query(shape, tier, 'walk=far'));
      await page.waitForTimeout(1500);
      const m = await page.evaluate(sample, 5000);
      await page.close();
      const row = { shape, tier, w: rig.w, h: rig.h, gpu: rig.browser, throttle: rig.throttle, ...m };
      if (flag('load')) {
        const l = await open({ ...RIG[tier], browser: 'gpu', throttle: 1 }, query(shape, tier, ''), true);
        Object.assign(row, { loadS: +l.loadS.toFixed(2), loadMb: +(l.bytes() / 1048576).toFixed(2) });
        await l.page.close();
      }
      results.push(row);
      console.log(JSON.stringify(row));
      if (tier === 'low' && !flag('no-stress')) {
        const stress = { ...rig, browser: 'soft', throttle: 6 };
        await new Promise((r) => setTimeout(r, STRESS.coolMs));
        if (!cold) {
          const c = await open(stress, query('demo', tier, 'walk=far'));
          cold = await c.page.evaluate(sample, 5000);
          await c.page.close();
          results.push({ shape: 'demo', tier, rig: 'cold', w: stress.w, h: stress.h, gpu: 'soft', throttle: 6, ...cold });
          console.log(`cold first-visit worst (demo low stress, first 5 s, not gated): ${cold.maxFrame} ms, fps ${cold.fps}`);
          await new Promise((r) => setTimeout(r, STRESS.coolMs));
        }
        const worsts = [];
        let sm;
        for (let run = 0; run < STRESS.runs; run++) {
          if (run) await new Promise((r) => setTimeout(r, STRESS.coolMs));
          const st = await open(stress, query(shape, tier, 'walk=far'));
          await st.page.waitForTimeout(1500);
          const s = await st.page.evaluate(sample, 5000);
          await st.page.close();
          sm ??= s;
          worsts.push(s.maxFrame);
        }
        const median = [...worsts].sort((a, b) => a - b)[worsts.length >> 1];
        const srow = { shape, tier, rig: 'stress', w: stress.w, h: stress.h, gpu: 'soft', throttle: 6, ...sm, worsts, worstMedian: median };
        results.push(srow);
        console.log(JSON.stringify(srow));
        const sid = `${shape} low stress 400x800 6x cpu soft`;
        check(sm.fps >= STRESS.fps, `${sid}: fps ${sm.fps} >= ${STRESS.fps}`);
        check(median <= STRESS.frameMs, `${sid}: worst frame median ${median} ms (runs ${worsts.join(' / ')}) <= ${STRESS.frameMs}`);
      }
      const b = BUDGETS[tier];
      const id = `${shape} ${tier} ${rig.w}x${rig.h}${rig.throttle > 1 ? ` ${rig.throttle}x cpu` : ''} ${rig.browser}`;
      if (b) {
        check(m.fps >= b.fps, `${id}: fps ${m.fps} >= ${b.fps}`);
        check(m.calls <= b.calls, `${id}: draws ${m.calls} <= ${b.calls}`);
        check(m.tris <= b.tris, `${id}: tris ${m.tris} <= ${b.tris}`);
        check(m.programs <= b.programs, `${id}: programs ${m.programs} <= ${b.programs}`);
        check(m.shadow <= b.shadow, `${id}: shadow map ${m.shadow} <= ${b.shadow}`);
        check(b.post || !m.post, `${id}: post ${m.post} allowed ${b.post}`);
      }
      const frameMs = tier === 'low' ? LOW_FRAME_MS : ALL.frameMs;
      check(m.maxFrame <= frameMs, `${id}: worst frame ${m.maxFrame} ms <= ${frameMs}`);
      const memory = +(m.heapMb + m.gpuMb).toFixed(1);
      check(memory <= ALL.memoryMb, `${id}: memory heap ${m.heapMb} + gpu ${m.gpuMb} = ${memory} MB <= ${ALL.memoryMb}`);
      if (row.loadS !== undefined) {
        check(row.loadS <= ALL.loadS, `${id}: first playable ${row.loadS} s <= ${ALL.loadS} on Fast 4G`);
        check(row.loadMb <= ALL.loadMb, `${id}: transferred ${row.loadMb} MB <= ${ALL.loadMb}`);
      }
      if (flag('stills') && out) {
        for (const [w, h] of [[1366, 768], [400, 800]]) {
          for (const view of ['overview', 'play']) {
            const s = await open({ ...rig, browser: 'gpu', throttle: 1, w, h, touch: w < 800 }, query(shape, tier, view === 'overview' ? 'scene=overview' : ''));
            await s.page.waitForFunction(() => window.mooblox.streaming.pending === 0, null, { timeout: 60000, polling: 100 });
            await s.page.waitForTimeout(1200);
            await s.page.screenshot({ path: join(out, `${shape}-${tier}-${view}-${w}.png`) });
            await s.page.close();
          }
        }
      }
    }
  }
  for (const tier of tiers) {
    const demo = results.find((r) => r.shape === 'demo' && r.tier === tier && !r.rig);
    const big = results.find((r) => r.shape === '20x30' && r.tier === tier && !r.rig);
    if (demo && big) {
      check(big.calls <= demo.calls * ALL.bigCourse, `20x30 ${tier}: draws ${big.calls} <= 1.5 x demo ${demo.calls}`);
      check(big.tris <= demo.tris * ALL.bigCourse, `20x30 ${tier}: tris ${big.tris} <= 1.5 x demo ${demo.tris}`);
    }
  }
} finally {
  await Promise.all(Object.values(browsers).map((b) => b.close()));
  await new Promise((res) => server.httpServer.close(res));
  rmSync(dist, { recursive: true, force: true });
}
if (out) {
  const file = join(out, 'numbers.json');
  const key = (r) => `${r.shape} ${r.tier}${r.rig ? ` ${r.rig}` : ''}`;
  const fresh = new Set(results.map(key));
  const kept = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).filter((r) => r.shape && !fresh.has(key(r)) && r.view === undefined) : [];
  writeFileSync(file, `${JSON.stringify([...kept, ...results], null, 1)}\n`);
}
if (gate) console.log(`${fails.length ? `perf gate: ${fails.length} over budget` : 'perf gate: all budgets met'}${cold ? `; cold first-visit worst ${cold.maxFrame} ms (not gated)` : ''}`);
process.exit(gate && fails.length ? 1 : 0);
