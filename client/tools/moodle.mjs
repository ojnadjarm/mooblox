// Live e2e on the 5.2 dev site with local_mooblox installed: node tools/moodle.mjs <video|quiz|avatar> [outdir]
// Run inside `mfixture with 5.2 moodle/local/mooblox -- ...` after the demo reset (see CLAUDE.md).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadChromium } from './playwright.mjs';

const scenario = process.argv[2];
const out = process.argv[3];
const site = process.env.MOOBLOX_MOODLE ?? 'http://localhost:8052';
const env = process.env.MOOBLOX_ENV ?? '5.2';
const mdbPath = process.env.MDB ?? join(homedir(), '.claude/skills/moodle-ci/scripts/mdb');
const scenarios = { video, quiz, avatar };
if (!scenarios[scenario]) {
  console.error('usage: node tools/moodle.mjs <video|quiz|avatar> [outdir]');
  process.exit(2);
}
if (out) {
  mkdirSync(out, { recursive: true });
}

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

/** One value from the env DB (first column of the first row). */
function sql(query, ...params) {
  const rows = execFileSync(mdbPath, ['--env', env, query, ...params.map(String)], { encoding: 'utf8' }).trim().split('\n');
  return rows.length > 1 ? rows[1].split('\t')[0] : null;
}

async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) {
      return v;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const courseid = Number(sql("SELECT id FROM {course} WHERE shortname = 'mooblox_demo'"));
const userid = Number(sql("SELECT id FROM {user} WHERE username = 'mooblox_student'"));
const cmid = (modname) => Number(sql('SELECT cm.id FROM {course_modules} cm JOIN {modules} m ON m.id = cm.module WHERE cm.course = ? AND m.name = ?', courseid, modname));
const completion = (id) => sql('SELECT completionstate FROM {course_modules_completion} WHERE coursemoduleid = ? AND userid = ?', id, userid);

const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${site}/login/index.php`);
  await page.fill('#username', 'mooblox_student');
  await page.fill('#password', 'Testdata1!');
  await Promise.all([page.waitForNavigation(), page.click('#loginbtn')]);
  await openPlay(page);
  await scenarios[scenario](page);
} finally {
  await browser.close();
}
const ok = checks.length > 0 && checks.every(Boolean);
console.log(`moodle ${scenario}: ${checks.filter(Boolean).length}/${checks.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);

async function openPlay(page) {
  await page.goto(`${site}/local/mooblox/play.php?id=${courseid}`);
  await page.waitForFunction(() => window.mooblox?.interaction, null, { timeout: 60000 });
}

function activity(page, id) {
  return page.evaluate((x) => window.mooblox.store.world.sections.flatMap((s) => s.activities).find((a) => a.id === x), id);
}

function openActivity(page, id) {
  return page.evaluate((x) => {
    const a = window.mooblox.store.world.sections.flatMap((s) => s.activities).find((v) => v.id === x);
    void window.mooblox.interaction.open(a);
  }, id);
}

async function video(page) {
  for (const modname of ['resource', 'url']) {
    const id = cmid(modname);
    check(`${modname} cm ${id} starts incomplete`, completion(id) === null, `state ${completion(id)}`);
    await openActivity(page, id);
    const el = page.locator('.mooblox-panel .mooblox-video');
    await el.waitFor({ state: 'visible', timeout: 5000 });
    const tag = await el.evaluate((n) => n.tagName.toLowerCase());
    const src = await el.getAttribute('src');
    const a = await activity(page, id);
    if (modname === 'resource') {
      check('mp4 plays in a native <video>', tag === 'video' && src === a.media.src, src);
    } else {
      check('YouTube plays in the nocookie embed', tag === 'iframe' && src.startsWith('https://www.youtube-nocookie.com/embed/'), src);
    }
    const state = await waitFor(() => completion(id));
    check(`${modname} completion viewed in the DB`, state === '1', `completionstate ${state}`);
    if (out) {
      await page.screenshot({ path: `${out}/video-${modname}.png` });
    }
    await page.keyboard.press('Escape');
    await page.locator('.mooblox-panel-backdrop').waitFor({ state: 'hidden' });
  }
}

async function quiz(page) {
  const id = cmid('quiz');
  const state = () => page.evaluate((x) => ({
    store: window.mooblox.store.world.sections.flatMap((s) => s.activities).find((a) => a.id === x).completion.state,
    flag: window.mooblox.props.get(x).state.done,
  }), id);
  await page.evaluate(() => (window.moobloxNoReload = true));
  check(`quiz cm ${id} starts not done`, JSON.stringify(await state()) === '{"store":0,"flag":false}', JSON.stringify(await state()));
  await openActivity(page, id);
  const frame = page.frameLocator('.mooblox-panel iframe');
  const f = await (await page.waitForSelector('.mooblox-panel iframe')).contentFrame();
  await f.waitForSelector('body#page-mod-quiz-view');
  await Promise.all([f.waitForNavigation(), frame.getByRole('button', { name: /attempt quiz/i }).click()]);
  while (await f.$('body#page-mod-quiz-attempt')) {
    for (const radio of await f.$$('input[type=radio][value="1"]')) {
      await radio.check();
    }
    await Promise.all([f.waitForNavigation(), f.click('#mod_quiz-next-nav')]);
  }
  await frame.locator('body#page-mod-quiz-summary').waitFor({ timeout: 15000 });
  await frame.getByRole('button', { name: 'Submit all and finish' }).first().click();
  await frame.getByRole('dialog').getByRole('button', { name: 'Submit all and finish' }).click();
  await frame.locator('body#page-mod-quiz-review').waitFor({ timeout: 20000 });
  check('quiz finished inside the frame (review page, embedded layout)', await frame.locator('body.pagelayout-embedded').count() === 1);
  check('quiz completion complete in the DB', completion(id) === '1', `completionstate ${completion(id)}`);
  if (out) {
    await page.screenshot({ path: `${out}/quiz-review.png` });
  }
  await page.locator('.mooblox-panel-close').click();
  await page.waitForFunction((x) => window.mooblox.props.get(x).state.done === true, id, { timeout: 10000 }).catch(() => {});
  check('close refreshes store state and prop flag', JSON.stringify(await state()) === '{"store":1,"flag":true}', JSON.stringify(await state()));
  check('no page reload', await page.evaluate(() => window.moobloxNoReload === true));
  if (out) {
    await page.screenshot({ path: `${out}/quiz-flag.png` });
  }
}

async function avatar() {
  throw new Error('avatar scenario not written yet');
}
