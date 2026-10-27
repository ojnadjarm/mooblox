// Trailer footage (dev only): node tools/trailer/capture.mjs <outdir> --site <url> --user <u> --password <p> [--shots file] [--only a,b] [--stills] [--size 1920x1080]
// Renders each shot of shots.mjs frame by frame on a virtual 60 fps clock (no dropped frames) into <outdir>/<shot>.mp4;
// --stills writes only the first, middle and last frame of each shot as PNGs; --shots picks the shot list (default shots.mjs).
// Nothing is written to the site (see session.mjs) unless a shot names the calls it lets through (`writes`).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Session } from './session.mjs';

const out = process.argv[2];
const flag = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const site = flag('--site', '');
const only = flag('--only', '');
const stills = process.argv.includes('--stills');
const [width, height] = flag('--size', '1920x1080').split('x').map(Number);
const { SHOTS, RENAME = {} } = await import(resolve(flag('--shots', new URL('shots.mjs', import.meta.url).pathname)));
if (!out || !site) {
  console.error('usage: node tools/trailer/capture.mjs <outdir> --site <url> --user <u> --password <p> [--only a,b] [--stills] [--size WxH]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const session = new Session(site, { width, height }, RENAME);
await session.start(flag('--user', ''), flag('--password', ''));
const report = [];
for (const shot of SHOTS.filter((s) => !only || only.split(',').includes(s.name))) {
  const t0 = Date.now();
  session.pass = new Set(shot.writes ?? []);
  const page = await session.open(shot.url, shot.until);
  await page.evaluate(() => window.mooblox && window.__trailer.install());
  if (shot.settle) await session.idle(page, shot.settle);
  if (shot.block) await page.route(shot.block, (r) => r.fulfill({ status: 204 }));
  if (shot.setup) await page.evaluate((src) => (0, eval)(`(${src})`)(), shot.setup);
  if (shot.until?.includes('streaming')) await session.pump(page, shot.until);
  await page.evaluate(([rig, clean]) => {
    window.__trailer.rig(rig);
    window.__trailer.clean(clean);
  }, [shot.rig ?? null, shot.clean ?? true]);
  const keys = shot.keys ?? [];
  const each = async (p, i) => {
    for (const [at, dir, key] of keys) if (at === i) await (dir === 'down' ? p.keyboard.down(key) : p.keyboard.up(key));
    await p.evaluate(([src, keep, i]) => {
      if (src) (0, eval)(`(${src})`)(i);
      for (const el of document.querySelectorAll(keep)) el.classList.add('trailer-keep');
    }, [shot.each ?? null, (shot.keep ?? ['.trailer-none']).join(','), i]);
  };
  if (stills) {
    const marks = new Set([0, Math.floor(shot.frames / 2), shot.frames - 1]);
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < shot.frames; i++) {
      await each(page, i);
      await page.evaluate(() => window.__trailerClock.step(1000 / 60));
      if (marks.has(i)) {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(out, `${shot.name}-${String(i).padStart(3, '0')}.png`), Buffer.from(data, 'base64'));
      }
    }
  } else {
    const frames = await session.record(page, join(out, `${shot.name}.mp4`), shot.frames, each);
    report.push({ shot: shot.name, frames, seconds: (Date.now() - t0) / 1000 });
  }
  for (const [, , key] of keys) await page.keyboard.up(key);
  if (shot.teardown) await page.evaluate((src) => (0, eval)(`(${src})`)(), shot.teardown);
  console.log(`${shot.name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.close();
}
if (!stills) writeFileSync(join(out, 'shots.json'), JSON.stringify(report, null, 1));
await session.close();
