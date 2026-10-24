// Scripted walk e2e: node tools/walk.mjs <cmid> [outdir]  -> exit 0 when the player stands on the activity's plot
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const cmid = Number(process.argv[2] ?? 0);
const out = process.argv[3];
if (!cmid) {
  console.error('usage: node tools/walk.mjs <cmid> [outdir]');
  process.exit(2);
}
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
let ok = false;
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  await page.goto(`${server.resolvedUrls.local[0]}?walk=${cmid}`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
  await page.waitForFunction(() => window.mooblox.probe.reached, null, { timeout: 60000 }).catch(() => {});
  const probe = await page.evaluate(() => window.mooblox.probe);
  const p = probe.position;
  const t = probe.target;
  const dist = Math.hypot(p.x - t.x, p.z - t.z);
  ok = probe.reached === true && dist < t.radius;
  console.log(`walk cm ${cmid}: reached=${probe.reached} dist=${dist.toFixed(2)} (plot r ${t.radius}) y=${p.y.toFixed(2)} t=${probe.seconds?.toFixed(1)}s`);
  if (out) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/walk-${cmid}.png` });
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(ok ? 0 : 1);
