// The trailer's shot list: where each shot opens, how it is set up, which keys it holds and how its camera moves.
// Rigs run in the page: `(t, m, a) => ({ pos, look, fov })`, t = seconds into the shot, m = window.mooblox, a = window.__trailer;
// setups leave their numbers on `window.__s`.

const COURSE = 90;
const PLAY = `/local/mooblox/play.php?id=${COURSE}&quality=xhigh`;
const HUB = '/local/mooblox/index.php?quality=xhigh';
const WORLD_READY = `() => { const m = window.mooblox; return !!m?.view && document.querySelector('#mooblox-root')?.dataset.ready === '1' && m.view.streaming.pending === 0; }`;
const ARRIVING = '() => !!window.mooblox?.arrival';
const HUB_READY = `() => !!window.mooblox?.stage && document.querySelector('#mooblox-root')?.dataset.ready === '1'`;
/** Frames to let the arrival finish before a world shot. */
const SETTLE = 300;

/** Puts the kid at (x, z) facing (fx, fz) and waits for the island there. */
const placeKid = (x, z, fx, fz) => `
  window.mooblox.player.teleport(${x}, ${z}, Math.atan2((${fx}) - (${x}), (${fz}) - (${z})));`;

/** Badges for the staged trophy shots (the fixture kid has none in this course). */
const BADGES = `(() => {
  const names = ['Bookworm', 'Quiz champ', 'Rock star', 'Explorer', 'Helper', 'Kind heart'];
  const colours = ['#2fa39a', '#e0844f', '#a774f0', '#1e88e5', '#5db761', '#f6c445'];
  return names.map((name, i) => {
    const c = colours[i];
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="' + c + '"/><path d="M50 16l9 22 24 2-18 16 6 24-21-13-21 13 6-24-18-16 24-2z" fill="#fff"/></svg>';
    return { badgeId: 900 + i, name, imageUrl: 'data:image/svg+xml,' + encodeURIComponent(svg), timeIssued: Math.floor(Date.now() / 1000) - 86400 * 9 };
  });
})()`;

