// Headless checks of the rewards UI on rewards.html: node tools/rewards.mjs <hud|levelup|wardrobe|pet|collect> [outdir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const [mode = 'hud', out = '/tmp/mooblox-rewards'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const WIDTHS = [[400, 860], [768, 1024], [1366, 768], [1920, 1080], [2560, 1440]];
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const base = `${server.resolvedUrls.local[0]}rewards.html`;
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

/** Opens the dev page at a size and waits for the rewards wiring. */
async function open(w, h, query = '', extra = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 800, ...extra });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${base}?nokids&${query}`);
  await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  return page;
}

/** Bounding box of a selector, or null when absent or hidden. */
const box = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e || e.hidden) return null;
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
}, sel);

/** Opens activity `cmid` through the world's interaction, then closes the panel with Esc. */
async function openAndClose(page, cmid) {
  await page.evaluate((id) => {
    const a = window.mooblox.world.sections.flatMap((s) => s.activities).find((x) => x.id === id);
    void window.mooblox.interaction.open(a);
  }, cmid);
  const panel = page.locator('.mooblox-panel-backdrop');
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden', timeout: 5000 });
}

/** Counts level-up cards shown from now on (a MutationObserver on the page). */
const countCards = (page) => page.evaluate(() => {
  window.__cards = 0;
  new MutationObserver((rs) => {
    for (const r of rs) for (const n of r.addedNodes) if (n.classList?.contains('mooblox-levelup')) window.__cards++;
  }).observe(document.body, { childList: true, subtree: true });
});

/** Extra draws / triangles / programs of the plan's section 8 per tier (whole rewards layer). */
const EXTRA = { low: { calls: 5, tris: 4000, programs: 2 }, medium: { calls: 7, tris: 8000, programs: 2 }, high: { calls: 8, tris: 15000, programs: 3 }, xhigh: { calls: 10, tris: 30000, programs: 3 } };

/** Renders once with `name` hidden and once shown; returns the difference in draws, triangles and programs. */
const extraOf = (page, name) => page.evaluate((n) => {
  const v = window.mooblox;
  const r = v.stage.renderer;
  const g = v.stage.scene.getObjectByName(n);
  const measure = (on) => {
    g.visible = on;
    v.stage.render();
    return { calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length };
  };
  const off = measure(false);
  const on = measure(true);
  const own = r.info.programs.filter((p) => p.cacheKey.includes(`mooblox-${n.replace(/s$/, '')}`)).length;
  return { calls: on.calls - off.calls, tris: on.tris - off.tris, programs: own };
}, name);

/** Puts the player `back` metres from a spot on the side towards its district centre, facing it. */
const standBy = (page, key, back) => page.evaluate(([k, b]) => {
  const v = window.mooblox;
  const s = v.rewards.collectibles.spots.find((x) => x.key === k);
  const z = v.layout.zones.find((x) => x.sectionId === s.sectionId);
  const others = v.rewards.collectibles.spots.filter((x) => x.key !== k);
  const d = Math.hypot(z.x - s.x, z.z - s.z);
  const a0 = d > 0.5 ? Math.atan2(z.z - s.z, z.x - s.x) : 0;
  let best = [s.x, s.z, -1];
  for (let i = 0; i < 16 && b > 1; i++) {
    const a = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8);
    const [x, zz] = [s.x + Math.cos(a) * b, s.z + Math.sin(a) * b];
    const clear = Math.min(99, ...others.map((o) => Math.hypot(o.x - x, o.z - zz)));
    if (Math.hypot(x - z.x, zz - z.z) < z.radius - 1 && clear > best[2]) best = [x, zz, clear];
    if (clear > 2.5) break;
  }
  v.player.teleport(best[0], best[1], Math.atan2(s.x - best[0], s.z - best[1]));
  return { x: s.x, z: s.z };
}, [key, back]);

/** Frames a spot for a still: the camera `dist` m away on the clearest side, the player beside the spot. */
const frameSpot = (page, key, dist) => page.evaluate(([k, dd]) => {
  const v = window.mooblox;
  const s = v.rewards.collectibles.spots.find((x) => x.key === k);
  const obstacles = v.dressing.obstacles;
  let best = [0, -1];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * 2 * Math.PI;
    let clear = 99;
    for (let t = 0.3; t <= 1; t += 0.1) {
      const [x, z] = [s.x + Math.cos(a) * dd * t, s.z + Math.sin(a) * dd * t];
      for (const o of obstacles) clear = Math.min(clear, Math.hypot(o.x - x, o.z - z) - o.r);
    }
    if (clear > best[1]) best = [a, clear];
  }
  const [cx, cz] = [s.x + Math.cos(best[0]) * dd, s.z + Math.sin(best[0]) * dd];
  // The player stands beside the line of sight, clear of every other collectible.
  let stand = [cx, cz, -1];
  for (const side of [1.3, -1.3, 1.8, -1.8]) {
    const a = best[0] + Math.PI / 2;
    const [x, z] = [s.x + Math.cos(best[0]) * 2.2 + Math.cos(a) * side, s.z + Math.sin(best[0]) * 2.2 + Math.sin(a) * side];
    const clear = Math.min(99, ...v.rewards.collectibles.spots.map((o) => Math.hypot(o.x - x, o.z - z)));
    if (clear > stand[2]) stand = [x, z, clear];
  }
  v.player.teleport(stand[0], stand[1], Math.atan2(s.x - cx, s.z - cz));
  window.__still?.();
  window.__still = v.onFrame(() => {
    v.stage.camera.position.set(cx, 2.5, cz);
    v.stage.camera.lookAt(s.x, 1.1, s.z);
  });
}, [key, dist]);

/** Frames the trophy hall from its open side; the player stands beside the camera. */
const frameHall = (page) => page.evaluate(() => {
  const v = window.mooblox;
  const s = v.dressing.hall;
  const [dx, dz] = [Math.sin(s.face), Math.cos(s.face)];
  const [cx, cz] = [s.x + dx * (s.r + 4.2), s.z + dz * (s.r + 4.2)];
  v.player.teleport(s.x + dx * (s.r + 1.4) + dz * 2.6, s.z + dz * (s.r + 1.4) - dx * 2.6, s.face + Math.PI);
  window.__still?.();
  window.__still = v.onFrame(() => {
    v.stage.camera.position.set(cx, 3, cz);
    v.stage.camera.lookAt(s.x, 1.2, s.z);
  });
  return s;
});

/** Whether a capsule standing on the back column of the hall is pushed out (the hall is solid). */
const hallSolid = (page) => page.evaluate(() => {
  const v = window.mooblox;
  const s = v.dressing.hall;
  const ring = s.r - 0.3;
  const a = v.player.avatar.root.position.clone().set(-ring * Math.sin(s.face), 0.6, -ring * Math.cos(s.face));
  a.x += s.x;
  a.z += s.z;
  const b = a.clone();
  b.y += 1;
  return v.collider.resolve(a, b, 0.4).length() > 0.05;
});

/** Frames the class goal monument from the plaza side. */
const frameMonument = (page) => page.evaluate(() => {
  const v = window.mooblox;
  const s = v.dressing.monument;
  const [dx, dz] = [Math.sin(s.face), Math.cos(s.face)];
  window.__still?.();
  window.__still = v.onFrame(() => {
    v.stage.camera.position.set(s.x + dx * 6 - dz * 1.5, 3.2, s.z + dz * 6 + dx * 1.5);
    v.stage.camera.lookAt(s.x, 2, s.z);
  });
  return s;
});

const modes = {
  async goal() {
    const page = await open(1366, 768, 'goal=5/6&xp=60&quality=high');
    await page.waitForFunction(() => window.mooblox.rewards.goal?.monument, null, { timeout: 20000 });
    const site = await frameMonument(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, 'goal-progress-1366.png') });
    check((await page.evaluate(() => window.mooblox.rewards.goal.shows)) === 0, `5/6: monument on the plaza (${site.x.toFixed(1)},${site.z.toFixed(1)}), no fireworks`);
    await page.evaluate(() => window.__still?.());
    await openAndClose(page, 42);
    await page.waitForFunction(() => window.mooblox.rewards.goal.shows === 1, null, { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(900);
    const live = await page.evaluate(() => ({ shows: window.mooblox.rewards.goal.shows, points: !!window.mooblox.stage.scene.getObjectByName('fireworks'),
      lit: window.mooblox.stage.scene.getObjectByName('monument')?.userData.reached === true, programs: window.mooblox.stage.renderer.info.programs.filter((p) => p.cacheKey.includes('mooblox-fireworks')).length }));
    check(live.shows === 1 && live.points && live.lit, `goal reached: monument lit, fireworks once (${live.shows}), ${live.programs} extra program while they fly`);
    await page.screenshot({ path: join(out, 'goal-fireworks-1366.png') });
    await page.waitForTimeout(4500);
    check(!(await page.evaluate(() => !!window.mooblox.stage.scene.getObjectByName('fireworks'))), 'fireworks removed after the show');
    await openAndClose(page, 43);
    await page.waitForTimeout(2000);
    check((await page.evaluate(() => window.mooblox.rewards.goal.shows)) === 1, 'another completion: no second show');
    await page.reload();
    await page.waitForFunction(() => window.mooblox?.rewards?.goal?.monument, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    check((await page.evaluate(() => window.mooblox.rewards.goal.shows)) === 0, 'reload: no fireworks again');
    await page.close();
    for (const [tier, w, h] of [['low', 400, 860], ['medium', 1366, 768], ['high', 1366, 768], ['xhigh', 1366, 768]]) {
      const p = await open(w, h, `goal=6/6&trophies=3&collect=all&quality=${tier}`);
      await p.waitForFunction(() => window.mooblox.rewards.goal?.monument && window.mooblox.rewards.hall?.mesh, null, { timeout: 20000 });
      await p.waitForTimeout(2200);
      if (tier === 'low') {
        const burst = await p.evaluate(() => ({ dom: document.querySelectorAll('.mooblox-burst i').length, points: !!window.mooblox.stage.scene.getObjectByName('fireworks') }));
        check(burst.dom > 0 && !burst.points, `low: page burst (${burst.dom} sparks), no WebGL fireworks`);
        await p.screenshot({ path: join(out, 'goal-burst-low-400.png') });
      }
      await p.waitForTimeout(3500);
      const all = {};
      for (const name of ['collectibles', 'trophy-hall', 'monument']) all[name] = await extraOf(p, name);
      const sum = Object.values(all).reduce((a, e) => ({ calls: a.calls + e.calls, tris: a.tris + e.tris, programs: a.programs + e.programs }), { calls: 0, tris: 0, programs: 0 });
      const b = EXTRA[tier];
      check(all.monument.calls >= 1 && all.monument.programs === 0, `${tier}: monument ${all.monument.calls} draws, ${all.monument.tris} tris, no new program`);
      check(sum.calls <= b.calls && sum.tris <= b.tris && sum.programs <= b.programs, `${tier}: collectibles + hall + monument from the spawn ${sum.calls} draws, ${sum.tris} tris, ${sum.programs} programs (budget ${b.calls}/${b.tris}/${b.programs})`);
      if (tier === 'high') {
        await frameMonument(p);
        await p.waitForTimeout(800);
        await p.screenshot({ path: join(out, 'goal-lit-1366.png') });
      }
      await p.close();
    }
    const off = await open(1366, 768, 'goal=6/6&off');
    await off.waitForTimeout(2500);
    check(await off.evaluate(() => !window.mooblox.stage.scene.getObjectByName('monument') && !document.querySelector('.mooblox-burst')), 'rewards off: no monument, no fireworks');
    await off.close();
  },
  async hall() {
    for (const [tier, w, h] of [['low', 400, 860], ['medium', 1366, 768], ['high', 1366, 768], ['xhigh', 1366, 768]]) {
      const p = await open(w, h, `trophies=3&quality=${tier}`);
      await p.waitForFunction(() => window.mooblox.rewards.hall?.mesh, null, { timeout: 20000 });
      const site = await frameHall(p);
      await p.waitForTimeout(1200);
      const shown = await p.evaluate(() => window.mooblox.rewards.hall.shown);
      check(shown === 3, `${tier}: 3 badges on pedestals (site r ${site.r} at ${site.x.toFixed(1)},${site.z.toFixed(1)})`);
      const e = await extraOf(p, 'trophy-hall');
      const b = EXTRA[tier];
      check(e.calls >= 1 && e.calls <= b.calls && e.tris <= b.tris && e.programs <= b.programs, `${tier}: hall adds ${e.calls} draws, ${e.tris} tris, ${e.programs} programs (budget ${b.calls}/${b.tris}/${b.programs})`);
      await p.screenshot({ path: join(out, `hall-${tier}-${w}.png`) });
      if (tier === 'high') check(await hallSolid(p), 'high: the hall columns block the player');
      await p.close();
    }
    for (const [n, want] of [[0, 0], [14, 8]]) {
      const p = await open(1366, 768, `trophies=${n}&quality=high`);
      await p.waitForFunction(() => window.mooblox.rewards.hall?.mesh, null, { timeout: 20000 });
      await frameHall(p);
      await p.waitForTimeout(1200);
      check((await p.evaluate(() => window.mooblox.rewards.hall.shown)) === want, `${n} trophies: ${want} badges stand${n ? ' and a +6 plaque' : ', one empty pedestal'}`);
      await p.screenshot({ path: join(out, `hall-${n}-1366.png`) });
      await p.close();
    }
    const off = await open(1366, 768, 'trophies=3&off');
    await off.waitForTimeout(800);
    check(await off.evaluate(() => !window.mooblox.stage.scene.getObjectByName('trophy-hall')), 'rewards off: no hall');
    await off.close();
  },
  async book() {
    for (const [w, h] of WIDTHS) {
      const page = await open(w, h, 'collect=all');
      if (w === 1366) {
        // Pick up one gem first: the album must show it.
        await page.waitForFunction(() => window.mooblox.rewards.collectibles?.spots.length > 0, null, { timeout: 20000 });
        const key = await page.evaluate(() => window.mooblox.rewards.collectibles.spots.find((s) => s.kind === 'gem').key);
        await standBy(page, key, 0.3);
        await page.waitForFunction((k) => window.mooblox.rewards.store.rewards.collectibles.find((c) => c.key === k).found, key, { timeout: 5000 }).catch(() => null);
        page.__gem = key;
      }
      await page.keyboard.press('KeyB');
      await page.locator('.mooblox-book-tabs').waitFor({ timeout: 5000 });
      const tabs = await page.evaluate(() => [...document.querySelectorAll('.mooblox-book-tab')].map((t) => t.textContent));
      check(tabs.join() === 'Course,Quests,Collection,Trophies', `${w}: book tabs ${tabs.join('/')}`);
      for (const id of ['quests', 'collection', 'trophies']) {
        await page.click(`.mooblox-book-tab[data-page="${id}"]`);
        await page.waitForTimeout(250);
        const state = await page.evaluate(() => {
          const body = document.querySelector('.mooblox-book-page');
          return {
            scroll: document.documentElement.scrollWidth,
            inner: body.firstElementChild.scrollWidth <= body.firstElementChild.clientWidth + 1,
            text: body.textContent.replace(/\s+/g, ' ').trim(),
            quests: body.querySelectorAll('.mooblox-bookr-quest').length,
            found: [...body.querySelectorAll('.mooblox-bookr-slot.is-found')].map((x) => x.dataset.key),
            slots: body.querySelectorAll('.mooblox-bookr-slot').length,
            trophies: body.querySelectorAll('.mooblox-bookr-trophy').length,
          };
        });
        check(state.scroll === w && state.inner, `${w} ${id}: no horizontal scroll`);
        if (id === 'quests') check(state.quests === 10 && /^Read every page ?3\/4 ?Unlocks: Pirate hat/.test(state.text), `${w} quests: 10 cards, first "${state.text.slice(0, 40)}"`);
        if (id === 'collection') {
          check(state.slots === 8, `${w} collection: 8 slots (${state.slots})`);
          if (w === 1366) check(state.found.length === 1 && state.found[0] === page.__gem && /1 of 8 found/.test(state.text), `1366 collection: the picked-up ${page.__gem} shows found (${state.found})`);
        }
        if (id === 'trophies') check(state.trophies === 1 && /Bookworm/.test(state.text), `${w} trophies: Bookworm on the shelf`);
        await page.screenshot({ path: join(out, `book-${id}-${w}.png`) });
      }
      await page.close();
    }
    const off = await open(1366, 768, 'off');
    await off.keyboard.press('KeyB');
    await off.waitForSelector('.mooblox-book', { timeout: 5000 });
    check(await off.evaluate(() => !document.querySelector('.mooblox-book-tabs')), 'rewards off: the book has no tabs');
    await off.close();
  },
  async collect() {
    const page = await open(1366, 768, 'collect=all&quality=high');
    await page.waitForFunction(() => window.mooblox.rewards.collectibles?.spots.length > 0, null, { timeout: 20000 });
    const spots = await page.evaluate(() => window.mooblox.rewards.collectibles.spots.map((s) => s.kind));
    const kinds = ['gem', 'crystal', 'star'].map((k) => spots.filter((x) => x === k).length);
    check(spots.length === 8 && kinds.join() === '4,3,1', `demo course: ${spots.length} spots placed (gems/crystals/stars ${kinds.join('/')})`);
    const key = await page.evaluate(() => window.mooblox.rewards.collectibles.spots.find((s) => s.kind === 'gem').key);
    for (const kind of ['gem', 'crystal', 'star']) {
      const k = await page.evaluate((kk) => window.mooblox.rewards.collectibles.spots.find((s) => s.kind === kk).key, kind);
      await frameSpot(page, k, 5);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(out, `collect-${kind}-1366.png`) });
    }
    await page.evaluate(() => window.__still());
    const before = await page.evaluate(() => window.mooblox.rewards.store.rewards.collectibles.filter((c) => c.found).length);
    await standBy(page, key, 0.3);
    await page.waitForSelector('.mooblox-collect-toast.is-on', { timeout: 5000 }).catch(() => null);
    const toast = await page.evaluate(() => document.querySelector('.mooblox-collect-toast.is-on')?.textContent);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, 'collect-pickup-1366.png') });
    const after = await page.evaluate((k) => {
      const v = window.mooblox;
      return {
        found: v.rewards.store.rewards.collectibles.filter((c) => c.found).length,
        key: v.rewards.store.rewards.collectibles.find((c) => c.key === k).found,
        server: v.gateway.rewards.collectibles.find((c) => c.key === k).found,
        remaining: v.rewards.collectibles.layer.remaining.length,
      };
    }, key);
    check(after.found === before + 1 && after.key && after.server, `walking into ${key} claims it: album found ${before} -> ${after.found}, server found ${after.server}`);
    check(after.remaining === spots.length - after.found, `the gem left the world (${after.remaining} left of ${spots.length}, ${after.found} found)`);
    check(new RegExp(`Gem found!.*${after.found} of 8 found`).test(toast ?? ''), `toast "${toast}"`);
    await page.close();
    for (const [tier, w, h] of [['low', 400, 860], ['medium', 1366, 768], ['high', 1366, 768], ['xhigh', 1366, 768]]) {
      const p = await open(w, h, `collect=all&quality=${tier}`);
      await p.waitForFunction(() => window.mooblox.rewards.collectibles?.spots.length > 0, null, { timeout: 20000 });
      const k = await p.evaluate(() => window.mooblox.rewards.collectibles.spots.find((s) => s.kind === 'star').key);
      await standBy(p, k, 4);
      await p.waitForTimeout(1000);
      const e = await extraOf(p, 'collectibles');
      const b = EXTRA[tier];
      // xhigh draws each mesh twice (the GTAO normal pass).
      check(e.calls >= 1 && e.calls <= (tier === 'xhigh' ? 6 : 3) && e.calls <= b.calls && e.tris <= b.tris && e.programs <= b.programs, `${tier}: collectibles add ${e.calls} draws, ${e.tris} tris, ${e.programs} programs (budget ${b.calls}/${b.tris}/${b.programs})`);
      if (tier === 'low') {
        await frameSpot(p, k, 5);
        await p.waitForTimeout(800);
        await p.screenshot({ path: join(out, 'collect-low-400.png') });
      }
      await p.close();
    }
    const off = await open(1366, 768, 'collect=all&off');
    await off.waitForTimeout(800);
    check(await off.evaluate(() => !window.mooblox.stage.scene.getObjectByName('collectibles') && !document.querySelector('.mooblox-collect-toast')), 'rewards off: no collectibles, no toast');
    await off.close();
  },
  async hud() {
    for (const [w, h] of WIDTHS) {
      const page = await open(w, h, 'weeks=3');
      const b = await box(page, '.mooblox-hud-rewards');
      const book = await box(page, '.mooblox-hud-book');
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
      const text = await page.evaluate(() => document.querySelector('.mooblox-hud-rewards')?.textContent?.replace(/\s+/g, ' ').trim());
      check(!!b && b.x >= 12 && b.right <= w - 12 && b.y >= book.bottom, `${w}: HUD inside the screen under Book (${b && Math.round(b.w)}x${b && Math.round(b.h)})`);
      check(scroll === w, `${w}: no horizontal scroll (${scroll})`);
      check(/0.*45 \/ 50 XP.*3.*Read every page.*3\/4/.test(text ?? ''), `${w}: shows level 0, 45 / 50 XP, weeks 3, quest 3/4`);
      await page.screenshot({ path: join(out, `hud-${w}.png`) });
      await page.close();
    }
    const off = await open(1366, 768, 'off');
    check((await off.evaluate(() => document.querySelectorAll('.mooblox-hud-rewards').length)) === 0, 'rewards off: no HUD built');
    await off.close();
  },
  async hats() {
    for (const row of ['', '&row=0', '&row=1']) {
      const page = await open(1366, 768, `scene=hats${row}`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(out, `hats${row.replace('&row=', '-row')}-1366.png`) });
      await page.close();
    }
  },
  async wardrobe() {
    // Top of the player's bind-space mesh: the head ends at 2.7, hair crowns below 2.95, the cap reaches 3.04.
    const tris = (page) => page.evaluate(() => {
      let top = 0;
      window.mooblox.player.avatar.root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const p = o.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
      });
      return Math.round(top * 100) / 100;
    });
    for (const [w, h] of WIDTHS) {
      const page = await open(w, h);
      await page.click('.mooblox-hud-avatar');
      await page.click('.mooblox-creator-tab[data-tab="wardrobe"]');
      await page.waitForSelector('.mooblox-ward-item');
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
      const tabs = await page.evaluate(() => [...document.querySelectorAll('.mooblox-creator-tab')].map((b) => b.scrollWidth <= b.clientWidth + 1 || `${b.textContent} ${b.scrollWidth}>${b.clientWidth}`));
      if (!tabs.every((t) => t === true)) console.log(tabs);
      check(scroll === w && tabs.every((t) => t === true), `${w}: wardrobe fits (scrollW ${scroll}, ${tabs.length} tabs, labels fit)`);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(out, `wardrobe-${w}.png`) });
      await page.close();
    }
    const page = await open(1366, 768);
    const before = await tris(page);
    await page.click('.mooblox-hud-avatar');
    await page.click('.mooblox-creator-tab[data-tab="wardrobe"]');
    const locked = page.locator('.mooblox-ward-item[data-item="hat-glasses"]');
    check((await locked.isDisabled()) && (await locked.innerText()).includes('Finish Lava lab to unlock'), `locked item disabled with its sentence ("${(await locked.innerText()).replace(/\s+/g, ' ')}")`);
    await page.click('.mooblox-ward-item[data-item="hat-cap"]');
    check((await page.getAttribute('.mooblox-ward-item[data-item="hat-cap"]', 'aria-pressed')) === 'true', 'tap an unlocked hat marks it worn');
    await page.click('.mooblox-ward-item[data-item="outfit-candy"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, 'wardrobe-preview-1366.png') });
    await page.click('.mooblox-creator-save');
    await page.waitForTimeout(800);
    const after = await tris(page);
    const saved = await page.evaluate(async () => (await window.mooblox.gateway.getRewards(window.mooblox.world.courseId)).look);
    check(before < 2.95 && after > 3, `player wears the hat (mesh top ${before} -> ${after} m)`);
    check(saved.hat === 'hat-cap' && saved.outfit === 'outfit-candy', `look saved to Moodle (${JSON.stringify(saved)})`);
    await page.evaluate(() => {
      const p = window.mooblox.player;
      p.camera.yaw = p.camera.yaw + Math.PI * 0.85;
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(out, 'hat-world-1366.png') });
    await page.close();
    const saved2 = await open(1366, 768, 'hat=hat-cap');
    check((await tris(saved2)) > 3, 'a saved hat from get_rewards is worn at load');
    await saved2.close();
    const off = await open(1366, 768, 'off');
    await off.click('.mooblox-hud-avatar');
    check((await off.locator('.mooblox-creator-tab[data-tab="wardrobe"]').count()) === 0, 'rewards off: no Wardrobe tab');
    await off.close();
  },
  async pet() {
    const pets = (page) => page.evaluate(() => {
      let n = 0;
      window.mooblox.view.stage.scene.traverse((o) => { if (o.name.startsWith('pet:')) n++; });
      return n;
    });
    const page = await open(1366, 768, 'pet=pet-dog&quality=medium');
    await page.waitForFunction(() => !!window.mooblox.rewards.pet.pet, null, { timeout: 20000 });
    const shape = await page.evaluate(() => {
      const p = window.mooblox.rewards.pet.pet;
      const meshes = [];
      p.root.traverse((o) => o.isMesh && meshes.push(o));
      return { draws: meshes.length, shadow: meshes.some((m) => m.castShadow), skinned: meshes.every((m) => m.isSkinnedMesh) };
    });
    check(shape.draws === 1 && shape.skinned && !shape.shadow, `medium: pet is 1 skinned draw, no shadow (${JSON.stringify(shape)})`);
    await page.screenshot({ path: join(out, 'pet-idle-1366.png') });
    const gap = () => page.evaluate(() => {
      const a = window.mooblox.player.avatar.root.position;
      const b = window.mooblox.rewards.pet.pet.root.position;
      return { d: Math.hypot(a.x - b.x, a.z - b.z), x: a.x, z: a.z };
    });
    const start = await gap();
    let worst = 0;
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(250);
      worst = Math.max(worst, (await gap()).d);
      if (i === 8) await page.screenshot({ path: join(out, 'pet-walk-1366.png') });
    }
    await page.keyboard.down('ShiftLeft');
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(250);
      worst = Math.max(worst, (await gap()).d);
    }
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    const end = await gap();
    const walked = Math.hypot(end.x - start.x, end.z - start.z);
    check(walked > 8, `the kid walked and ran ${walked.toFixed(1)} m`);
    check(worst <= 2, `pet stays within 2 m of the kid (max ${worst.toFixed(2)} m)`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, 'pet-stop-1366.png') });
    await page.close();
    const high = await open(1366, 768, 'pet=pet-cat&quality=high');
    await high.waitForFunction(() => !!window.mooblox.rewards.pet.pet, null, { timeout: 20000 });
    check(await high.evaluate(() => window.mooblox.rewards.pet.pet.mesh.castShadow), 'high: the pet casts a shadow');
    await high.evaluate(() => window.mooblox.player.faceCamera());
    await high.waitForTimeout(2000);
    await high.screenshot({ path: join(out, 'pet-high-1366.png') });
    await high.close();
    const low = await open(400, 860, 'pet=pet-dog&quality=low');
    await low.waitForTimeout(1500);
    const badge = await box(low, '.mooblox-hud-pet');
    check((await pets(low)) === 0 && !!badge, `low: no pet in the world, HUD badge instead (${badge && Math.round(badge.w)} px)`);
    await low.screenshot({ path: join(out, 'pet-low-400.png') });
    await low.close();
    const off = await open(1366, 768, 'pet=pet-dog&off');
    await off.waitForTimeout(1500);
    check((await pets(off)) === 0 && !(await box(off, '.mooblox-hud-pet')), 'rewards off: no pet, no badge');
    await off.close();
  },
  async levelup() {
    for (const [w, h] of [[1366, 768], [400, 860]]) {
      const page = await open(w, h);
      await countCards(page);
      await openAndClose(page, 42);
      await page.waitForSelector('.mooblox-levelup', { timeout: 5000 }).catch(() => null);
      const text = await page.evaluate(() => document.querySelector('.mooblox-levelup')?.textContent?.replace(/\s+/g, ' ').trim());
      check(/Level 1!.*You unlocked: Explorer hat/.test(text ?? ''), `${w}: complete an activity -> card "${text}"`);
      check(await page.evaluate(() => !!document.querySelector('.mooblox-levelup canvas')), `${w}: confetti canvas while moving`);
      const hud = await page.evaluate(() => document.querySelector('.mooblox-hud-rewards')?.textContent?.replace(/\s+/g, ' '));
      check(/55 \/ 150 XP/.test(hud ?? ''), `${w}: HUD now level 1, 55 / 150 XP`);
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(out, `levelup-${w}.png`) });
      await page.keyboard.press('Space');
      check(!(await page.evaluate(() => !!document.querySelector('.mooblox-levelup'))), `${w}: any key skips`);
      await openAndClose(page, 43);
      await page.waitForTimeout(800);
      check((await page.evaluate(() => window.__cards)) === 1, `${w}: shown once (another completion at the same level adds none)`);
      await page.reload();
      await page.waitForFunction(() => window.mooblox?.probe?.ready, null, { timeout: 60000 });
      await page.waitForTimeout(800);
      check(!(await page.evaluate(() => !!document.querySelector('.mooblox-levelup'))), `${w}: no card on reload`);
      await page.close();
    }
    const calm = await open(1366, 768, '', { reducedMotion: 'reduce' });
    await openAndClose(calm, 42);
    await calm.waitForSelector('.mooblox-levelup', { timeout: 5000 }).catch(() => null);
    const state = await calm.evaluate(() => ({ card: !!document.querySelector('.mooblox-levelup.is-calm .mooblox-levelup-card'), canvas: !!document.querySelector('.mooblox-levelup canvas') }));
    check(state.card && !state.canvas, 'reduced motion: static card, no confetti');
    await calm.screenshot({ path: join(out, 'levelup-reduced-1366.png') });
    await calm.mouse.click(30, 700);
    check(!(await calm.evaluate(() => !!document.querySelector('.mooblox-levelup'))), 'reduced motion: a tap skips');
    await calm.close();
  },
};

try {
  await modes[mode]();
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
