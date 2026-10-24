// scratch: triangles per dressing model id (base vs detail) for a shape
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const b = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu'] });
const page = await b.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`${url}?${process.argv[2]}&scene=overview`);
await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 120000 });
console.log(await page.evaluate(async () => {
  const { ModelLibrary } = await import('/src/world/model-library.ts');
  const { modelIds } = await import('/src/world/dressing.ts');
  const lib = await ModelLibrary.load('/assets/', modelIds());
  const d = window.mooblox.dressing;
  const per = {};
  let terrain = [0, 0];
  for (const dist of d.districts) {
    for (const t of dist.terrain) terrain[t.detail ? 1 : 0] += t.geometry.attributes.position.count / 3;
    for (const p of dist.placements) {
      const tris = lib.get(p.id).geometry.attributes.position.count / 3;
      const k = p.id + (p.minor ? ' minor' : p.detail ? ' detail' : ' base');
      per[k] = (per[k] ?? 0) + tris;
    }
  }
  const top = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 18);
  return JSON.stringify({ districts: d.districts.length, terrain, top }).replaceAll('],[', '],\n[');
}));
await b.close(); await server.close();
