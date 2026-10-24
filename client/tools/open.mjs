// Open e2e: node tools/open.mjs <cmid> [outdir] -> walk to the plot, E opens the panel on the cm url, Esc closes, render resumes
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const cmid = Number(process.argv[2] ?? 0);
const out = process.argv[3];
if (!cmid) {
  console.error('usage: node tools/open.mjs <cmid> [outdir]');
  process.exit(2);
}
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
const frames = (page) => page.evaluate(() => window.mooblox.gate.frames);
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && console.error('page:', m.text()));
  await page.goto(`${server.resolvedUrls.local[0]}?walk=${cmid}`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
  await page.waitForFunction(() => window.mooblox.probe.reached, null, { timeout: 60000 });
  const prompt = page.locator('.mooblox-prompt');
  await prompt.waitFor({ state: 'visible', timeout: 5000 });
  const want = await page.evaluate((id) => window.mooblox.world.sections.flatMap((s) => s.activities).find((a) => a.id === id), cmid);
  check('prompt names the activity', (await prompt.textContent()).includes(want.name), await prompt.innerText());
  await page.keyboard.press('KeyE');
  const panel = page.locator('.mooblox-panel-backdrop');
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  const src = await page.locator('.mooblox-panel iframe').getAttribute('src');
  check('panel frames the cm url', src === want.url, src);
  check('close button has focus', await page.evaluate(() => document.activeElement?.classList.contains('mooblox-panel-close')));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  check('focus stays in the panel', await page.evaluate(() => !!document.activeElement?.closest('.mooblox-panel')));
  check('canvas is inert', await page.evaluate(() => document.querySelector('canvas').parentElement !== null && document.querySelector('canvas').inert === true));
  const paused = await page.evaluate(() => window.mooblox.gate.isPaused);
  const f0 = await frames(page);
  await page.waitForTimeout(600);
  const f1 = await frames(page);
  check('render sleeps while open', paused && f1 - f0 <= 2, `frames +${f1 - f0}`);
  if (out) {
    await page.screenshot({ path: `${out}/panel-1366.png` });
  }
  await page.locator('.mooblox-panel-close').focus();
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden', timeout: 5000 });
  const f2 = await frames(page);
  await page.waitForTimeout(600);
  const f3 = await frames(page);
  check('Esc closes and render resumes', !(await page.evaluate(() => window.mooblox.gate.isPaused)) && f3 - f2 > 10, `frames +${f3 - f2}`);
  check('prompt is back', await prompt.isVisible());
  if (out) {
    for (const [w, h] of [[400, 860], [768, 1024], [1366, 768], [1920, 1080], [2560, 1440]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(300);
      if (out) {
        await page.screenshot({ path: `${out}/prompt-${w}.png` });
      }
      await page.keyboard.press('KeyE');
      await panel.waitFor({ state: 'visible' });
      const box = await page.locator('.mooblox-panel').boundingBox();
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      const left = box.x;
      const right = w - box.x - box.width;
      check(`panel at ${w}: symmetric, no h-scroll`, Math.abs(left - right) <= 1 && scrollW <= w, `L${left.toFixed(0)} R${right.toFixed(0)} scrollW ${scrollW}`);
      await page.screenshot({ path: `${out}/panel-${w}.png` });
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden' });
    }
  }
} finally {
  await browser.close();
  await server.close();
}
const ok = checks.length > 0 && checks.every(Boolean);
console.log(`open cm ${cmid}: ${checks.filter(Boolean).length}/${checks.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
