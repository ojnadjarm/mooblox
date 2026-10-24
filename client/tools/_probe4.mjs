// scratch: draws/tris per scene group (full frame incl. shadow) on the GPU
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const b = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
await page.goto(`${url}?${process.argv[2]}`);
await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 120000 });
await page.waitForTimeout(3000);
console.log(await page.evaluate(() => {
  const v = window.mooblox;
  v.gate.pause();
  const r = v.stage.renderer;
  const frame = () => { r.info.reset(); r.shadowMap.needsUpdate = true; r.render(v.stage.scene, v.stage.camera); return [r.info.render.calls, r.info.render.triangles]; };
  const all = frame();
  const out = { all };
  const groups = {};
  v.stage.scene.traverse((o) => { if (o.isMesh || o.isPoints) { let p = o; while (p.parent && p.parent !== v.stage.scene && !['district','islands','props'].includes(p.parent.name)) p = p.parent; const k = (p.parent?.name ?? '') + '/' + (o.name || o.type); (groups[k] ??= []).push(o); } });
  for (const [k, os] of Object.entries(groups)) { const vis = os.map((o) => o.visible); os.forEach((o) => (o.visible = false)); const f = frame(); out[k] = [all[0] - f[0], all[1] - f[1], os.length]; os.forEach((o, i) => (o.visible = vis[i])); }
  return JSON.stringify(out).replaceAll('],"', '],\n"');
}));
await b.close(); await server.close();
