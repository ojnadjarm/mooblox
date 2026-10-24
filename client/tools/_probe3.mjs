// scratch: synced render cost (ms) on SwiftShader per configuration
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const b = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1 });
await page.goto(`${url}?quality=low&${process.argv[2] ?? ''}`);
await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 120000 });
console.log(await page.evaluate(async () => {
  const v = window.mooblox;
  v.gate.pause();
  const r = v.stage.renderer;
  const gl = r.getContext();
  const px = new Uint8Array(4);
  const cost = (n = 20) => { const ts = []; for (let i = 0; i < n; i++) { const t = performance.now(); r.render(v.stage.scene, v.stage.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t); } ts.sort((a, b) => a - b); return +ts[n >> 1].toFixed(1); };
  const out = {};
  for (const dpr of [1, 0.5]) { r.setPixelRatio(dpr); r.setSize(400, 800); cost(3); out['dpr' + dpr] = cost(); }
  r.setPixelRatio(1); r.setSize(400, 800);
  const groups = {};
  v.stage.scene.traverse((o) => { if (o.isMesh || o.isPoints) { const k = (o.name || o.type) + ':' + o.material?.type; (groups[k] ??= []).push(o); } });
  for (const [k, os] of Object.entries(groups)) { const vis = os.map((o) => o.visible); os.forEach((o) => (o.visible = false)); out['-' + k] = cost(); os.forEach((o, i) => (o.visible = vis[i])); }
  out.tris = r.info.render.triangles; out.calls = r.info.render.calls;
  return JSON.stringify(out);
}));
await b.close(); await server.close();
