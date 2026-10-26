// Mouse-look + guided walk e2e on the dev page: node tools/mouselook.mjs <outdir> [--pre] -> look.webm, walk.webm, numbers.json; --pre records only
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const out = process.argv[2];
const pre = process.argv.includes('--pre');
if (!out) {
  console.error('usage: node tools/mouselook.mjs <outdir> [--pre]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const size = { width: 1366, height: 768 };
const checks = [];
const numbers = {};
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const yaw = (page) => page.evaluate(() => window.mooblox.player.camera.yaw);
const locked = (page) => page.evaluate(() => document.pointerLockElement !== null);
const tip = (page) => page.evaluate(() => {
  const t = document.querySelector('.mooblox-look-tip');
  return t && !t.hidden ? t.textContent : '';
});
/** Mouse travel as the browser reports it under pointer lock (headless Chrome's own movementX recentres to zero). */
const nudge = (page, dx, dy, steps = 12) =>
  page.evaluate(async ([dx, dy, steps]) => {
    for (let i = 0; i < steps; i++) {
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx / steps, movementY: dy / steps, bubbles: true }));
      await new Promise((r) => requestAnimationFrame(r));
    }
  }, [dx, dy, steps]);

/** Opens the dev page in a recording context; returns the page and a stop() that saves the video as `name`. */
async function open(name) {
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: out, size } });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.mooblox?.guide && window.mooblox.probe?.ready, null, { timeout: 90000 });
  await page.locator('.mooblox-bubble').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(800);
  const stop = async () => {
    const video = page.video();
    await context.close();
    renameSync(await video.path(), join(out, name));
  };
  return { page, stop };
}

/** Player positions sampled every 100 ms for `seconds`: the fastest speed over any half second (m/s), metres moved, the end point. */
async function track(page, seconds, from = null) {
  return page.evaluate(async ([seconds, from]) => {
    const p = window.mooblox.player.body.position;
    const start = from ?? { x: p.x, z: p.z };
    const samples = [{ x: start.x, z: start.z, t: performance.now() }];
    for (let k = 0; k < seconds * 10; k++) {
      await new Promise((r) => setTimeout(r, 100));
      samples.push({ x: p.x, z: p.z, t: performance.now() });
    }
    let jump = 0;
    let metres = 0;
    for (let k = 1; k < samples.length; k++) {
      const [a, b] = [samples[k - 1], samples[k]];
      metres += Math.hypot(b.x - a.x, b.z - a.z);
      // Over half a second, so samples that straddle a slow frame do not read as a burst.
      const w = samples[Math.max(0, k - 5)];
      jump = Math.max(jump, Math.hypot(b.x - w.x, b.z - w.z) / ((b.t - w.t) / 1000));
    }
    return { jump, metres, end: samples.at(-1) };
  }, [seconds, from]);
}

