// Course entry e2e on a live site: node tools/entry.mjs <outdir> --live <site> --user <name> --password <pw> [--course 90]
// Course page link -> arrival, keyboard focus, first W press takes pointer lock, mouse turns, Tab frees; reload -> no arrival; typed URL -> arrival.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChromium } from './playwright.mjs';

const out = process.argv[2];
const flag = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const live = flag('--live', '');
const user = flag('--user', '');
const password = flag('--password', '');
const course = flag('--course', '90');
if (!out || !live || !user) {
  console.error('usage: node tools/entry.mjs <outdir> --live <site> --user <name> --password <pw> [--course 90]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const size = { width: 1366, height: 768 };
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const play = `${live}/local/mooblox/play.php?id=${course}`;
const state = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('#mooblox-root canvas');
    const m = window.mooblox;
    const p = m.player.body.position;
    return { arrival: m.arrival !== null, focused: document.activeElement === canvas, locked: document.pointerLockElement === canvas, yaw: m.player.camera.yaw, x: p.x, z: p.z };
  });
/** Mouse travel as the browser reports it under pointer lock (headless Chrome's own movementX recentres to zero). */
const nudge = (page, dx) =>
  page.evaluate(async (dx) => {
    for (let i = 0; i < 12; i++) {
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx / 12, movementY: 0, bubbles: true }));
      await new Promise((r) => requestAnimationFrame(r));
    }
  }, dx);
const ready = (page) => page.waitForFunction(() => window.mooblox?.player && document.querySelector('#mooblox-root')?.dataset['ready'] === '1', null, { timeout: 60000 });

try {
  const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: out, size } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${live}/login/index.php`);
  await page.fill('#username', user);
  await page.fill('#password', password);
  await Promise.all([page.waitForNavigation(), page.click('#loginbtn')]);
  await page.goto(`${live}/course/view.php?id=${course}`);
  await Promise.all([page.waitForNavigation(), page.click(`a[href*="local/mooblox/play.php"]`)]);
  await ready(page);
  const start = await state(page);
  check('course page link plays the arrival', start.arrival);
  check('canvas has keyboard focus at load', start.focused);
  await page.waitForTimeout(1500);
  const before = await state(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const walked = await state(page);
  const metres = Math.hypot(walked.x - before.x, walked.z - before.z);
  check('W walks without a click', metres > 1, `${metres.toFixed(1)} m`);
  check('first W press takes pointer lock', walked.locked);
  await nudge(page, 300);
  const turned = await state(page);
  check('mouse turns the camera without a click', Math.abs(turned.yaw - walked.yaw) > 0.05, `yaw ${(turned.yaw - walked.yaw).toFixed(2)}`);
  await page.keyboard.down('Tab');
  await page.waitForTimeout(300);
  const held = await state(page);
  await page.keyboard.up('Tab');
  await page.waitForTimeout(300);
  const back = await state(page);
  check('Tab held frees the cursor, release relocks', !held.locked && back.locked);
  await page.waitForTimeout(800);
  await page.reload();
  await ready(page);
  check('reload skips the arrival', !(await state(page)).arrival);
  await page.waitForTimeout(1500);
  await page.goto(play);
  await ready(page);
  check('typed play.php address plays the arrival', (await state(page)).arrival);
  await page.waitForTimeout(2500);
  const video = page.video();
  await ctx.close();
  renameSync(await video.path(), join(out, 'entry.webm'));
} finally {
  await browser.close();
}
writeFileSync(join(out, 'entry.json'), JSON.stringify(results, null, 2));
const fails = results.filter((r) => !r.ok).length;
console.log(`${results.length - fails}/${results.length}`);
process.exit(fails ? 1 : 0);
