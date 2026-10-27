// Browser session for trailer shots: headless Chrome on the real GPU, the virtual clock, a logged-in kid, and no writes to the site.
import { loadChromium } from '../playwright.mjs';
import { Recorder } from './recorder.mjs';

const here = new URL('.', import.meta.url).pathname;
const FRAME_MS = 1000 / 60;
/** Ajax calls that would change the kid's data: answered here, never sent. */
const WRITES = {
  local_mooblox_claim_collectible: (n) => ({ found: n }),
  local_mooblox_set_look: null,
  local_mooblox_view_activity: null,
  core_user_update_user_preferences: null,
  core_completion_update_activity_completion_status_manually: { status: true, warnings: [] },
};

export class Session {
  constructor(site, size) {
    this.site = site;
    this.size = size;
    this.found = 0;
  }

  async start(user, password) {
    this.browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-accelerated-video-decode'] });
    this.context = await this.browser.newContext({ viewport: this.size });
    await this.context.addInitScript({ path: `${here}clock.js` });
    await this.context.addInitScript({ path: `${here}hooks.js` });
    await this.context.route('**/lib/ajax/service.php*', (route) => this.ajax(route));
    const page = await this.context.newPage();
    await page.goto(`${this.site}/login/index.php`);
    await page.fill('#username', user);
    await page.fill('#password', password);
    await Promise.all([page.waitForNavigation(), page.click('#loginbtn')]);
    await page.close();
  }

  async ajax(route) {
    const calls = JSON.parse(route.request().postData() ?? '[]');
    if (!calls.some((c) => c.methodname in WRITES)) return route.continue();
    const data = calls.map((c) => {
      const fake = WRITES[c.methodname];
      return { error: false, data: typeof fake === 'function' ? fake(++this.found) : fake };
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  }

  /** Opens `path` in a fresh page and steps the clock until `until` (page function source) holds; returns the page. */
  async open(path, until = '() => document.readyState === "complete"', maxFrames = 4000) {
    const page = await this.context.newPage();
    page.on('pageerror', (e) => console.error('pageerror:', e.message));
    await page.goto(`${this.site}${path}`);
    await this.pump(page, until, maxFrames);
    this.recorder = new Recorder(await this.context.newCDPSession(page));
    return page;
  }

  /** Steps frames (with a short real pause for loads and workers) until `until` holds. */
  async pump(page, until, maxFrames = 4000) {
    for (let i = 0; i < maxFrames; i++) {
      const done = await page.evaluate((src) => {
        window.__trailerClock.step(1000 / 60);
        return (0, eval)(`(${src})`)();
      }, until);
      if (done) return i;
      await page.waitForTimeout(4);
    }
    throw new Error(`pump: condition never held: ${until}`);
  }

  /** Steps `n` frames without recording. */
  async idle(page, n) {
    await page.evaluate((n) => {
      for (let i = 0; i < n; i++) window.__trailerClock.step(1000 / 60);
    }, n);
  }

  /** Records `frames` frames into `file`; `each(page, i)` runs before frame i is stepped. */
  async record(page, file, frames, each = null) {
    this.recorder.open(file);
    for (let i = 0; i < frames; i++) {
      if (each) await each(page, i);
      await page.evaluate((ms) => window.__trailerClock.step(ms), FRAME_MS);
      await this.recorder.grab();
    }
    return this.recorder.close();
  }

  async close() {
    await this.browser.close();
  }
}
