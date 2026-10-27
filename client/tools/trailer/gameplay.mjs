// The gameplay showcase's shot list (T1408): `node tools/trailer/capture.mjs <dir> --shots tools/trailer/gameplay.mjs ...`.
// Kid shots run as mooblox_e2e_kid2, Moodle shots (`moodle-*`, --stills, --size 1920x2160) as mooblox_e2e_teacher.
// Same shape as shots.mjs; trailer shots are reused by name. `unlock` is the one shot that writes: it ticks a manual completion
// of the fixture kid and its teardown unticks it.
import { SHOTS as TRAILER } from './shots.mjs';

const ROCKS = 90;
const PLANT = 92;
const play = (course) => `/local/mooblox/play.php?id=${course}&quality=xhigh`;
const WORLD_READY = `() => { const m = window.mooblox; return !!m?.view && document.querySelector('#mooblox-root')?.dataset.ready === '1' && m.view.streaming.pending === 0; }`;
const SETTLE = 300;
const reuse = (name) => TRAILER.find((s) => s.name === name);

/** Fixture names on screen swapped for friendly ones (pages and ajax replies only). */
export const RENAME = {
  'E2E S1 Tiny topics': 'Art club',
  'E2E S2 Single section library': 'Library corner',
  'E2E S3 Weekly grades and dates': 'Maths weeks',
  'E2E M1 Every module': 'Rocks and minerals',
  'E2E M2 Free-browse weeks': 'Space weeks',
  'E2E M3 Long road 🚀 ünïcødé': 'Grow a plant',
  mooblox_e2e_s1: 'ART',
  mooblox_e2e_s2: 'LIBRARY',
  mooblox_e2e_s3: 'MATHS',
  mooblox_e2e_m1: 'ROCKS',
  mooblox_e2e_m2: 'SPACE',
  mooblox_e2e_m3: 'PLANT',
  'Étape': 'Step',
};

/** Puts the kid `d` m in front of activity `cmid`'s prop, facing it; leaves the prop spot on `window.__s`. */
const atProp = (cmid, d) => `() => {
  const m = window.mooblox, o = m.props.props.get(${cmid}).root;
  const q = o.getWorldPosition(o.position.clone()), fx = Math.sin(o.rotation.y), fz = Math.cos(o.rotation.y);
  m.player.teleport(q.x + fx * ${d}, q.z + fz * ${d}, Math.atan2(-fx, -fz));
  window.__s = { q: [q.x, q.y, q.z], fx, fz };
}`;

/** Walks up to a prop, presses E at `e` and shows the panel with the game camera and HUD. */
const openAt = (name, course, cmid, note, { d = 5, walk = 45, e = 80, frames = 330 } = {}) => ({
  name,
  note,
  url: play(course),
  until: WORLD_READY,
  settle: SETTLE,
  frames,
  clean: false,
  keys: [[10, 'down', 'KeyW'], [walk, 'up', 'KeyW'], [e, 'down', 'KeyE'], [e + 4, 'up', 'KeyE']],
  setup: atProp(cmid, d),
});

/** The gate of section `id` seen from the hub side: `[gx, gz, ux, uz]` (u = unit vector gate → hub). */
const GATE = (id) => `(() => { const p = window.mooblox.view.gates.get(${id}).root.position, l = Math.hypot(p.x, p.z); return [p.x, p.z, -p.x / l, -p.z / l]; })()`;

/** A Moodle page at 1.4x zoom with the course index drawer hidden (no preference written), then `extra`. */
const moodlePage = (extra) => `() => {
  const css = document.createElement('style');
  css.textContent = '.drawer.drawer-left, .drawer-left-toggle { display: none !important; } #page.drawers { margin-left: 0 !important; padding-left: 0 !important; }';
  document.head.append(css);
  document.documentElement.style.zoom = '1.4';
  ${extra}
}`;

