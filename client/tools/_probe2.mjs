import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const b = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...process.argv.slice(2)] });
const page = await b.newPage({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1 });
await page.goto(`${url}?quality=low`);
await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 120000 });
console.log(await page.evaluate(async () => {
  const v = window.mooblox;
  v.quality.dynamic.sample = () => false;
  const fps = async () => { const f = v.gate.frames, t = performance.now(); await new Promise((r) => setTimeout(r, 2500)); return Math.round((v.gate.frames - f) * 1000 / (performance.now() - t)); };
  const out = {};
  const r = v.stage.renderer;
  for (const dpr of [1, 0.5]) { r.setPixelRatio(dpr); r.setSize(400, 800); out['dpr' + dpr] = await fps(); }
  r.setPixelRatio(1); r.setSize(400, 800);
  const vis = [];
  v.stage.scene.traverse((o) => { if (o !== v.stage.scene) { vis.push([o, o.visible]); } });
  v.stage.scene.children.forEach((c) => (c.visible = false));
  out.empty = await fps();
  const groups = {};
  v.stage.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isInstancedMesh) { const k = (o.name || o.type) + ':' + o.material?.type; (groups[k] ??= []).push(o); } });
  for (const c of v.stage.scene.children) c.visible = true;
  const all = Object.values(groups).flat();
  all.forEach((o) => (o.userData.v = o.visible, o.visible = false));
  for (const [k, os] of [...Object.entries(groups), ...Object.entries(groups).filter(([k]) => /water|clouds|land/.test(k)).reverse()]) { os.forEach((o) => (o.visible = o.userData.v)); out[k] = [...(out[k] ?? []), await fps()]; os.forEach((o) => (o.visible = false)); }
  const g = r.getContext();
  out.renderer = g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
  out.cores = navigator.hardwareConcurrency;
  return JSON.stringify(out);
}));
await b.close(); await server.close();
