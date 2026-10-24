// Book e2e on the dev page: node tools/book.mjs [outdir] -> B opens the book (5 widths, no overflow), "Go there" teleports onto the plot
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const CM = 44;
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
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  await page.goto(`${server.resolvedUrls.local[0]}?manual=41&locked=43&due=44`);
  await page.waitForFunction(() => window.mooblox?.interaction, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const book = page.locator('.mooblox-panel .mooblox-book');
  for (const [w, h] of [[400, 860], [768, 1024], [1366, 768], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.keyboard.press('KeyB');
    await book.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const panel = document.querySelector('.mooblox-panel').getBoundingClientRect();
      const inner = document.querySelector('.mooblox-book-inner').getBoundingClientRect();
      const rows = [...document.querySelectorAll('.mooblox-book-row')].map((r) => r.getBoundingClientRect());
      const scroller = document.querySelector('.mooblox-book');
      return {
        left: panel.left, right: innerWidth - panel.right,
        innerL: inner.left - panel.left, innerR: panel.right - inner.right,
        rowsInside: rows.every((r) => r.left >= panel.left && r.right <= panel.right + 0.5),
        hScroll: document.documentElement.scrollWidth > innerWidth || scroller.scrollWidth > scroller.clientWidth,
        rows: rows.length,
      };
    });
    check(`book at ${w}: symmetric, rows inside, no h-scroll`,
      Math.abs(m.left - m.right) <= 1 && Math.abs(m.innerL - m.innerR) <= 2 && m.rowsInside && !m.hScroll && m.rows === 5,
      `panel L${m.left.toFixed(0)} R${m.right.toFixed(0)} inner L${m.innerL.toFixed(0)} R${m.innerR.toFixed(0)} rows ${m.rows}`);
    if (out) {
      await page.screenshot({ path: `${out}/book-${w}.png` });
    }
    await page.keyboard.press('KeyB');
    await book.waitFor({ state: 'hidden', timeout: 5000 });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.keyboard.press('KeyB');
  await page.locator(`.mooblox-book-row[data-cmid="${CM}"] .mooblox-book-go`).click();
  await book.waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForTimeout(1200);
  const at = await page.evaluate((id) => {
    const plot = window.mooblox.layout.zones.flatMap((z) => z.plots).find((p) => p.activityId === id);
    const p = window.mooblox.player.body.position;
    return { d: Math.hypot(p.x - plot.x, p.z - plot.z), r: plot.radius, y: p.y, onGround: window.mooblox.player.body.onGround };
  }, CM);
  check('Go there lands on the plot', at.d < at.r && at.onGround && Math.abs(at.y - 0.3) < 0.2, `d ${at.d.toFixed(2)} of r ${at.r}, y ${at.y.toFixed(2)}`);
  const prompt = await page.locator('.mooblox-prompt').innerText();
  check('prompt shows the activity', prompt.includes('Volcano quiz'), prompt.replace(/\s+/g, ' '));
  if (out) {
    await page.screenshot({ path: `${out}/goto-${CM}.png` });
  }
} finally {
  await browser.close();
  await server.close();
}
const ok = checks.length > 0 && checks.every(Boolean);
console.log(`book: ${checks.filter(Boolean).length}/${checks.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