export const SHOTS = [
  { ...reuse('hub'), frames: 540, note: '1: the warp hub, crane down to the portals' },
  {
    name: 'aerial',
    note: '2-3: high slow orbit over every island and bridge of the course',
    url: play(ROCKS),
    until: WORLD_READY,
    settle: 900,
    frames: 1500,
    rig: `(t, m, a) => {
      const ang = 0.6 + t * 0.03;
      return { pos: [Math.sin(ang) * 120, 95, Math.cos(ang) * 120], look: [0, 0, 0], fov: 50 };
    }`,
  },
  {
    name: 'props',
    note: '4: orbit round the Reading island: book stand, cinema, signs',
    url: play(ROCKS),
    until: WORLD_READY,
    settle: SETTLE,
    frames: 1200,
    setup: `() => {
      const m = window.mooblox, z = m.view.layout.zones.find((z) => z.sectionId === 420);
      m.player.teleport(z.x, z.z, 0);
      window.__s = { x: z.x, z: z.z };
    }`,
    clean: true,
    rig: `(t, m, a) => {
      const s = window.__s, ang = 2.2 + t * 0.06;
      return { pos: [s.x + Math.sin(ang) * 16, 7, s.z + Math.cos(ang) * 16], look: [s.x, 1.2, s.z], fov: 55 };
    }`,
  },
  openAt('page', ROCKS, 916, '5: walk to the Rock page reading stand, E, the real page opens'),
  openAt('cinema', ROCKS, 919, '6: the YouTube cinema opens', { frames: 270 }),
  openAt('quiz', ROCKS, 922, '6: the quiz arena, E, the quiz opens', { d: 9, walk: 90, e: 120, frames: 300 }),
  openAt('forum', ROCKS, 926, '6: the forum door, E, the forum opens', { frames: 270 }),
  {
    name: 'gate',
    note: '7: the locked gate of Step 2 and its sign, push in',
    url: play(PLANT),
    until: WORLD_READY,
    settle: SETTLE,
    frames: 780,
    setup: `() => {
      const g = ${GATE(438)};
      window.mooblox.player.teleport(g[0] + g[2] * 10 - g[3] * 0.8, g[1] + g[3] * 10 + g[2] * 0.8, Math.atan2(-g[2], -g[3]));
      window.__s = { g };
    }`,
    rig: `(t, m, a) => {
      const [gx, gz, ux, uz] = window.__s.g, k = a.ease(t / 12), d = a.lerp(16, 9, k);
      return { pos: [gx + ux * d + uz * 3, a.lerp(3.6, 2.8, k), gz + uz * d - ux * 3], look: [gx, 2.4, gz], fov: 46 };
    }`,
  },
  {
    name: 'unlock',
    note: '8: E at "Tick when you planted a seed", Mark as done (real), close; cut 205: the Guide hidden (it trails the kid and fades in the sight line), the kid waits on the deck, the gate swings at 560; cut 640: the kid runs through to the island',
    url: play(PLANT),
    until: WORLD_READY,
    settle: SETTLE,
    frames: 960,
    clean: false,
    writes: ['core_completion_update_activity_completion_status_manually'],
    keys: [[10, 'down', 'KeyW'], [40, 'up', 'KeyW'], [70, 'down', 'KeyE'], [74, 'up', 'KeyE'], [200, 'down', 'Escape'], [204, 'up', 'Escape'],
      [640, 'down', 'KeyW'], [640, 'down', 'ShiftLeft']],
    setup: atProp(965, 4.5),
    each: `(i) => {
      const m = window.mooblox, a = window.__trailer, s = window.__s;
      if (i === 150) document.querySelector('.mooblox-done')?.click();
      if (i === 205) {
        const gate = m.view.gates.get(438);
        s.g = ${GATE(438)};
        gate.snap(true);
        gate.set(true, 'Finish Tick when you planted a seed first', 'Open!');
        a.clean(true);
        m.guide.avatar.root.visible = false;
        m.player.teleport(s.g[0] + s.g[2] * 7, s.g[1] + s.g[3] * 7, Math.atan2(-s.g[2], -s.g[3]));
      }
      if (i === 215) {
        a.rig(\`(t, m, a) => { const [gx, gz, ux, uz] = window.__s.g; return { pos: [gx + ux * 16 + uz * 2.5, 5, gz + uz * 16 - ux * 2.5], look: [gx, 2.2, gz], fov: 42 }; }\`);
      }
      if (i === 560) m.view.gates.get(438).set(false, '', 'Open!');
      if (i === 640) {
        a.rig(\`(t, m, a) => { const [gx, gz, ux, uz] = window.__s.g, p = a.me(); return { pos: [p[0] + ux * 5.5 + uz * 1.2, p[1] + 2.6, p[2] + uz * 5.5 - ux * 1.2], look: [p[0] - ux * 4, p[1] + 1.2, p[2] - uz * 4], fov: 50 }; }\`);
      }
    }`,
    teardown: `async () => {
      const c = JSON.parse(document.querySelector('#mooblox-config').textContent);
      await fetch(c.wwwroot + '/lib/ajax/service.php?sesskey=' + c.sesskey + '&info=undo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ index: 0, methodname: 'core_completion_update_activity_completion_status_manually', args: { cmid: 965, completed: false } }]) });
    }`,
  },
  {
    name: 'book',
    note: '9: the Book opens (B), Go there to Practice, the kid lands there',
    url: play(ROCKS),
    until: WORLD_READY,
    settle: SETTLE,
    frames: 330,
    clean: false,
    keys: [[30, 'down', 'KeyB'], [34, 'up', 'KeyB']],
    each: `(i) => {
      if (i !== 170) return;
      const sec = [...document.querySelectorAll('.mooblox-book-section')].find((e) => e.textContent.includes('Practice'));
      (sec ?? document).querySelector('.mooblox-book-go')?.click();
    }`,
  },
  reuse('guide'),
  reuse('gem'),
  reuse('trophy'),
  reuse('badge'),
  reuse('warp'),
  reuse('bridge'),
  reuse('rise'),
  {
    name: 'moodle-rocks',
    note: '2-4: the Rocks course page as its teacher (sections, activities, completion)',
    url: `/course/view.php?id=${ROCKS}`,
    frames: 30,
    clean: false,
    setup: moodlePage(''),
  },
  {
    name: 'moodle-plant',
    note: '7: the Grow a plant course page as its teacher (restrictions on each step)',
    url: `/course/view.php?id=${PLANT}`,
    frames: 30,
    clean: false,
    setup: moodlePage(''),
  },
  {
    name: 'moodle-restrict',
    note: '7: Step 2 settings, every section expanded down to Restrict access',
    url: '/course/editsection.php?id=438',
    frames: 60,
    clean: false,
    setup: moodlePage(`document.querySelector('a.collapseexpand')?.click();`),
  },
];
