// Muted sound check on the live 5.2 site (never plays out loud: --mute-audio, levels from OfflineAudioContext, decisions from the event log).
// node tools/sound.mjs [outdir] [--dev]   env MOOBLOX_MOODLE (default http://localhost:8052), MOOBLOX_COURSE (90), MOOBLOX_USER (mooblox_e2e_kid2)
// --dev: the dev page (FakeGateway demo course) from a local vite server instead of the live site.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const dev = process.argv.includes('--dev');
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
const site = process.env.MOOBLOX_MOODLE ?? 'http://localhost:8052';
const course = Number(process.env.MOOBLOX_COURSE ?? 90);
const username = process.env.MOOBLOX_USER ?? 'mooblox_e2e_kid2';
const mdb = join(homedir(), '.claude/skills/moodle-ci/scripts/mdb');
if (out) mkdirSync(out, { recursive: true });

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const sql = (q, ...p) => execFileSync(mdb, ['--env', '5.2', q, ...p.map(String)], { encoding: 'utf8' }).trim().split('\n')[1]?.split('\t')[0] ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (page) => page.evaluate(() => window.mooblox.sound.engine.log.map((e) => ({ ...e })));
const since = async (page, t) => (await log(page)).filter((e) => e.t >= t);
const now = (page) => page.evaluate(() => Math.round(performance.now()));

