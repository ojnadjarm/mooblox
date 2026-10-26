// T1376 e2e: plays the mooblox_e2e_* courses as a student in play.php and writes matrix rows.
// node tools/e2e-courses.mjs <spec.json> <manifest.json> <outdir> [shortname,..]   (inside `mfixture with 5.2 moodle/local/mooblox -- ...`)
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadChromium } from './playwright.mjs';

const [specPath, manifestPath, out, only] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const site = process.env.MOOBLOX_MOODLE ?? 'http://localhost:8052';
const mdb = join(homedir(), '.claude/skills/moodle-ci/scripts/mdb');
const csv = join(out, 'rows.csv');
mkdirSync(join(out, 'stills'), { recursive: true });
if (!existsSync(csv)) {
  writeFileSync(csv, 'course,mod,flow,result,severity,repro,evidence\n');
}

const q = (v) => `"${String(v ?? '').replaceAll('"', "'").replaceAll('\n', ' ')}"`;
let current = { course: '', errors: [], seen: [] };
function row(mod, flow, result, severity, repro, evidence = '') {
  const errs = current.errors.splice(0);
  const ev = [evidence, ...errs.slice(0, 3)].filter(Boolean).join(' | ');
  appendFileSync(csv, [current.course, mod, flow, result, result === 'pass' ? '' : severity, repro, ev].map(q).join(',') + '\n');
  console.log(`${result.padEnd(11)} ${current.course} ${mod} ${flow} ${result === 'pass' ? '' : repro}`);
}

function sql(query, ...params) {
  const rows = execFileSync(mdb, ['--env', '5.2', query, ...params.map(String)], { encoding: 'utf8' }).trim().split('\n');
  return rows.length > 1 ? rows[1].split('\t')[0] : null;
}
const completionOf = (cmid, uid) => sql('SELECT completionstate FROM {course_modules_completion} WHERE coursemoduleid = ? AND userid = ?', cmid, uid);
const bugs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > end) return v;
    await sleep(300);
  }
}

/** Spec item by key (with its after/tree/date rules) for every course. */
function specItems(c) {
  const map = {};
  const walk = (list, section) => list.forEach((i) => { map[i.key] = { ...i, sectionSpec: section }; walk(i.items ?? [], section); });
  c.sections.forEach((s) => walk(s.items, s));
  return map;
}

const chromium = await loadChromium();
const launch = () => chromium.launch({ headless: true, args: ['--mute-audio', `--use-angle=${process.env.E2E_ANGLE ?? 'vulkan'}`, '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-domain-blocking-for-3d-apis'] });
let browser = await launch();

async function session(username, width = 1366, height = 768) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const err = (e) => { current.errors.push(e); current.seen.push(e); };
  page.on('console', (m) => m.type() === 'error' && err(`console: ${m.text().slice(0, 140)}`));
  page.on('pageerror', (e) => err(`pageerror: ${e.message.slice(0, 140)}`));
  page.on('response', async (r) => {
    if (r.url().includes('/lib/ajax/service.php')) {
      try {
        const body = await r.json();
        for (const x of [].concat(body)) {
          if (x?.error) current.errors.push(`ajax ${new URL(r.url()).searchParams.get('info')}: ${x.exception?.errorcode ?? x.error}`);
        }
      } catch { /* not json */ }
    }
  });
  await page.goto(`${site}/login/index.php`);
  await page.fill('#username', username);
  await page.fill('#password', 'Testdata1!');
  await Promise.all([page.waitForNavigation(), page.click('#loginbtn')]);
  return { context, page };
}

async function enter(page, courseid) {
  const t = Date.now();
  await page.goto(`${site}/local/mooblox/play.php?id=${courseid}`);
  try {
    await page.waitForFunction(() => window.mooblox?.interaction && window.mooblox?.store?.world, null, { timeout: 60000 });
  } catch (e) {
    await page.screenshot({ path: join(out, 'stills', `enter-fail-${courseid}-${Date.now()}.jpg`), type: 'jpeg' }).catch(() => {});
    const card = await fallbackShown(page);
    throw new Error(`enter timeout at ${page.url()}: ${(await page.title().catch(() => ''))}${card ? ' — fallback card shown' : ' — white page'}`);
  }
  await page.evaluate(() => {
    window.moobloxNoReload = true;
    document.querySelectorAll('canvas').forEach((c) => c.addEventListener('webglcontextlost', () => console.error('E2E webglcontextlost')));
  });
  return Date.now() - t;
}

