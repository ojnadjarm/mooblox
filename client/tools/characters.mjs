// Character stills and draw calls: node tools/characters.mjs <outdir> [n] [--random] [--turn=<rad>] -> grid.html screenshot + calls/triangles JSON
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const [out = '.', n = '12'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const random = process.argv.includes('--random');
const turn = process.argv.find((a) => a.startsWith('--turn='))?.slice(7);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  await page.goto(`${server.resolvedUrls.local[0]}grid.html?n=${n}${random ? '&random=1' : ''}${turn ? `&turn=${turn}` : ''}`);
  await page.waitForFunction(() => window.grid?.frames > 30, null, { timeout: 60000 });
  const stats = await page.evaluate(() => ({ calls: window.grid.calls, triangles: window.grid.triangles }));
  const name = `characters-${n}${random ? '-random' : ''}${turn ? '-turn' : ''}`;
  await page.screenshot({ path: `${out}/${name}.png` });
  writeFileSync(`${out}/${name}.json`, JSON.stringify({ n: Number(n), ...stats }, null, 2));
  console.log(name, JSON.stringify(stats));
} finally {
  await browser.close();
  await server.close();
}
