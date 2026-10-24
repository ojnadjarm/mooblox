// Quality e2e: node tools/quality.mjs [outdir]  -> ?perf=1 overlay numbers, tier buttons change the DPR, overlay fits 5 widths
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const out = process.argv[2];
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const url = `${server.resolvedUrls.local[0]}?perf=1`;
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failures = 0;
const check = (ok, line) => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
};
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 });
  await page.goto(url);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  const text = await page.locator('.mooblox-perf').innerText();
  check(/\d+ fps/.test(text) && /\d+ calls/.test(text) && /\d+ programs/.test(text), `overlay: ${text.replace(/\s+/g, ' ')}`);
  for (const [tier, want] of [['low', 1], ['medium', 1.5], ['high', 2]]) {
    await page.click(`.mooblox-perf button[data-tier="${tier}"]`);
    const got = await page.evaluate(() => [window.mooblox.stage.renderer.getPixelRatio(), window.mooblox.stage.sun.castShadow]);
    check(got[0] === want && got[1] === (tier !== 'low'), `tier ${tier}: dpr ${got[0]} (want ${want}) shadow ${got[1]}`);
  }
  await page.close();
  for (const [w, h] of [[400, 860], [768, 1024], [1366, 768], [1920, 1080], [2560, 1440]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.goto(url);
    await p.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
    await p.waitForTimeout(600);
    const m = await p.evaluate(() => {
      const r = document.querySelector('.mooblox-perf').getBoundingClientRect();
      return { left: r.left, right: innerWidth - r.right, scrollW: document.documentElement.scrollWidth };
    });
    check(m.scrollW <= w && Math.abs(m.left - m.right) <= 2, `${w}x${h} overlay margins ${m.left.toFixed(0)}/${m.right.toFixed(0)} scrollW ${m.scrollW}`);
    if (out) {
      await p.screenshot({ path: `${out}/perf-${w}.png` });
    }
    await p.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);