const fallbackShown = (page) => page.evaluate(() => !!document.querySelector('.mooblox-fallback a[href*="course/view.php"]')).catch(() => false);
/** T1377: when the world cannot start, the kid gets the fallback card with a course link, never a white page. */
async function noWhitePage(page, flow, repro) {
  const card = await fallbackShown(page);
  row('course', `${flow}: no white page when WebGL cannot start`, card ? 'pass' : 'fail', 'high', `${repro}: ${card ? 'fallback card with the course link' : 'white page'}`, await still(page, `${current.course}-${flow.replaceAll(' ', '-')}-fallback`));
}

const worldActs = (page) => page.evaluate(() => window.mooblox.store.world.sections.flatMap((s) => s.activities.map((a) => ({
  id: a.id, modname: a.modname, name: a.name, available: a.available, lock: a.lock, url: a.url, sectionId: s.id,
  state: a.completion.state, tracking: a.completion.tracking, media: a.media }))));
const worldSections = (page) => page.evaluate(() => window.mooblox.store.world.sections.map((s) => ({ id: s.id, number: s.number,
  name: s.name, available: s.available, lock: s.lock, count: s.activities.length, fenced: window.mooblox.fence?.isClosed(s.id) ?? null })));

async function still(page, name) {
  const p = join(out, 'stills', `${name}.jpg`);
  await page.screenshot({ path: p, type: 'jpeg', quality: 70 }).catch(() => {});
  return `stills/${name}.jpg`;
}

async function stills2(page, name) {
  const a = await still(page, `${name}-1366`);
  await page.setViewportSize({ width: 400, height: 860 });
  await sleep(1500);
  const b = await still(page, `${name}-400`);
  await page.setViewportSize({ width: 1366, height: 768 });
  await sleep(800);
  return `${a} ${b}`;
}

/** Walk-up: teleport in front of the plot, wait for the prompt with the name; resolves to the prompt state. */
async function walkUp(page, cmid) {
  const ok = await page.evaluate((id) => {
    const m = window.mooblox;
    const plot = m.view.layout.zones.flatMap((z) => z.plots).find((p) => p.activityId === id);
    if (!plot) return false;
    m.player.teleport(plot.x + Math.sin(plot.facing) * 1.6, plot.z + Math.cos(plot.facing) * 1.6, plot.facing + Math.PI);
    return true;
  }, cmid);
  if (!ok) return { plot: false };
  let prompt = await until(() => page.evaluate((id) => window.mooblox.interaction.nearId === id
    && document.querySelector('.mooblox-prompt-text')?.textContent, cmid), 3000);
  if (prompt) return { plot: true, prompt };
  await page.evaluate(() => { const sp = window.mooblox.view.layout.spawn; window.mooblox.player.teleport(sp.x, sp.z, 0); });
  await sleep(800);
  await page.evaluate((id) => {
    const m = window.mooblox;
    const plot = m.view.layout.zones.flatMap((z) => z.plots).find((p) => p.activityId === id);
    m.player.teleport(plot.x + Math.sin(plot.facing) * 1.6, plot.z + Math.cos(plot.facing) * 1.6, plot.facing + Math.PI);
  }, cmid);
  prompt = await until(() => page.evaluate((id) => window.mooblox.interaction.nearId === id
    && document.querySelector('.mooblox-prompt-text')?.textContent, cmid), 5000);
  return { plot: true, prompt: prompt || '' };
}

async function frame(page) {
  const handle = await page.waitForSelector('.mooblox-panel iframe', { timeout: 10000 });
  const f = await handle.contentFrame();
  await f.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  return f;
}

async function fillEditor(f, text) {
  await f.waitForTimeout(800);
  await f.evaluate((t) => {
    (window.tinymce?.get?.() ?? []).forEach((e) => { e.setContent(`<p>${t}</p>`); e.save(); });
    document.querySelectorAll('textarea').forEach((x) => { x.value = t; });
  }, text);
}
const clickSubmit = (f, name) => Promise.all([f.waitForNavigation({ timeout: 15000 }).catch(() => {}), f.getByRole('button', { name }).first().click({ timeout: 8000 })]);
const clickLink = (f, name) => Promise.all([f.waitForNavigation({ timeout: 15000 }).catch(() => {}), f.getByRole('link', { name }).first().click({ timeout: 8000 })]);

