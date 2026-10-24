// Collision e2e: node tools/bump.mjs [shape] -> walks the player 2.5 s into fountains, houses, stalls, tents; exit 0 when it never gets inside a footprint
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const shape = process.argv[2] ?? '8x12';
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
let ok = false;
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`${server.resolvedUrls.local[0]}?shape=${shape}&course=811&quality=low&nokids`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready && window.mooblox.player, null, { timeout: 120000 });
  const targets = await page.evaluate(() => {
    const v = window.mooblox;
    const solids = v.dressing.districts.flatMap((d) => d.placements).filter((p) => p.solid && p.y < 1 && /fountain|building-type|stall-red|stall-green|tent/.test(p.id));
    return solids.slice(0, 8).map((p) => ({ id: p.id, x: p.x, z: p.z, r: v.dressing.obstacles.find((o) => Math.hypot(o.x - p.x, o.z - p.z) < 0.01)?.r ?? 1 }));
  });
  const results = [];
  for (const t of targets) {
    const r = t.r;
    const start = await page.evaluate(({ t, r }) => {
      const p = window.mooblox.player;
      const isl = [...window.mooblox.layout.hubs, ...window.mooblox.layout.zones].find((c) => Math.hypot(c.x - t.x, c.z - t.z) < c.radius);
      const a = Math.atan2(isl.z - t.z, isl.x - t.x);
      const sx = t.x + Math.cos(a) * (r + 2.5);
      const sz = t.z + Math.sin(a) * (r + 2.5);
      p.teleport(sx, sz, Math.atan2(t.x - sx, t.z - sz));
      return { sx, sz, a };
    }, { t, r });
    await page.waitForTimeout(300);
    await page.keyboard.down('w');
    const trace = [];
    for (let k = 0; k < 10; k++) {
      await page.waitForTimeout(250);
      trace.push(await page.evaluate(() => { const b = window.mooblox.player.body.position; return `${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}`; }));
    }
    await page.keyboard.up('w');
    if (process.env.TRACE) console.log(t.x.toFixed(1), t.z.toFixed(1), trace.join(' '));
    const end = await page.evaluate(() => ({ x: window.mooblox.player.body.position.x, z: window.mooblox.player.body.position.z }));
    const d = Math.hypot(end.x - t.x, end.z - t.z);
    const through = d < r * (/fountain/.test(t.id) ? 0.85 : 0.5);
    results.push(through);
    console.log(`${through ? 'FAIL' : 'PASS'} ${t.id} kept ${d.toFixed(2)} m from its centre (footprint ${r.toFixed(2)}, walked from ${(r + 2.5).toFixed(1)} m)`);
  }
  ok = results.length > 0 && results.every((x) => !x);
} finally {
  await browser.close();
  await server.close();
}
process.exit(ok ? 0 : 1);