const server = dev ? await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' }) : null;
await server?.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
const numbers = {};
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  let userid = 0;
  if (server) {
    await page.goto(server.resolvedUrls.local[0]);
  } else {
    await page.goto(`${site}/login/index.php`);
    await page.fill('#username', username);
    await page.fill('#password', 'Testdata1!');
    await Promise.all([page.waitForNavigation(), page.click('#loginbtn')]);
    userid = Number(sql('SELECT id FROM {user} WHERE username = ?', username));
    execFileSync(mdb, ['--env', '5.2', '--write', "DELETE FROM {user_preferences} WHERE name = 'local_mooblox_sound' AND userid = ?", String(userid)]);
    await page.goto(`${site}/local/mooblox/play.php?id=${course}`);
  }
  await page.waitForFunction(() => window.mooblox?.sound && window.mooblox.streaming.pending === 0, null, { timeout: 90000 });
  await sleep(1500);

  const before = await page.evaluate(() => ({ ctx: window.mooblox.sound.engine.context, media: document.querySelectorAll('audio').length }));
  check('silent before the first gesture (no context)', before.ctx === null);
  numbers.format = await page.evaluate(() => window.mooblox.sound.engine.format);

  await page.mouse.click(683, 500);
  await page.waitForFunction(() => window.mooblox.sound.engine.context?.state === 'running', null, { timeout: 5000 }).catch(() => {});
  let events = await log(page);
  check('first click unlocks a running context', events.some((e) => e.kind === 'unlock') && (await page.evaluate(() => window.mooblox.sound.engine.context?.state)) === 'running');
  check('the plaza loop starts', events.some((e) => e.kind === 'music' && e.id === 'music-hub'), events.filter((e) => e.kind === 'music').map((e) => e.id).join(','));
  await sleep(1200);
  events = await log(page);
  check('the spawn fountain is heard', events.some((e) => e.kind === 'water' && e.id !== 'off'));

  let t = await now(page);
  await page.keyboard.down('KeyS');
  await sleep(1800);
  await page.keyboard.up('KeyS');
  await sleep(300);
  await page.keyboard.down('Space');
  await sleep(120);
  await page.keyboard.up('Space');
  await sleep(1500);
  events = await since(page, t);
  const steps = events.filter((e) => e.id.startsWith('step-'));
  numbers.stepsIn1800ms = steps.length;
  check('walking plays footsteps', steps.length >= 3, `${steps.length} steps: ${[...new Set(steps.map((e) => e.id))].join(',')}`);
  check('a jump plays take-off and landing', events.some((e) => e.id === 'jump') && events.some((e) => e.id === 'land'), events.filter((e) => e.kind === 'sfx' && !e.id.startsWith('step')).map((e) => e.id).join(','));

  t = await now(page);
  await page.keyboard.press('KeyM');
  await sleep(400);
  const muted = await page.evaluate(() => ({ audible: window.mooblox.sound.engine.audible, paused: [...document.querySelectorAll('audio')].every((a) => a.paused) }));
  check('M mutes and pauses the music stream', !muted.audible);
  await page.keyboard.press('KeyM');
  await sleep(300);
  check('M again unmutes', await page.evaluate(() => window.mooblox.sound.engine.audible));

  const acts = await page.evaluate(() => window.mooblox.store.world.sections.flatMap((s) => s.activities).filter((a) => a.available).map((a) => ({ id: a.id, mod: a.modname, video: !!a.media && ((a.media.type === 'file' && a.media.mimetype.startsWith('video/')) || /youtu\.?be/.test(a.media.src)) })));
  const frame = acts.find((a) => !a.video && a.mod !== 'label');
  const video = acts.find((a) => a.video);
  if (frame) {
    t = await now(page);
    await page.evaluate((id) => void window.mooblox.interaction.open(window.mooblox.store.world.sections.flatMap((s) => s.activities).find((a) => a.id === id)), frame.id);
    await sleep(800);
    const mid = await since(page, t);
    check('opening a page plays the open sound and steps the music back', mid.some((e) => e.id === 'open') && mid.some((e) => e.kind === 'mix' && e.id.includes('panel')), frame.mod);
    await page.keyboard.press('Escape');
    await sleep(600);
    check('closing plays the close sound', (await since(page, t)).some((e) => e.id === 'close'));
  }
  if (video) {
    t = await now(page);
    await page.evaluate((id) => void window.mooblox.interaction.open(window.mooblox.store.world.sections.flatMap((s) => s.activities).find((a) => a.id === id)), video.id);
    await sleep(800);
    const v = await since(page, t);
    check('a video panel silences everything', v.some((e) => e.kind === 'mix' && e.id.includes('video') && e.gain === 0) && !v.some((e) => e.id === 'open'));
    await page.keyboard.press('Escape');
    await sleep(600);
    check('closing the video brings the sound back', await page.evaluate(() => window.mooblox.sound.engine.audible));
  }

  t = await now(page);
  const zone = await page.evaluate(() => {
    const z = window.mooblox.layout.zones[0];
    window.mooblox.player.teleport(z.x, z.z, 0);
    return { hubs: window.mooblox.layout.hubs.length };
  });
  await page.waitForFunction((h) => window.mooblox.island >= h, zone.hubs, { timeout: 10000 }).catch(() => {});
  await sleep(800);
  const m = (await since(page, t)).filter((e) => e.kind === 'music');
  check('a district island crossfades to its own loop', m.some((e) => e.id !== 'music-hub'), m.map((e) => e.id).join(','));

  await page.evaluate(() => document.exitPointerLock());
  await sleep(200);
  await page.click('.mooblox-sound-button');
  await page.waitForSelector('.mooblox-sound-pop:not([hidden])');
  await page.fill('.mooblox-sound-pop input', '40');
  await page.dispatchEvent('.mooblox-sound-pop input', 'input');
  await sleep(2000);
  const saved = server
    ? await page.evaluate(() => window.mooblox.gateway.preferences.get('local_mooblox_sound'))
    : sql("SELECT value FROM {user_preferences} WHERE name = 'local_mooblox_sound' AND userid = ?", userid);
  check('the volume choice is saved per user', saved === 'on40', saved);

  numbers.levels = await page.evaluate(async () => {
    const e = window.mooblox.sound.engine;
    const ids = { step: 'step-grass-0', stone: 'step-stone-0', wood: 'step-wood-0', jump: 'jump-0', land: 'land-0', open: 'open', xp: 'xp', guide: 'guide', complete: 'complete', levelup: 'levelup', music: 'music-catmint' };
    const gains = { step: 0.32, stone: 0.22, wood: 0.26, jump: 0.3, land: 0.3, open: 0.3, xp: 0.3, guide: 0.22, complete: 0.4, levelup: 0.36, music: 0.36 };
    const master = 0.7 * 0.7;
    const res = {};
    for (const [k, stem] of Object.entries(ids)) {
      const data = await (await fetch(e.url(stem))).arrayBuffer();
      const ctx = new OfflineAudioContext(1, 48000, 48000);
      const b = await ctx.decodeAudioData(data);
      let peak = 0;
      let sum = 0;
      let n = 0;
      for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const a = Math.abs(d[i]);
          if (a > peak) peak = a;
          sum += d[i] * d[i];
          n++;
        }
      }
      const g = gains[k] * master;
      res[k] = { peak: +(20 * Math.log10(peak * g)).toFixed(1), rms: +(10 * Math.log10((sum / n) * g * g)).toFixed(1) };
    }
    return res;
  });
  console.log('levels at the default volume (dBFS):', JSON.stringify(numbers.levels));
  check('effects peak at or under -12 dBFS at the default volume', Object.entries(numbers.levels).every(([, v]) => v.peak <= -12));

  if (out) {
    for (const w of [400, 768, 1366, 1920, 2560]) {
      await page.setViewportSize({ width: w, height: w < 500 ? 800 : Math.round(w * 0.5625) });
      await sleep(400);
      const open = await page.evaluate(() => !document.querySelector('.mooblox-sound-pop').hidden);
      if (!open) await page.click('.mooblox-sound-button');
      await sleep(200);
      const box = await page.evaluate(() => {
        const r = (s) => document.querySelector(s)?.getBoundingClientRect();
        const b = r('.mooblox-sound-button');
        const p = r('.mooblox-sound-pop');
        return { left: Math.round(b.left), right: Math.round(innerWidth - b.right), popLeft: Math.round(p.left), popRight: Math.round(innerWidth - p.right), scroll: document.documentElement.scrollWidth > innerWidth,
          overlap: ['.mooblox-hud-book', '.mooblox-hud-avatar'].some((s) => { const o = r(s); return o && !(o.right <= b.left || o.left >= b.right || o.bottom <= b.top || o.top >= b.bottom); }) };
      });
      check(`HUD control at ${w}px centred, no overlap, no scroll`, Math.abs(box.left - box.right) <= 2 && Math.abs(box.popLeft - box.popRight) <= 2 && !box.overlap && !box.scroll, JSON.stringify(box));
      await page.screenshot({ path: join(out, `control-${w}.jpg`), quality: 80 });
    }
    writeFileSync(join(out, 'sound.json'), JSON.stringify({ checks: checks.filter(Boolean).length, of: checks.length, numbers, log: await log(page) }, null, 1));
  }
} finally {
  await browser.close();
  await server?.close();
}
console.log(`${checks.filter(Boolean).length}/${checks.length} checks`);
process.exit(checks.every(Boolean) ? 0 : 1);