/** Per-module "complete it" inside the frame; returns a short note. */
const actions = {
  async quiz(f, item) {
    await f.waitForSelector('body#page-mod-quiz-view');
    await clickSubmit(f, /attempt quiz|continue your attempt/i);
    const value = item.answer === 'wrong' ? '0' : '1';
    const step = (name, p) => p.catch((e) => { throw new Error(`${name}: ${e.message}`); });
    while (await f.$('body#page-mod-quiz-attempt')) {
      for (const r of await f.$$(`input[type=radio][value="${value}"]`)) await r.check();
      await step('next page', Promise.all([f.waitForNavigation(), f.click('#mod_quiz-next-nav')]));
    }
    await step('summary submit', f.getByRole('button', { name: 'Submit all and finish' }).first().click());
    await step('dialog submit', f.getByRole('dialog').getByRole('button', { name: 'Submit all and finish' }).click());
    await f.waitForSelector('body#page-mod-quiz-review', { timeout: 20000 });
    return `attempt ${item.answer}`;
  },
  async assign(f) {
    await clickSubmit(f, /add submission/i);
    await fillEditor(f, 'My drawing is a volcano.');
    await clickSubmit(f, /save changes/i);
    await f.waitForSelector('.submissionstatussubmitted', { timeout: 10000 });
    return 'online text submitted';
  },
  async choice(f) {
    await f.locator('input[name=answer]').first().check();
    await clickSubmit(f, /save my choice/i);
    return 'option saved';
  },
  async forum(f) {
    await f.getByText(/add discussion topic/i).first().click({ timeout: 8000 });
    await f.waitForTimeout(1500);
    if (!(await f.locator('input[name=subject]').isVisible())) {
      bugs.push('inline "Add discussion topic" form does not expand in the frame');
      const forumid = await f.locator('input[name=forum]').first().inputValue();
      await f.goto(`${site}/mod/forum/post.php?forum=${forumid}`);
    }
    await f.locator('input[name=subject]').first().fill('Hello from the island');
    await fillEditor(f, 'Hi everyone!');
    await Promise.all([f.waitForNavigation({ timeout: 15000 }).catch(() => {}), f.locator('input[name=submitbutton], button[name=submitbutton]').first().click({ timeout: 8000 })]);
    await f.waitForTimeout(1500);
    return 'discussion posted';
  },
  async glossary(f) {
    await clickSubmit(f, /add entry/i).catch(() => clickLink(f, /add entry/i));
    await f.fill('#id_concept', 'Basalt');
    await fillEditor(f, 'A dark volcanic rock.');
    await clickSubmit(f, /save changes/i);
    return 'entry added';
  },
  async data(f) {
    await clickLink(f, /add entry/i).catch(() => clickSubmit(f, /add entry/i));
    await f.locator('input[name^=field_]').first().fill('Penguin');
    await clickSubmit(f, /^save$/i);
    return 'entry added';
  },
  async feedback(f) {
    await clickLink(f, /answer the questions/i);
    await f.locator('input[type=radio]').first().check();
    await clickSubmit(f, /submit your answers/i);
    return 'answers submitted';
  },
  async book(f) {
    for (let i = 0; i < 6; i++) {
      const next = f.locator('a.booknext, a[title*="Next" i], a[aria-label*="Next" i]').first();
      if (!(await next.count())) break;
      await Promise.all([f.waitForNavigation({ timeout: 15000 }).catch(() => {}), next.click({ timeout: 5000 })]);
    }
    return 'paged to the last chapter';
  },
  async scorm(f) {
    await clickSubmit(f, /^enter$/i);
    await f.waitForTimeout(4000);
    return `player ${f.url().includes('player.php') ? 'opened' : 'not opened'}`;
  },
  async wiki(f) {
    if (await f.getByRole('button', { name: /create page/i }).count()) {
      await clickSubmit(f, /create page/i);
      await fillEditor(f, 'Our class wiki.');
      await clickSubmit(f, /^save$/i);
    }
    return 'first page created';
  },
  async lesson(f) {
    for (let i = 0; i < 4 && !(await f.getByText(/end of lesson|congratulations/i).count()); i++) {
      await Promise.all([f.waitForNavigation({ timeout: 15000 }).catch(() => {}), f.locator('form button[type=submit], form input[type=submit], .branchbuttoncontainer button').first().click({ timeout: 8000 })]);
    }
    return (await f.getByText(/end of lesson|congratulations/i).count()) ? 'end reached' : 'end not reached';
  },
};

async function closePanel(page) {
  await page.locator('.mooblox-panel-close').click({ timeout: 5000 });
  await page.locator('.mooblox-panel-backdrop').waitFor({ state: 'hidden', timeout: 5000 });
}

const expectState = { view: '1', submit: '1', manual: '1', pass: '2', grade: '1' };
const mediaOf = (s) => (s.mod === 'resource' ? s.file : s.mod === 'url' ? (s.url.includes('youtube') ? 'youtube' : 'external') : '');