export const SHOTS = [
  {
    name: 'moodle',
    note: 'L1: the plain course page, slow push in, the cursor finds the MOOBLOX tab',
    url: `/course/view.php?id=${COURSE}`,
    frames: 330,
    clean: false,
    setup: `() => {
      const tab = document.querySelector('a[href*="local/mooblox/play.php"]');
      const r = tab.getBoundingClientRect();
      const cursor = document.createElement('div');
      cursor.innerHTML = '<svg width="34" height="44" viewBox="0 0 17 22"><path d="M1 1v17l4.5-4 3 7 3-1.3-3-6.7H15z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>';
      Object.assign(cursor.style, { position: 'fixed', left: '1500px', top: '900px', zIndex: 99999, pointerEvents: 'none', transformOrigin: '0 0' });
      document.body.append(cursor);
      document.documentElement.style.transformOrigin = (r.left + r.width / 2) + 'px ' + (r.top + r.height / 2) + 'px';
      window.__s = { cursor, tx: r.left + r.width / 2, ty: r.top + r.height / 2 };
    }`,
    each: `(i) => {
      const s = window.__s, a = window.__trailer;
      document.documentElement.style.transform = 'scale(' + (1 + 0.35 * a.ease(i / 330)) + ')';
      const k = a.ease((i - 150) / 140);
      s.cursor.style.left = a.lerp(1500, s.tx, k) + 'px';
      s.cursor.style.top = a.lerp(900, s.ty, k) + 'px';
      s.cursor.style.transform = i > 300 && i < 312 ? 'scale(0.8)' : 'scale(1)';
    }`,
  },
  {
    name: 'arrival',
    note: 'L2: white-out, the kid lands spinning beside the return portal (game camera)',
    url: PLAY,
    until: ARRIVING,
    frames: 270,
  },
  {
    name: 'hub',
    note: 'L3: the warp room, crane down from high behind the lift towards the portals',
    url: HUB,
    until: HUB_READY,
    frames: 390,
    rig: `(t, m, a) => {
      const k = a.ease(t / 6.5);
      const ang = a.lerp(0.55, -0.15, k);
      const r = a.lerp(17, 9, k);
      return { pos: [Math.sin(ang) * r, a.lerp(11, 3.2, k), Math.cos(ang) * r], look: [0, a.lerp(2, 3.4, k), -16], fov: 50 };
    }`,
  },
  {
    name: 'warp',
    note: 'L3b: the kid walks into the M1 portal and warps away, wide',
    url: HUB,
    until: HUB_READY,
    frames: 300,
    block: '**/local/mooblox/play.php*',
    keys: [[0, 'down', 'KeyW']],
    setup: `() => { ${placeKid(0, 2, 0, -20)} }`,
    rig: `(t, m, a) => ({ pos: [a.lerp(6.5, 4.5, a.ease(t / 5)), 2.6, -5], look: [0, 1.8, -15.5], fov: 50 })`,
  },
  {
    name: 'spin',
    note: 'L12: the warp spin, close',
    url: HUB,
    until: HUB_READY,
    frames: 300,
    block: '**/local/mooblox/play.php*',
    keys: [[0, 'down', 'KeyW']],
    setup: `() => { ${placeKid(0, -6, 0, -20)} }`,
    rig: `(t, m, a) => ({ pos: [1.3, 1.5, -10.8], look: [0, 1.3, -16.2], fov: 44 })`,
  },
  {
    name: 'bridge',
    note: 'L4: the kid runs a long plank bridge, low tracking shot from the side',
    url: PLAY,
    until: WORLD_READY,
    settle: SETTLE,
    frames: 300,
    keys: [[0, 'down', 'ShiftLeft'], [0, 'down', 'KeyW']],
    setup: `() => {
      const b = window.mooblox.view.dressing.bridges[0];
      const len = Math.hypot(b.bx - b.ax, b.bz - b.az), ux = (b.bx - b.ax) / len, uz = (b.bz - b.az) / len;
      ${placeKid('b.ax - ux * 2', 'b.az - uz * 2', 'b.bx', 'b.bz')}
      window.__s = { ux, uz };
    }`,
    rig: `(t, m, a) => {
      const p = a.me(), s = window.__s;
      const side = [-s.uz, s.ux];
      return { pos: [p[0] + side[0] * 4.2 - s.ux * 2.5, p[1] + 2.1, p[2] + side[1] * 4.2 - s.uz * 2.5], look: [p[0] + s.ux * 3, p[1] + 1.1, p[2] + s.uz * 3], fov: 48 };
    }`,
  },
  {
    name: 'hop',
    note: 'L5: the end of the bridge, a jump onto the next island, wide from over the water',
    url: PLAY,
    until: WORLD_READY,
    settle: SETTLE,
    frames: 270,
    keys: [[10, 'down', 'ShiftLeft'], [10, 'down', 'KeyW'], [80, 'down', 'Space'], [90, 'up', 'Space'], [200, 'up', 'KeyW']],
    setup: `() => {
      const b = window.mooblox.view.dressing.bridges[3];
      const len = Math.hypot(b.bx - b.ax, b.bz - b.az), ux = (b.bx - b.ax) / len, uz = (b.bz - b.az) / len;
      ${placeKid('b.bx - ux * 12', 'b.bz - uz * 12', 'b.bx', 'b.bz')}
      window.__s = { ux, uz, cx: b.bx - ux * 4 + uz * 10, cz: b.bz - uz * 4 - ux * 10 };
    }`,
    rig: `(t, m, a) => {
      const p = a.me(), s = window.__s;
      return { pos: [s.cx, 6.5, s.cz], look: [p[0] + s.ux * 3, p[1] + 1.2, p[2] + s.uz * 3], fov: 44 };
    }`,
  },
  {
    name: 'gem',
    note: 'L6: the kid runs through three gems on a bridge, gold sparkles, gem toast (gems placed in the page only)',
    url: PLAY,
    until: WORLD_READY,
    settle: SETTLE,
    frames: 240,
    keep: ['.mooblox-collect-toast'],
    keys: [[20, 'down', 'KeyW'], [20, 'down', 'ShiftLeft']],
    setup: `() => {
      const m = window.mooblox, b = m.view.dressing.bridges[2];
      const len = Math.hypot(b.bx - b.ax, b.bz - b.az), ux = (b.bx - b.ax) / len, uz = (b.bz - b.az) / len;
      const r = m.rewards.store.rewards;
      const gems = r.collectibles.filter((c) => c.kind === 'gem' && c.found).slice(0, 3);
      m.rewards.store.set({ ...r, collectibles: r.collectibles.map((c) => (gems.includes(c) ? { ...c, found: false } : c)) });
      m.rewards.collectibles.layer.set(gems.map((c, i) => ({ key: c.key, kind: 'gem', sectionId: c.sectionId, x: b.ax + ux * (9 + i * 5), z: b.az + uz * (9 + i * 5) })));
      ${placeKid('b.ax + ux * 1', 'b.az + uz * 1', 'b.bx', 'b.bz')}
      window.__s = { ux, uz };
    }`,
    rig: `(t, m, a) => {
      const s = window.__s, p = a.me();
      return { pos: [p[0] + s.ux * 6 - s.uz * 1.8, p[1] + 1.5, p[2] + s.uz * 6 + s.ux * 1.8], look: [p[0] + s.ux * 1.5, p[1] + 0.9, p[2] + s.uz * 1.5], fov: 50 };
    }`,
  },
  {
    name: 'trophy',
    note: 'L7: the course trophy hall with six cups, push in',
    url: PLAY,
    until: WORLD_READY,
    settle: SETTLE,
    frames: 270,
    setup: `() => {
      const m = window.mooblox, h = m.view.dressing.hall;
      localStorage.setItem('mooblox-badges-' + 64 + '-' + ${COURSE}, JSON.stringify([900, 901, 902, 903, 904, 905]));
      m.rewards.store.set({ ...m.rewards.store.rewards, trophies: ${BADGES} });
      const fx = Math.sin(h.face), fz = Math.cos(h.face);
      ${placeKid('h.x + fx * 2.6 + fz * 3.4', 'h.z + fz * 2.6 - fx * 3.4', 'h.x', 'h.z')}
      window.__s = { h, fx, fz };
    }`,
    rig: `(t, m, a) => {
      const s = window.__s, k = a.ease(t / 4.5), d = a.lerp(10, 5.2, k);
      return { pos: [s.h.x + s.fx * d, a.lerp(3.6, 1.9, k), s.h.z + s.fz * d], look: [s.h.x, 1.3, s.h.z], fov: 46 };
    }`,
  },
  {
    name: 'badge',
    note: 'L8: two badge moment cards over the world (staged badges, game camera)',
    url: PLAY,
    until: WORLD_READY,
    settle: SETTLE,
    frames: 300,
    keep: ['.mooblox-badge-moment'],
    setup: `() => {
      const m = window.mooblox, b = ${BADGES}, st = m.view.dressing.start;
      ${placeKid('st.x', 'st.z', 'st.x + Math.sin(st.face)', 'st.z + Math.cos(st.face)')}
      m.rewards.badges.play([{ ...b[2], name: 'Rock star' }, { ...b[3], name: 'Island explorer' }]);
      window.__s = { fx: Math.sin(st.face), fz: Math.cos(st.face) };
    }`,
    rig: `(t, m, a) => {
      const s = window.__s, p = a.me(), d = a.lerp(7, 6, a.ease(t / 5));
      return { pos: [p[0] - s.fx * d, p[1] + 3.4, p[2] - s.fz * d], look: [p[0] + s.fx * 4, p[1] + 1.6, p[2] + s.fz * 4], fov: 50 };
    }`,
  },
  {
    name: 'guide',
    note: 'L9: the Guide greets the kid, Show me, the kid follows the guided walk',
    url: PLAY,
    until: WORLD_READY,
    settle: SETTLE,
    frames: 360,
    keep: ['.mooblox-bubble'],
    keys: [[150, 'down', 'KeyE'], [156, 'up', 'KeyE']],
    setup: `() => {
      const m = window.mooblox, g = m.guide.avatar.root.position;
      const me = m.player.body.position;
      const ang = Math.atan2(me.x - g.x, me.z - g.z);
      ${placeKid('g.x + Math.sin(ang) * 3', 'g.z + Math.cos(ang) * 3', 'g.x', 'g.z')}
    }`,
  },
  {
    name: 'dog',
    note: 'L10: a dog trots over, the kid runs into it, then waves sorry',
    url: PLAY,
    until: WORLD_READY,
    settle: SETTLE,
    frames: 300,
    keys: [[75, 'down', 'KeyW'], [75, 'down', 'ShiftLeft'], [93, 'up', 'KeyW'], [93, 'up', 'ShiftLeft'], [140, 'down', 'Digit1'], [144, 'up', 'Digit1']],
    setup: `() => {
      const m = window.mooblox, occ = m.view.dressing.occupancy;
      let best = null;
      for (const dog of m.view.dressing.critters.filter((c) => c.kind === 'dog')) {
        const zone = [...m.view.layout.zones, ...m.view.layout.hubs].sort((p, q) => Math.hypot(p.x - dog.x, p.z - dog.z) - Math.hypot(q.x - dog.x, q.z - dog.z))[0];
        for (let k = 0; k < 24; k++) {
          const ux = Math.sin(k * Math.PI / 12), uz = Math.cos(k * Math.PI / 12);
          let free = 0;
          for (let d = 1; d <= 6; d += 0.5) {
            const x = dog.x + ux * d, z = dog.z + uz * d;
            if (occ.hits(x, z, 0.7) || Math.hypot(x - zone.x, z - zone.z) > zone.radius - 7) break;
            free = d;
          }
          const inward = -((dog.x - zone.x) * ux + (dog.z - zone.z) * uz);
          if (!best || free > best.free || (free === best.free && inward > best.inward)) best = { dog, ux, uz, free, inward };
        }
      }
      const { dog, ux, uz } = best, d = Math.min(5, best.free);
      ${placeKid('dog.x + ux * d', 'dog.z + uz * d', 'dog.x', 'dog.z')}
      window.__s = { dog, ux, uz, d };
    }`,
    rig: `(t, m, a) => {
      const s = window.__s, p = a.me();
      const cx = s.dog.x + s.ux * s.d * 0.5, cz = s.dog.z + s.uz * s.d * 0.5;
      return { pos: [cx - s.uz * 5.5, p[1] + 1.6, cz + s.ux * 5.5], look: [cx, p[1] + 0.6, cz], fov: 46 };
    }`,
  },
  {
    name: 'shortcut',
    note: 'L11: the kid runs off the island edge into the sea (the game respawns them)',
    url: PLAY,
    until: WORLD_READY,
    settle: SETTLE,
    frames: 125,
    keys: [[30, 'down', 'KeyW'], [30, 'down', 'ShiftLeft'], [110, 'down', 'Space'], [118, 'up', 'Space']],
    setup: `() => {
      const m = window.mooblox, occ = m.view.dressing.occupancy;
      let pick = null;
      for (const b of m.view.dressing.bridges) {
        const len = Math.hypot(b.bx - b.ax, b.bz - b.az), ux = (b.bx - b.ax) / len, uz = (b.bz - b.az) / len;
        for (const side of [5, -5, 6.5, -6.5]) {
          let clear = true;
          for (let d = -8; d <= 4; d += 0.5) if (occ.hits(b.ax + ux * d - uz * side, b.az + uz * d + ux * side, 0.7)) clear = false;
          if (clear && !pick) pick = { b, ux, uz, side };
        }
      }
      const { b, ux, uz, side } = pick;
      const sx = b.ax - uz * side, sz = b.az + ux * side;
      ${placeKid('sx - ux * 8', 'sz - uz * 8', 'sx + ux * 10', 'sz + uz * 10')}
      window.__s = { ux, uz, ex: sx, ez: sz, cam: [b.ax + ux * 5 + uz * Math.sign(side) * 0.5, 2.6, b.az + uz * 5 - ux * Math.sign(side) * 0.5] };
    }`,
    rig: `(t, m, a) => {
      const s = window.__s, p = a.me();
      if (p[1] > -1.5 && Math.hypot(p[0] - s.ex, p[2] - s.ez) < 30) s.last = p;
      const q = s.last ?? p;
      return { pos: s.cam, look: [q[0], q[1] + 0.6, q[2]], fov: 50 };
    }`,
  },
  {
    name: 'arena',
    note: 'L13: the quiz arena gate, push in as the kid runs up',
    url: PLAY,
    until: WORLD_READY,
    settle: SETTLE,
    frames: 330,
    keys: [[40, 'down', 'KeyW'], [220, 'up', 'KeyW']],
    setup: `() => {
      const m = window.mooblox, prop = [...m.props.props.entries()].find(([id]) => m.view.world.sections.some((s) => s.activities.some((x) => x.id === id && x.modname === 'quiz')))[1];
      const o = prop.root ?? prop.group ?? prop.object;
      const q = o.getWorldPosition(o.position.clone());
      const fx = Math.sin(o.rotation.y), fz = Math.cos(o.rotation.y);
      ${placeKid('q.x + fx * 10', 'q.z + fz * 10', 'q.x', 'q.z')}
      window.__s = { q: [q.x, q.y, q.z], fx, fz };
    }`,
    rig: `(t, m, a) => {
      const s = window.__s, k = a.ease(t / 5.5), d = a.lerp(15, 7, k);
      return { pos: [s.q[0] + s.fx * d + s.fz * 2, a.lerp(1.2, 2.2, k), s.q[2] + s.fz * d - s.fx * 2], look: [s.q[0], s.q[1] + a.lerp(3.2, 2.2, k), s.q[2]], fov: 50 };
    }`,
  },
  {
    name: 'rise',
    note: 'L14: crane up and back over the islands',
    url: PLAY,
    until: WORLD_READY,
    settle: SETTLE,
    frames: 360,
    setup: `() => { window.__s = { p: window.__trailer.me() }; }`,
    rig: `(t, m, a) => {
      const s = window.__s, k = a.ease(t / 6);
      return { pos: [s.p[0] + a.lerp(4, 30, k), a.lerp(2.5, 55, k), s.p[2] + a.lerp(5, 45, k)], look: [s.p[0], a.lerp(1.2, 0, k), s.p[2]], fov: 50 };
    }`,
  },
];