try {
  // 1. Look: a click, plain mouse travel, a drag, Tab held and released.
  {
    const { page, stop } = await open('look.webm');
    const cx = size.width / 2;
    const cy = size.height / 2;
    await page.mouse.click(cx, cy + 120);
    await page.waitForTimeout(300);
    numbers.lockedAfterClick = await locked(page);
    numbers.tipLocked = await tip(page);
    const y0 = await yaw(page);
    for (let i = 1; i <= 12; i++) await page.mouse.move(cx + i * 25, cy + 120);
    await nudge(page, 420, 0);
    await page.waitForTimeout(600);
    const y1 = await yaw(page);
    numbers.yawFromMouseTravel = y1 - y0;
    await page.mouse.move(cx, cy + 120);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(cx - i * 25, cy + 120);
    await page.mouse.up();
    await page.waitForTimeout(600);
    numbers.yawFromDrag = (await yaw(page)) - y1;
    await page.keyboard.down('Tab');
    await page.waitForTimeout(400);
    numbers.lockedWithTab = await locked(page);
    numbers.tipTab = await tip(page);
    numbers.focusWithTab = await page.evaluate(() => document.activeElement?.tagName);
    const y2 = await yaw(page);
    await nudge(page, 300, 0);
    numbers.yawWithTab = (await yaw(page)) - y2;
    await page.waitForTimeout(600);
    await page.keyboard.up('Tab');
    await page.waitForTimeout(500);
    numbers.lockedAfterTab = await locked(page);
    numbers.modeAfterTab = await page.evaluate(() => window.mooblox.player.mouseLook?.mode);
    await nudge(page, -300, 60);
    await page.waitForTimeout(600);
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForTimeout(400);
    numbers.tipEscaped = await tip(page);
    await page.screenshot({ path: join(out, 'look-1366.png') });
    await stop();
    if (!pre) {
      check('a click locks the pointer', numbers.lockedAfterClick);
      check('mouse travel turns the camera', Math.abs(numbers.yawFromMouseTravel) > 0.5, numbers.yawFromMouseTravel.toFixed(2));
      check('a mouse drag does not add a turn of its own', Math.abs(numbers.yawFromDrag) < 0.05, numbers.yawFromDrag.toFixed(3));
      check('Tab frees the cursor, stops the turning and keeps focus put', !numbers.lockedWithTab && Math.abs(numbers.yawWithTab) < 0.01 && numbers.focusWithTab === 'BODY', `${numbers.tipTab}; focus ${numbers.focusWithTab}`);
      check('releasing Tab locks again', numbers.lockedAfterTab);
      check('tips: locked, Tab, after Esc', Boolean(numbers.tipLocked && numbers.tipTab && numbers.tipEscaped), `${numbers.tipLocked} | ${numbers.tipEscaped}`);
    }
  }
  // 2. Guide: Show me (Tab held on PC), then the trip to the next step.
  {
    const { page, stop } = await open('walk.webm');
    await page.mouse.click(size.width / 2, size.height / 2 + 120);
    await page.waitForTimeout(300);
    await page.keyboard.down('Tab');
    await page.waitForTimeout(300);
    const from = await page.evaluate(() => ({ x: window.mooblox.player.body.position.x, z: window.mooblox.player.body.position.z }));
    await page.locator('.mooblox-bubble-go').click();
    await page.keyboard.up('Tab');
    const trip = await track(page, 14, from);
    const prompt = await page.locator('.mooblox-prompt').innerText().catch(() => '');
    Object.assign(numbers, { fastestMps: trip.jump, walkMetres: trip.metres, walkPrompt: prompt.replace(/\s+/g, ' ') });
    await page.screenshot({ path: join(out, 'walk-end-1366.png') });
    if (!pre) {
      numbers.lockedAtArrival = await locked(page);
      await page.keyboard.press('KeyE');
      await page.locator('.mooblox-panel-close').waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(500);
      numbers.panelOpen = { locked: await locked(page), tip: await tip(page) };
      await page.screenshot({ path: join(out, 'panel-1366.png') });
      await page.locator('.mooblox-panel-close').click();
      await page.waitForTimeout(600);
      numbers.panelClosed = { locked: await locked(page), tip: await tip(page) };
    }
    await stop();
    if (!pre) {
      check('Show me walks (never faster than 14 m/s; run is 10)', trip.jump < 14 && trip.metres > 5, `fastest ${trip.jump.toFixed(1)} m/s, ${trip.metres.toFixed(1)} m walked`);
      check('the walk ends at the next step', prompt.includes('How volcanoes work'), numbers.walkPrompt);
      check('a panel frees the cursor and hides the tip', numbers.lockedAtArrival && !numbers.panelOpen.locked && numbers.panelOpen.tip === '');
      check('closing the panel locks again', numbers.panelClosed.locked, numbers.panelClosed.tip);
    }
  }
  // 3. Book: Go there walks too.
  {
    const { page, stop } = await open('book.webm');
    await page.keyboard.press('KeyB');
    const from = await page.evaluate(() => ({ x: window.mooblox.player.body.position.x, z: window.mooblox.player.body.position.z }));
    await page.locator('.mooblox-book-row[data-cmid="44"] .mooblox-book-go').click();
    const trip = await track(page, 14, from);
    const prompt = (await page.locator('.mooblox-prompt').innerText().catch(() => '')).replace(/\s+/g, ' ');
    Object.assign(numbers, { bookFastestMps: trip.jump, bookMetres: trip.metres, bookPrompt: prompt });
    await stop();
    if (!pre) check('Book Go there walks (never faster than 14 m/s) to the quiz', trip.jump < 14 && trip.metres > 5 && prompt.includes('Volcano quiz'), `fastest ${trip.jump.toFixed(1)} m/s, ${trip.metres.toFixed(1)} m, ${prompt}`);
  }
  // 4. A movement key cancels the walk.
  if (!pre) {
    const { page, stop } = await open('cancel.webm');
    await page.locator('.mooblox-bubble-go').click();
    await page.waitForTimeout(1500);
    const walking = await page.evaluate(() => window.mooblox.player.guided.active);
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(150);
    await page.keyboard.up('KeyS');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.mooblox.player.guided.active);
    const still = await track(page, 1.5);
    await stop();
    check('a movement key cancels the walk', walking && !after && still.metres < 1.5, `walking ${walking} -> ${after}, then ${still.metres.toFixed(2)} m`);
  }
} finally {
  await browser.close();
  await server.close();
}
for (const f of readdirSync(out)) if (/^[0-9a-f]{32}\.webm$/.test(f)) console.warn('stray video', f);
writeFileSync(join(out, 'numbers.json'), JSON.stringify(numbers, null, 2));
console.log(JSON.stringify(numbers));
const ok = pre || (checks.length > 0 && checks.every(Boolean));
console.log(`mouselook: ${checks.filter(Boolean).length}/${checks.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