/** Plays one activity start to finish; returns whether it ended complete. */
async function play(page, c, item, s, uid, shotted) {
  const mod = item.mod + (mediaOf(s) ? `:${mediaOf(s)}` : '');
  const acts = await worldActs(page);
  const a = acts.find((x) => x.id === item.cmid);
  const repro = `${c.shortname} as kid1: play.php?id=${c.id}, ${s.name}`;
  current.seen = [];
  if (item.hidden || item.stealth) {
    row(mod, item.hidden ? 'hidden cm' : 'stealth cm', a ? 'fail' : 'pass', 'high', `${repro}: ${item.hidden ? 'hidden' : 'stealth'} cm ${a ? 'is in the world' : 'absent'}`);
    return;
  }
  if (!a && s.sectionSpec?.date?.from > 0) {
    row(mod, 'cm in future-dated section', 'pass', '', `${repro}: closed section lists no activities (ACCESS.md)`);
    return;
  }
  if (!a) {
    row(mod, 'shown', 'not-shown', 'high', `${repro}: cm ${item.cmid} missing from get_world`);
    return;
  }
  const lockedForever = s.date?.until < 0 || s.sectionSpec?.date?.from > 0;
  if (lockedForever) {
    const okLock = !a.available && a.lock;
    row(mod, s.date ? 'date until past' : 'section date future', okLock ? 'pass' : 'fail', 'high', `${repro}: available=${a.available} lock='${a.lock}'`);
    return;
  }
  if (!a.available) {
    row(mod, 'unlock in order', 'fail', 'high', `${repro}: still locked after prerequisites: '${a.lock}'`);
    return;
  }
  if (s.after || s.tree || s.grade) {
    row(mod, `unlock ${s.tree ? 'nested AND/OR' : s.grade ? 'grade condition' : 'completion chain'}`, 'pass', '', repro, 'available after prerequisites');
  }
  const walk = await walkUp(page, item.cmid);
  row(mod, 'walk up + prompt', walk.plot && walk.prompt.includes(item.name.slice(0, 20)) ? 'pass' : 'fail', 'medium',
    `${repro}: plot=${walk.plot} prompt='${(walk.prompt || '').slice(0, 60)}'`);
  if (item.mod === 'label') {
    const openable = await page.evaluate(() => !document.querySelector('.mooblox-prompt-go')?.hidden && getComputedStyle(document.querySelector('.mooblox-prompt-go')).display !== 'none');
    row(mod, 'signpost (no page)', 'pass', '', repro, `prompt openable=${openable}`);
    return;
  }
  const before = completionOf(item.cmid, uid);
  let note = '';
  let opened = false;
  try {
    if (walk.plot && walk.prompt.includes(item.name.slice(0, 20))) {
      await page.keyboard.press('KeyE');
    } else {
      await page.evaluate((id) => { const m = window.mooblox; void m.interaction.open(m.store.world.sections.flatMap((x) => x.activities).find((x) => x.id === id)); }, item.cmid);
    }
    await page.locator('.mooblox-panel').waitFor({ state: 'visible', timeout: 5000 });
    opened = true;
    const video = await page.locator('.mooblox-panel .mooblox-video').count();
    if (video) {
      note = `video opener ${await page.locator('.mooblox-panel .mooblox-video').evaluate((n) => n.tagName.toLowerCase())}`;
      await sleep(2000);
    } else {
      const f = await frame(page);
      await f.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      const info = await f.evaluate(() => ({ framed: document.body?.classList.contains('local-mooblox-framed') ?? false, layout: [...(document.body?.classList ?? [])].find((x) => x.startsWith('pagelayout-')) ?? '', title: document.title, err: document.querySelector('.errorbox, .alert-danger')?.textContent?.trim().slice(0, 100) ?? '' })).catch((e) => ({ err: `frame unreadable: ${e.message.slice(0, 60)}` }));
      note = `frame ${info.layout ?? ''} ${info.framed ? 'framed' : 'not-framed'}${info.err ? ` error: ${info.err}` : ''}`;
      const crossOrigin = (s.mod === 'url' && !mediaOf(s).includes('youtube')) || f.url().includes('pluginfile.php') ? 'external' : '';
      if (f.url().includes('pluginfile.php')) note = `file shown by the browser (${f.url().split('/').pop()})`;
      row(mod, 'open in panel', info.err && !crossOrigin ? 'fail' : (info.framed || crossOrigin) ? 'pass' : 'fail', info.err ? 'high' : 'medium', `${repro}: ${note}`);
      if (!shotted.has(mod)) {
        shotted.add(mod);
        await sleep(1200);
        note += ` ${await stills2(page, `${c.shortname}-${item.key}-panel`)}`;
      }
      await sleep(1500);
      if (actions[item.mod] && s.completion !== 'none') {
        const done = await actions[item.mod](f, { ...item, answer: s.answer ?? 'right' }).catch((e) => `action failed: ${e.message.split('\n')[0].slice(0, 90)}`);
        for (const b of bugs.splice(0)) row(mod, `ui inside frame`, 'fail', 'high', `${repro}: ${b}`);
        row(mod, `do ${item.mod}`, done.startsWith('action failed') || done.includes('not reached') ? 'fail' : 'pass', 'high', `${repro}: ${done}`);
      } else if (actions[item.mod] && c.completion === false) {
        const done = await actions[item.mod](f, { ...item, answer: 'right' }).catch((e) => `action failed: ${e.message.split('\n')[0].slice(0, 90)}`);
        for (const b of bugs.splice(0)) row(mod, `ui inside frame`, 'fail', 'medium', `${repro}: ${b}`);
        row(mod, `free-browse use (${item.mod})`, done.startsWith('action failed') ? 'fail' : 'pass', 'medium', `${repro}: ${done}`);
      }
    }
    if (video) {
      row(mod, 'open in panel', 'pass', '', repro, note);
    }
    if (s.completion === 'manual') {
      const btn = page.locator('.mooblox-panel .mooblox-done');
      if (await btn.count()) {
        await btn.click();
        await sleep(1200);
        const thrown = current.seen.filter((e) => e.includes('Reactive components'));
        row(mod, 'manual toggle inside the frame', thrown.length ? 'fail' : 'pass', 'low', `${repro}: ${thrown.length} 'Reactive components' errors`);
      } else {
        row(mod, 'manual toggle', 'fail', 'high', `${repro}: no .mooblox-done button in the panel bar`);
      }
    }
    await closePanel(page);
  } catch (e) {
    row(mod, opened ? 'close panel' : 'open in panel', 'fail', 'high', `${repro}: ${e.message.split('\n')[0].slice(0, 120)}`, await still(page, `${c.shortname}-${item.key}-fail`));
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(500);
  }
  if (current.seen.some((e) => e.includes('webglcontextlost'))) {
    row(mod, 'world keeps its GPU context while the panel is open', 'fail', 'medium', `${repro}: webglcontextlost on the world canvas while '${item.name}' was open`);
    const back = await until(() => page.evaluate(() => (!window.mooblox.stage.renderer.getContext().isContextLost() ? 'restored' : document.querySelector('.mooblox-fallback') ? 'fallback card' : null)), 15000);
    await sleep(1500);
    const broken = current.seen.filter((e) => e.includes('byteLength'));
    row(mod, 'world recovers after a GPU context loss', back && !broken.length ? 'pass' : 'fail', 'medium', `${repro}: ${back ?? 'still lost, no card'}; byteLength errors ${broken.length}`, back === 'restored' ? await still(page, `${c.shortname}-${item.key}-recovered`) : '');
  }
  const back = await page.evaluate(() => ({ panel: !!document.querySelector('.mooblox-panel-backdrop:not([hidden])') && getComputedStyle(document.querySelector('.mooblox-panel-backdrop')).display !== 'none', noReload: window.moobloxNoReload === true }));
  if (!back.noReload) {
    row(mod, 'return to world', 'fail', 'high', `${repro}: the page reloaded on close`);
    await enter(page, c.id);
  }
  if (s.completion !== 'none' && c.completion) {
    const want = expectState[s.completion === 'grade' && s.answer === 'wrong' ? 'grade' : s.completion];
    const db = await until(async () => { const v = completionOf(item.cmid, uid); return v && v !== '0' ? v : null; }, 8000) ?? completionOf(item.cmid, uid);
    const wantOk = s.completion === 'pass' ? db === '2' : db === want || (s.completion === 'grade' && db === '3');
    row(mod, `completion ${s.completion}`, wantOk ? 'pass' : 'fail', 'high', `${repro}: DB completionstate ${before} -> ${db}, want ${want}`);
    const flag = await until(() => page.evaluate((id) => {
      const x = window.mooblox.store.world.sections.flatMap((y) => y.activities).find((y) => y.id === id);
      const done = x && (x.completion.state === 1 || x.completion.state === 2 || (x.completion.state === 3 && x.completion.done === true));
      return x && x.completion.state !== 0 ? { state: x.completion.state, done, prop: window.mooblox.props?.get(id)?.state?.done } : null;
    }, item.cmid), 8000);
    row(mod, 'world progress after close', flag && String(flag.state) === db ? 'pass' : 'fail', 'high', `${repro}: store ${JSON.stringify(flag)} vs DB ${db}`);
    row(mod, 'prop flag matches the store after close', flag && flag.prop === flag.done ? 'pass' : 'fail', 'low', `${repro}: ${JSON.stringify(flag)}`);
  } else if (c.completion === false) {
    row(mod, 'free-browse open (no completion)', opened ? 'pass' : 'fail', 'high', repro, note);
  }
}

