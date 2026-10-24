// Load probe: node tools/load-probe.mjs [out.json] [--shapes demo,8x12,20x30] [--tier low] [--runs 1]
// Builds the dev page, serves the build, then per shape opens it cold (cache off) and warm (same context, cache on) on Fast 4G
// and reports ms to first playable, bytes per request kind, long tasks before ready and the main-thread busy time.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { loadChromium } from './playwright.mjs';

const FAST_4G = { offline: false, latency: 165, downloadThroughput: (9e6 * 0.9) / 8, uploadThroughput: (1.5e6 * 0.9) / 8 };
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = args[0] && !args[0].startsWith('--') ? args[0] : null;
const shapes = opt('shapes', 'demo,8x12,20x30').split(',');
const tier = opt('tier', 'low');
const runs = Number(opt('runs', '1'));

const dist = mkdtempSync(join(tmpdir(), 'mooblox-load-'));
await build({ logLevel: 'error', build: { outDir: dist, emptyOutDir: true, rolldownOptions: { input: 'index.html' } } });
const server = await preview({ logLevel: 'error', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls.local[0];
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const query = (shape) => `${shape === 'demo' ? '' : `shape=${shape}&course=${shape.length * 97 + 11}&`}quality=${tier}`;

/** Records long tasks from navigation start; read back with `window.__load`. */
function observe() {
  const load = { long: [] };
  window.__load = load;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) load.long.push([Math.round(e.startTime), Math.round(e.duration)]);
  }).observe({ type: 'longtask', buffered: true });
}

const kind = (u) => (/\.js(\?|$)/.test(u) ? 'js' : /\.glb/.test(u) ? 'glb' : /\.(png|jpe?g|webp|ktx2)/.test(u) ? 'img' : /\.wasm/.test(u) ? 'wasm' : 'other');

async function visit(page, cdp, q, cold) {
  const reqs = new Map();
  const onResp = (e) => reqs.set(e.requestId, { url: e.response.url, cached: e.response.fromDiskCache || e.response.fromMemoryCache, status: e.response.status, enc: e.response.headers['content-encoding'] ?? e.response.headers['Content-Encoding'] ?? '' });
  const onDone = (e) => reqs.has(e.requestId) && (reqs.get(e.requestId).bytes = e.encodedDataLength);
  cdp.on('Network.responseReceived', onResp);
  cdp.on('Network.loadingFinished', onDone);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: cold });
  const t0 = Date.now();
  await page.goto(`${url}?${q}`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 180000, polling: 50 });
  const ms = Date.now() - t0;
  const inPage = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource').map((r) => [r.name.replace(location.origin, ''), Math.round(r.startTime), Math.round(r.responseEnd)]);
    return { long: window.__load.long, res, now: Math.round(performance.now()) };
  });
  cdp.off('Network.responseReceived', onResp);
  cdp.off('Network.loadingFinished', onDone);
  const byKind = {};
  for (const r of reqs.values()) {
    const k = kind(r.url);
    byKind[k] = (byKind[k] ?? 0) + (r.bytes ?? 0);
  }
  const before = inPage.long.filter(([s]) => s < inPage.now);
  return {
    ms,
    kb: Math.round([...reqs.values()].reduce((a, r) => a + (r.bytes ?? 0), 0) / 1024),
    kbByKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, Math.round(v / 1024)])),
    requests: reqs.size,
    cachedRequests: [...reqs.values()].filter((r) => r.cached || r.status === 304).length,
    longTaskMs: before.reduce((a, [, d]) => a + d, 0),
    longest: before.reduce((a, [, d]) => Math.max(a, d), 0),
    lastResponseMs: Math.max(0, ...inPage.res.map((r) => r[2])),
    top: [...reqs.values()].sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0)).slice(0, 6).map((r) => `${r.url.replace(url, '/')} ${Math.round((r.bytes ?? 0) / 1024)}k${r.enc ? ` ${r.enc}` : ''}`),
  };
}

const rows = [];
try {
  for (const shape of shapes) {
    for (let i = 0; i < runs; i++) {
      const context = await browser.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1, hasTouch: true });
      await context.addInitScript(observe);
      const page = await context.newPage();
      page.on('pageerror', (e) => console.error('pageerror:', e.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', FAST_4G);
      const cold = await visit(page, cdp, query(shape), true);
      const warm = await visit(page, cdp, query(shape), false);
      const row = { shape, tier, run: i, cold, warm };
      rows.push(row);
      console.log(JSON.stringify(row));
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
  rmSync(dist, { recursive: true, force: true });
}
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
