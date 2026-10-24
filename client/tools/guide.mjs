// Guide e2e on the dev page: node tools/guide.mjs [outdir] -> the bubble greets Mia, names the next step, "Show me" goes there
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const out = process.argv[2];
if (out) {
  mkdirSync(out, { recursive: true });
}
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
try {
  for (const [w, h] of [[400, 860], [1366, 768]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.mooblox?.guide, null, { timeout: 60000 });
    const bubble = page.locator('.mooblox-bubble');
    await bubble.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);
    const text = (await bubble.innerText()).replace(/\s+/g, ' ');
    check(`${w}: greeting names Mia and the next step`, text.includes('Hi Mia!') && text.includes('How volcanoes work') && text.startsWith('Guide'), text);
    const box = await bubble.boundingBox();
    check(`${w}: bubble inside the screen`, box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= h, JSON.stringify(box));
    if (out) {
      await page.screenshot({ path: `${out}/guide-${w}.png` });
    }
    if (w === 1366) {
      await bubble.getByRole('button').click();
      await page.waitForTimeout(1000);
      const prompt = await page.locator('.mooblox-prompt').innerText();
      check('Show me takes the player to the next step', prompt.includes('How volcanoes work'), prompt.replace(/\s+/g, ' '));
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
const ok = checks.length > 0 && checks.every(Boolean);
console.log(`guide: ${checks.filter(Boolean).length}/${checks.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
