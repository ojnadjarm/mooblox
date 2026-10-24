// Touch e2e: node tools/touch.mjs [outdir] [WxH ...]  -> joystick drag moves the avatar, jump button lifts it
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const out = process.argv[2];
const sizes = (process.argv.length > 3 ? process.argv.slice(3) : ['400x860', '768x1024']).map((s) => s.split('x').map(Number));
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failures = 0;
try {
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    const pos = () => page.evaluate(() => window.mooblox.player.body.position.toArray());
    const box = async (sel) => page.locator(sel).boundingBox();
    const stick = await box('.mooblox-stick');
    const jump = await box('.mooblox-jump');
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const before = await pos();
    const cx = stick.x + stick.width / 2;
    const cy = stick.y + stick.height / 2;
    await touch('touchStart', cx, cy);
    for (let i = 1; i <= 5; i++) {
      await touch('touchMove', cx, cy - (stick.height / 2) * (i / 5) * 0.8);
    }
    await page.waitForTimeout(1000);
    if (out) {
      await page.screenshot({ path: `${out}/touch-${w}.png` });
    }
    await touch('touchEnd');
    const after = await pos();
    const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
    await page.waitForTimeout(300);
    const ground = (await pos())[1];
    await touch('touchStart', jump.x + jump.width / 2, jump.y + jump.height / 2);
    await page.waitForTimeout(200);
    const peak = (await pos())[1];
    await touch('touchEnd');
    const lift = peak - ground;
    const margins = `${stick.x.toFixed(0)}/${(w - jump.x - jump.width).toFixed(0)}`;
    const ok = moved > 2 && lift > 0.5;
    failures += ok ? 0 : 1;
    console.log(`${w}x${h} ${ok ? 'PASS' : 'FAIL'} moved=${moved.toFixed(2)}m jumpLift=${lift.toFixed(2)}m stick=${stick.width.toFixed(0)}px margins L/R=${margins}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);