async function rewards(page, courseid) {
  return page.evaluate(async (cid) => {
    const r = await fetch(`${M.cfg.wwwroot}/lib/ajax/service.php?sesskey=${M.cfg.sesskey}&info=local_mooblox_get_rewards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ index: 0, methodname: 'local_mooblox_get_rewards', args: { courseid: cid } }]) });
    const [x] = await r.json();
    return x.error ? { error: x.exception?.errorcode } : { xp: x.data.xp, level: x.data.level, enabled: x.data.enabled };
  }, courseid);
}

function runTask(name) {
  execFileSync('bash', ['-c', `cd ~/moodle-envs/5.2/www && ${homedir()}/.claude/skills/moodle-ci/scripts/mexec admin/cli/scheduled_task.php --execute='${name}' >/dev/null 2>&1; ${homedir()}/.claude/skills/moodle-ci/scripts/mexec admin/cli/adhoc_task.php --execute >/dev/null 2>&1 || true`]);
}

async function course(c, cs) {
  current = { course: c.shortname, errors: [], seen: [] };
  const kid1 = manifest.users.mooblox_e2e_kid1;
  const items = specItems(cs);
  const { context, page } = await session('mooblox_e2e_kid1');
  let ms;
  try {
    ms = await enter(page, c.id);
  } catch (e) {
    row('course', 'enter', 'fail', 'blocker', `play.php?id=${c.id}: ${e.message.slice(0, 100)}`, await still(page, `${c.shortname}-enter-fail`));
    await context.close();
    return;
  }
  await sleep(2500);
  const secs = await worldSections(page);
  row('course', 'enter', 'pass', '', `play.php?id=${c.id} as kid1`, `${ms} ms to ready; ${await stills2(page, `${c.shortname}-enter`)}`);
  const xp0 = await rewards(page, c.id);
  for (const s of c.sections) {
    const w = secs.find((x) => x.id === s.id);
    const flow = s.hidden ? 'hidden section' : s.date ? (s.date.from > 0 ? 'section date future' : 'section date past') : s.group ? 'group restricted section (member)'
      : s.after.length ? 'restricted section (locked before)' : s.count === 0 && s.number > 0 ? 'empty section' : 'section shown';
    let ok;
    if (s.hidden) ok = !w;
    else if (s.date?.from > 0) ok = w && !w.available && !!w.lock && w.fenced;
    else if (s.after.length) ok = w && !w.available && !!w.lock;
    else ok = w && w.available;
    if (s.number === 0 && c.sections.length === 1) {
      row('section', 'single section course', w ? 'pass' : 'fail', 'high', `${c.shortname} s0 only`, JSON.stringify(w));
    } else if (!(s.number === 0 && s.count === 0)) {
      row('section', flow, ok ? 'pass' : 'fail', s.hidden ? 'high' : 'medium', `${c.shortname} section ${s.number} '${s.name}': ${JSON.stringify(w ?? null)}`);
    }
  }
  const shotted = new Set();
  const order = c.items;
  for (let i = 0; i < order.length; i++) {
    const item = order[i];
    if (item.mod === 'subsection') {
      const w = await worldActs(page);
      const ws = await worldSections(page);
      const child = order.find((x) => x.parent === item.key);
      row('subsection', 'delegated section shown', ws.some((x) => x.number === child?.section) || w.some((x) => x.id === item.cmid) ? 'pass' : 'not-shown', 'medium',
        `${c.shortname}: subsection '${item.name}' -> world sections ${ws.map((x) => x.number).join(',')}`, `as activity: ${w.some((x) => x.id === item.cmid)}`);
      continue;
    }
    if (c.sections.find((x) => x.number === item.section)?.hidden) {
      const a = (await worldActs(page)).find((x) => x.id === item.cmid);
      row(item.mod, 'cm in hidden section', a ? 'fail' : 'pass', 'high', `${c.shortname}: '${item.name}' in hidden section ${a ? 'shown' : 'absent'}`);
      continue;
    }
    await play(page, c, item, items[item.key], kid1, shotted);
    if (c.shortname === 'mooblox_e2e_m3' && i === Math.floor(order.length / 2)) {
      const beforeIds = JSON.stringify((await worldActs(page)).map((a) => [a.id, a.state, a.available]));
      await page.reload();
      const reloaded = await page.waitForFunction(() => window.mooblox?.store?.world, null, { timeout: 60000 }).then(() => true).catch(() => false);
      if (!reloaded) {
        row('course', 'reload mid-course', 'fail', 'high', `${c.shortname}: world did not come back after reload`, await still(page, `${c.shortname}-reload-fail`));
        await noWhitePage(page, 'reload mid-course', c.shortname);
        await context.close();
        return;
      }
      await page.evaluate(() => (window.moobloxNoReload = true));
      await sleep(2000);
      const afterIds = JSON.stringify((await worldActs(page)).map((a) => [a.id, a.state, a.available]));
      row('course', 'reload mid-course', beforeIds === afterIds ? 'pass' : 'fail', 'high', `${c.shortname}: reload after ${i + 1} cms`, beforeIds === afterIds ? 'same progress and locks' : `${beforeIds.slice(0, 80)} vs ${afterIds.slice(0, 80)}`);
    }
  }
  const sectionsAfter = await worldSections(page);
  const stillLocked = c.sections.filter((s) => s.after.length && !sectionsAfter.find((x) => x.id === s.id)?.available);
  if (c.sections.some((s) => s.after.length)) {
    row('section', 'restricted sections open after prerequisites', stillLocked.length ? 'fail' : 'pass', 'high', `${c.shortname}: still closed ${stillLocked.map((s) => s.number).join(',')}`);
  }
  const xp1 = await rewards(page, c.id);
  const progress = await page.evaluate(() => ({ hud: !!document.querySelector('.mooblox-hud-rewards, [class*=hud-rewards]'), text: document.querySelector('[class*=hud-rewards]')?.textContent?.trim().slice(0, 80) ?? '' }));
  if (c.completion) {
    row('course', 'rewards update (XP)', xp1.xp > (xp0.xp ?? 0) ? 'pass' : 'fail', 'medium', `${c.shortname}: XP ${xp0.xp} -> ${xp1.xp}, level ${xp1.level}`, `HUD ${progress.hud} '${progress.text}'`);
  } else {
    row('course', 'rewards in free-browse course', xp1.error ? 'fail' : 'pass', 'low', `${c.shortname}: get_rewards ${JSON.stringify(xp1)}`, `HUD ${progress.hud}`);
    const hud = await page.evaluate(() => { const e = document.querySelector('.mooblox-hud-rewards'); return e && !e.hidden ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });
    row('course', 'HUD in a free-browse course', /Every quest done|^0 0 \/ /.test(hud) ? 'fail' : 'pass', 'low', `${c.shortname} (completion off): HUD '${hud || 'hidden'}' with XP ${xp1.xp}`, await stills2(page, `${c.shortname}-hud`));
  }
  if (c.criteria !== 'none') {
    const done = () => sql('SELECT timecompleted FROM {course_completions} WHERE course = ? AND userid = ?', c.id, kid1);
    const immediate = done();
    if (!immediate || immediate === 'NULL') runTask('\\core\\task\\completion_regular_task');
    const after = done();
    row('course', 'course completion reached', after && after !== 'NULL' ? 'pass' : 'fail', 'high', `${c.shortname}: course_completions.timecompleted immediate=${immediate} after cron=${after}`);
    try {
      await enter(page, c.id);
    } catch (e) {
      row('course', 're-enter after course end', 'fail', 'high', `${c.shortname}: ${e.message.slice(0, 120)}`);
      await noWhitePage(page, 're-enter after course end', c.shortname);
      await context.close();
      return;
    }
    await sleep(1500);
    const guide = await page.evaluate(() => window.mooblox.guide?.bubble?.textContent?.trim().slice(0, 80) ?? '');
    row('course', 'world shows course done', /done|well|finished|all|everything/i.test(guide) ? 'pass' : 'fail', 'low', `${c.shortname}: guide bubble '${guide}'`, await stills2(page, `${c.shortname}-end`));
    const failed = c.items.filter((i) => items[i.key]?.answer === 'wrong');
    for (const f of failed) {
      const state = await page.evaluate((id) => { const a = window.mooblox.store.world.sections.flatMap((s) => s.activities).find((x) => x.id === id); return a && { state: a.completion.state, done: a.completion.done }; }, f.cmid);
      const hud = await page.evaluate(() => document.querySelector('.mooblox-hud-rewards')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
      const consistent = state?.state === 3 && state.done === true && !guide.includes(f.name) && !/Pass every quiz/.test(hud);
      row(f.mod, 'Guide and HUD after a failed graded quiz', consistent ? 'pass' : 'fail', 'medium', `${c.shortname}: '${f.name}' ${JSON.stringify(state)}, course complete; guide '${guide}', HUD '${hud}'`);
    }
  } else {
    row('course', 'free-browse end state', 'pass', '', `${c.shortname}: no completion criteria`, await stills2(page, `${c.shortname}-end`));
  }
  await context.close();
}

async function others(m1) {
  current = { course: m1.shortname, errors: [], seen: [] };
  const t = await session('mooblox_e2e_teacher');
  try {
    await enter(t.page, m1.id);
    await sleep(2000);
    const acts = await worldActs(t.page);
    const secs = await worldSections(t.page);
    const hidden = m1.items.filter((i) => i.hidden || i.stealth || i.key === 'secret');
    row('role', 'teacher sees hidden + stealth cms', hidden.every((h) => acts.some((a) => a.id === h.cmid)) ? 'pass' : 'fail', 'medium',
      `teacher play.php?id=${m1.id}: hidden/stealth/secret present ${hidden.map((h) => `${h.key}=${acts.some((a) => a.id === h.cmid)}`).join(' ')}`);
    row('role', 'teacher all sections open', secs.every((s) => s.available) ? 'pass' : 'fail', 'medium', `teacher: closed ${secs.filter((s) => !s.available).map((s) => s.number).join(',')}`, await stills2(t.page, 'm1-teacher'));
    const q = m1.items.find((i) => i.key === 'quiz');
    const walk = await walkUp(t.page, q.cmid);
    await t.page.keyboard.press('KeyE');
    const f = await frame(t.page).catch(() => null);
    const ok = f && await f.waitForSelector('body#page-mod-quiz-view', { timeout: 10000 }).then(() => true).catch(() => false);
    row('role', 'teacher opens quiz in panel', ok ? 'pass' : 'fail', 'medium', `teacher walk ${walk.plot}`);
    await closePanel(t.page).catch(() => {});
  } catch (e) {
    row('role', 'teacher enter', 'fail', 'high', e.message.slice(0, 120), await still(t.page, 'm1-teacher-fail'));
  }
  await t.context.close();
  const k = await session('mooblox_e2e_kid2', 400, 860);
  try {
    await enter(k.page, m1.id);
    await sleep(2500);
    const secs = await worldSections(k.page);
    const acts = await worldActs(k.page);
    const red = m1.sections.find((s) => s.group);
    const w = secs.find((s) => s.id === red.id);
    row('section', 'group restricted section (non-member)', w && !w.available && w.lock ? 'pass' : w ? 'fail' : 'not-shown', 'high', `kid2 (no group) play.php?id=${m1.id}: ${JSON.stringify(w ?? null)}`);
    const doneCount = acts.filter((a) => a.state !== 0).length;
    row('role', 'second student fresh progress', doneCount === 0 ? 'pass' : 'fail', 'high', `kid2: ${doneCount} cms done in the world (kid1 completed many)`);
    const assign = m1.items.find((i) => i.key === 'assign');
    const a = acts.find((x) => x.id === assign.cmid);
    row('assign', 'nested AND/OR locked for fresh student', a && !a.available ? 'pass' : 'fail', 'high', `kid2: ${JSON.stringify(a ? { available: a.available, lock: a.lock } : null)}`, await still(k.page, 'm1-kid2-400'));
    const pg = m1.items.find((i) => i.key === 'page');
    const walk = await walkUp(k.page, pg.cmid);
    await k.page.keyboard.press('KeyE');
    const f = await frame(k.page).catch(() => null);
    await sleep(1500);
    row('page', 'open in panel at 400 px', f ? 'pass' : 'fail', 'medium', `kid2 400x860 walk=${walk.plot}`, await still(k.page, 'm1-kid2-panel-400'));
    await closePanel(k.page).catch(() => {});
    row('page', 'completion view at 400 px', completionOf(pg.cmid, manifest.users.mooblox_e2e_kid2) === '1' ? 'pass' : 'fail', 'high', `kid2 page cm ${pg.cmid}`);
  } catch (e) {
    row('role', 'second student', 'fail', 'high', e.message.slice(0, 120), await still(k.page, 'm1-kid2-fail'));
  }
  await k.context.close();
}

try {
  for (const c of manifest.courses) {
    if (only && !only.split(',').includes(c.shortname)) continue;
    await course(c, spec.courses.find((x) => x.shortname === c.shortname));
    await browser.close();
    browser = await launch();
  }
  if (!only || only.includes('others')) {
    await others(manifest.courses.find((c) => c.shortname === 'mooblox_e2e_m1'));
  }
} finally {
  await browser.close();
}
