// Course-shape perf + stills: node tools/perf.mjs <outdir> [shapes] [tiers]
// shapes: comma list of demo|1x2|8x12|20x30|<counts>; tiers: high,low. Per shape x tier: overview and play view at 1366x768
// (frame draw calls and triangles with shadows and post, main-pass triangles, programs, fps), stills at 1366 and 400 (overview).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const out = process.argv[2];
const shapes = (process.argv[3] ?? 'demo,1x2,8x12,20x30').split(',');
const tiers = (process.argv[4] ?? 'high,low').split(',');
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function measure(query, w, h, shot) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 800 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text().slice(0, 300)));
  const t0 = Date.now();
  await page.goto(`${url}?${query}`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 120000 });
  const loadS = (Date.now() - t0) / 1000;
  await page.waitForTimeout(1500);
  const m = await page.evaluate(async () => {
    const v = window.mooblox;
    const r = v.stage.renderer;
    const f0 = v.gate.frames;
    const t = performance.now();
    await new Promise((res) => setTimeout(res, 3000));
    const fps = ((v.gate.frames - f0) * 1000) / (performance.now() - t);
    const frame = { calls: r.info.render.calls, tris: r.info.render.triangles };
    const auto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.info.reset();
    r.render(v.stage.scene, v.stage.camera);
    const main = { calls: r.info.render.calls, tris: r.info.render.triangles };
    r.shadowMap.autoUpdate = auto;
    const groups = {};
    for (const child of v.stage.scene.children) {
      let n = 0;
      child.traverseVisible((o) => {
        if (o.isMesh || o.isPoints) n++;
      });
      if (n) groups[child.name || child.type] = (groups[child.name || child.type] ?? 0) + n;
    }
    return { fps: Math.round(fps), frameCalls: frame.calls, frameTris: frame.tris, mainCalls: main.calls, mainTris: main.tris, programs: r.info.programs.length, extent: Math.round(v.layout.extent), hubs: v.layout.hubs.length, groups };
  });
  if (shot) await page.screenshot({ path: shot });
  await page.close();
  return { ...m, loadS };
}

const results = [];
try {
  for (const shape of shapes) {
    const sq = shape === 'demo' ? '' : `shape=${shape}&course=${shape.length * 97 + 11}&`;
    for (const tier of tiers) {
      for (const view of ['overview', 'play']) {
        const scene = view === 'overview' ? 'scene=overview&' : '';
        const shot = join(out, `${shape}-${tier}-${view}-1366.png`);
        const m = await measure(`${sq}${scene}quality=${tier}`, 1366, 768, shot);
        results.push({ shape, tier, view, ...m });
        console.log(shape, tier, view, JSON.stringify(m));
      }
      if (tier === 'high') {
        await measure(`${sq}scene=overview&quality=${tier}`, 400, 860, join(out, `${shape}-${tier}-overview-400.png`));
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(join(out, 'numbers.json'), `${JSON.stringify(results, null, 1)}\n`);
