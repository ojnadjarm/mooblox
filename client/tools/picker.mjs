// Character creator e2e on the dev page: node tools/picker.mjs [outdir] -> tabs, picks, random, undo, 5 widths, 6x CPU fps at 400, save, reload
import { mkdirSync, writeFileSync } from 'node:fs';
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
const numbers = {};
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const pick = (page, field, option) => page.locator(`.mooblox-creator [data-field="${field}"][data-option="${option}"]`).click();
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && console.error('page:', m.text()));
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  const base = server.resolvedUrls.local[0];
  await page.goto(`${base}?avatar=c&nokids`);
  await page.waitForFunction(() => window.mooblox?.picker, null, { timeout: 60000 });
  const creator = page.locator('.mooblox-creator');
  check('old T1302 value migrates', await page.evaluate(() => window.mooblox.picker.current.hair === 'buzz' && window.mooblox.picker.current.topc === 'green'));
  await page.evaluate(() => (window.moobloxFirst = window.mooblox.player.avatar));
  await page.locator('.mooblox-hud-avatar').click();
  await creator.waitFor({ state: 'visible' });
  check('world paused behind the creator', await page.evaluate(() => window.mooblox.gate.isPaused));
  await page.waitForFunction(() => window.mooblox.picker.preview.frames > 10, null, { timeout: 10000 });
  check('preview draws one call per character', await page.evaluate(() => window.mooblox.picker.preview.calls) === 1);
  await pick(page, 'hair', 'afro');
  await pick(page, 'hairc', 'blonde');
  await page.locator('[data-tab="face"]').click();
  await pick(page, 'eyec', 'green');
  await pick(page, 'glasses', 'round');
  await page.locator('[data-tab="clothes"]').click();
  await pick(page, 'top', 'hoodie');
  check('pressed state follows the pick', await page.evaluate(() => document.querySelector('[data-field="top"][data-option="hoodie"]').getAttribute('aria-pressed') === 'true'));
  const before = await page.evaluate(() => JSON.stringify(window.mooblox.picker.current));
  await page.locator('.mooblox-creator-random').click();
  const random = await page.evaluate(() => JSON.stringify(window.mooblox.picker.current));
  check('random changes the look', random !== before);
  await page.locator('.mooblox-creator-undo').click();
  check('undo restores the look before random', await page.evaluate(() => JSON.stringify(window.mooblox.picker.current)) === before);
  check('nothing saved before Save', await page.evaluate(() => !window.mooblox.gateway.preferences.has('local_mooblox_avatar')));
  check('player unchanged before Save', await page.evaluate(() => window.mooblox.player.avatar === window.moobloxFirst));
  for (const [w, h] of [[400, 860], [768, 1024], [1366, 768], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const body = r('.mooblox-creator-body');
      const bar = r('.mooblox-creator-bar');
      const els = [...document.querySelectorAll('.mooblox-creator button')].filter((b) => b.offsetParent);
      return {
        left: body.left, right: innerWidth - body.right, barLeft: bar.left, barRight: innerWidth - bar.right,
        scrollW: document.documentElement.scrollWidth, panelScrollW: document.querySelector('.mooblox-creator-options').scrollWidth - document.querySelector('.mooblox-creator-options').clientWidth,
        stage: r('.mooblox-creator-stage').height, smallest: Math.min(...els.map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))),
        bottom: body.bottom,
      };
    });
    check(`creator at ${w}: symmetric, no h-scroll, fits, 44px targets, preview visible`,
      Math.abs(m.left - m.right) <= 1 && Math.abs(m.barLeft - m.barRight) <= 1 && m.scrollW <= w && m.panelScrollW <= 0 && m.bottom <= h && m.smallest >= 44 && m.stage >= 180,
      `L${m.left.toFixed(0)} R${m.right.toFixed(0)} scrollW ${m.scrollW} stage ${m.stage.toFixed(0)} min ${m.smallest.toFixed(0)}`);
    if (out) {
      await page.screenshot({ path: `${out}/creator-${w}.png` });
    }
  }
  await page.setViewportSize({ width: 400, height: 860 });
  await page.waitForTimeout(400);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const f0 = await page.evaluate(() => window.mooblox.picker.preview.frames);
  await page.waitForTimeout(4000);
  const f1 = await page.evaluate(() => window.mooblox.picker.preview.frames);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  numbers.previewFps6xCpu400 = Math.round(((f1 - f0) / 4) * 10) / 10;
  check('preview at 400 px under 6x CPU throttle runs at >= 55 fps', numbers.previewFps6xCpu400 >= 55, `${numbers.previewFps6xCpu400} fps`);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator('.mooblox-creator-save').click();
  await creator.waitFor({ state: 'hidden' });
  const saved = await page.evaluate(() => window.mooblox.gateway.preferences.get('local_mooblox_avatar'));
  const look = JSON.parse(saved ?? '{}');
  check('Save stores compact v2 JSON', look.v === 2 && look.hair === 'afro' && look.hairc === 'blonde' && look.glasses === 'round' && look.top === 'hoodie', saved);
  await page.waitForFunction(() => window.mooblox.player.avatar !== window.moobloxFirst, null, { timeout: 10000 });
  check('Save swaps the player model and resumes the world', await page.evaluate(() => !window.mooblox.gate.isPaused && window.moobloxFirst.root.parent === null));
  await page.locator('.mooblox-hud-avatar').click();
  await pick(page, 'skin', 's9').catch(() => {});
  await page.locator('[data-tab="skin"]').click();
  await pick(page, 'skin', 's9');
  await page.keyboard.press('Escape');
  check('Esc cancels without saving', await page.evaluate(() => window.mooblox.gateway.preferences.get('local_mooblox_avatar')) === saved);
  await page.goto(`${base}?nokids&avatar=${encodeURIComponent(saved)}`);
  await page.waitForFunction(() => window.mooblox?.picker, null, { timeout: 60000 });
  check('reload with the saved value gives the same look', await page.evaluate(() => JSON.stringify(window.mooblox.picker.current)) === saved);
  numbers.worldDrawCallsWithPlayer = await page.evaluate(() => window.mooblox.stage?.renderer?.info.render.calls ?? null);
} finally {
  await browser.close();
  await server.close();
}
const ok = checks.length > 0 && checks.every(Boolean);
if (out) writeFileSync(`${out}/creator-numbers.json`, JSON.stringify(numbers, null, 2));
console.log(`creator: ${checks.filter(Boolean).length}/${checks.length} ${ok ? 'PASS' : 'FAIL'}`, JSON.stringify(numbers));
process.exit(ok ? 0 : 1);
