// Avatar picker e2e on the dev page: node tools/picker.mjs [outdir] -> pick a body and colour, live swap, Done saves, 5 widths
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
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && console.error('page:', m.text()));
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${server.resolvedUrls.local[0]}?avatar=c`);
  await page.waitForFunction(() => window.mooblox?.picker, null, { timeout: 60000 });
  const sheet = page.locator('.mooblox-picker');
  check('starts from the ?avatar look', await page.evaluate(() => JSON.stringify(window.mooblox.picker.current)) === '{"skin":"c","tint":null}');
  await page.evaluate(() => (window.moobloxFirst = window.mooblox.player.avatar));
  await page.locator('.mooblox-hud-avatar').click();
  await sheet.waitFor({ state: 'visible' });
  check('focus on the current body', await page.evaluate(() => document.activeElement?.dataset.body === 'c'));
  await page.locator('[data-body="f"]').click();
  await page.locator('[data-colour="green"]').click();
  await page.waitForFunction(() => window.mooblox.player.avatar !== window.moobloxFirst, null, { timeout: 10000 });
  check('pick swaps the model live', await page.evaluate(() => window.mooblox.player.avatar.root.parent !== null && window.moobloxFirst.root.parent === null));
  check('pressed state follows the pick', await page.evaluate(() => document.querySelector('[data-body="f"]').getAttribute('aria-pressed') === 'true'
    && document.querySelector('[data-colour="green"]').getAttribute('aria-pressed') === 'true'));
  check('nothing saved before Done', await page.evaluate(() => !window.mooblox.gateway.preferences.has('local_mooblox_avatar')));
  for (const [w, h] of [[400, 860], [768, 1024], [1366, 768], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    const box = await sheet.boundingBox();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const left = box.x;
    const right = w - box.x - box.width;
    check(`sheet at ${w}: symmetric, no h-scroll, fits`, Math.abs(left - right) <= 1 && scrollW <= w && box.y > 0, `L${left.toFixed(0)} R${right.toFixed(0)} top ${box.y.toFixed(0)} scrollW ${scrollW}`);
    if (out) {
      await page.screenshot({ path: `${out}/picker-${w}.png` });
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'hidden' });
  check('Esc closes and saves the look', await page.evaluate(() => window.mooblox.gateway.preferences.get('local_mooblox_avatar')) === 'f_green');
} finally {
  await browser.close();
  await server.close();
}
const ok = checks.length > 0 && checks.every(Boolean);
console.log(`picker: ${checks.filter(Boolean).length}/${checks.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
