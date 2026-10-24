import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldView } from '../boot/app';
import type { Avatar } from '../player/avatar';
import type { AvatarFactory } from '../player/avatar-kit';
import { paintPlace, type Critter, type Hangout, type LifeSpot, type Sail, type Segment } from './dressing';
import type { ModelLibrary } from './model-library';
import { seededRandom } from './random';
import { sceneryGeometry, singleModel } from './scenery';

type Mover = (t: number, dt: number) => void;

/** NPC kids per tier: playing, sitting and walking the paths (none on low). */
const KID_COUNT: Readonly<Record<string, number>> = { low: 0, medium: 2, high: 3, xhigh: 8 };
/** Kids further than this from the camera are not drawn. */
const KID_DRAW = 60;

/** Ambient life: flags, boats, buoys, sailing ships, ducks, cats, dogs, butterflies, smoke, gulls, petals and NPC kids. */
export async function startLife(view: WorldView, lib: ModelLibrary, avatars: AvatarFactory | null): Promise<void> {
  const movers: Mover[] = [];
  let teardown: (() => void)[] = [];
  const minor = view.quality.tier !== 'low';
  const build = (): void => {
    for (const off of teardown) off();
    teardown = [];
    movers.length = 0;
    const d = view.dressing;
    for (const kind of ['flag', 'boat'] as const) {
      const spots = d.life.filter((s) => s.kind === kind);
      if (spots.length) movers.push(instanced(view, singleModel(lib, spots[0]!.id, 1), spots, view.kit.scenery, teardown));
    }
    const buoys = d.life.filter((s) => s.kind === 'buoy');
    if (buoys.length) movers.push(instanced(view, buoyGeometry(), buoys, view.kit.scenery, teardown));
    if (d.sails.length) movers.push(ships(view, lib, d.sails, teardown));
    if (minor) {
      for (const kind of ['duck', 'cat', 'dog'] as const) {
        const list = d.critters.filter((c) => c.kind === kind);
        if (list.length) movers.push(animals(view, kind, list, teardown));
      }
      const flutter = d.critters.filter((c) => c.kind === 'butterfly');
      if (flutter.length) movers.push(butterflies(view, flutter, teardown));
      if (d.smoke.length) movers.push(smoke(view, d.smoke, teardown));
    }
    movers.push(birds(view, teardown), petals(view, teardown));
  };
  build();
  view.onRebuild(build);
  const count = KID_COUNT[view.quality.tier] ?? 0;
  if (avatars && count) movers.push(...(await kids(view, avatars, count, view.quality.tier === 'xhigh')));
  let t = 0;
  view.onFrame((dt) => {
    t += dt;
    for (const m of movers) m(t, dt);
  });
}

function instanced(view: WorldView, geometry: BufferGeometry, spots: readonly LifeSpot[], material: Material, teardown: (() => void)[]): Mover {
  const mesh = new InstancedMesh(geometry, material, spots.length);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  view.stage.add(mesh);
  teardown.push(() => {
    mesh.removeFromParent();
    mesh.dispose();
    geometry.dispose();
  });
  const m = new Object3D();
  return (t) => {
    spots.forEach((s, i) => {
      const phase = s.x * 0.37 + s.z * 0.11;
      m.position.set(s.x, s.y, s.z);
      m.scale.setScalar(s.height);
      if (s.kind === 'flag') {
        m.rotation.set(0, s.yaw + Math.sin(t * 2.2 + phase) * 0.35, 0);
        m.scale.x = s.height * (1 + Math.sin(t * 5 + phase) * 0.06);
      } else {
        m.position.y = s.y + Math.sin(t * 1.3 + phase) * 0.08;
        m.rotation.set(Math.sin(t * 1.1 + phase) * 0.06, s.yaw + t * (s.kind === 'buoy' ? 0.2 : 0), Math.sin(t * 0.9 + phase) * 0.06);
      }
      m.updateMatrix();
      mesh.setMatrixAt(i, m.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** A red and white buoy with a light on top, floating at y = 0. */
function buoyGeometry(): BufferGeometry {
  const parts = [
    paintPlace(new CylinderGeometry(0.45, 0.55, 0.6, 10), 0xe8604c, 0, 0.1, 0, 0),
    paintPlace(new CylinderGeometry(0.3, 0.45, 0.5, 10), 0xffffff, 0, 0.65, 0, 0),
    paintPlace(new ConeGeometry(0.3, 0.5, 10), 0xe8604c, 0, 1.15, 0, 0),
    paintPlace(new BoxGeometry(0.16, 0.16, 0.16), 0xffe08a, 0, 1.45, 0, 0),
  ];
  return sceneryGeometry(mergeGeometries(parts, false)!);
}

/** Sailing ships looping their circles round the archipelago. */
function ships(view: WorldView, lib: ModelLibrary, sails: readonly Sail[], teardown: (() => void)[]): Mover {
  const geometry = singleModel(lib, 'pirate/ship-small', 7);
  const mesh = new InstancedMesh(geometry, view.kit.scenery, sails.length);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  view.stage.add(mesh);
  teardown.push(() => {
    mesh.removeFromParent();
    mesh.dispose();
    geometry.dispose();
  });
  const m = new Object3D();
  return (t) => {
    sails.forEach((s, i) => {
      const dir = i % 2 ? -1 : 1;
      const a = dir * t * (5 / s.r) + i * 2.1;
      m.position.set(s.x + Math.cos(a) * s.r, -3.4 + Math.sin(t * 0.8 + i) * 0.1, s.z + Math.sin(a) * s.r);
      m.rotation.set(0, -a + (dir > 0 ? Math.PI : 0), Math.sin(t * 0.7 + i) * 0.05);
      m.updateMatrix();
      mesh.setMatrixAt(i, m.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** Blocky animals built from boxes, facing +z, standing on y = 0. */
function animalGeometry(kind: 'duck' | 'cat' | 'dog'): BufferGeometry {
  const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => paintPlace(new BoxGeometry(w, h, d), c, x, y, z, 0);
  let parts: BufferGeometry[];
  if (kind === 'duck') {
    parts = [box(0.34, 0.22, 0.5, 0xfafafa, 0, 0.11, 0), box(0.2, 0.22, 0.2, 0x2f8f4e, 0, 0.32, 0.2), box(0.12, 0.05, 0.14, 0xf2a33a, 0, 0.3, 0.36), box(0.16, 0.08, 0.1, 0xeeeeee, 0, 0.2, -0.28)];
  } else {
    const fur = kind === 'cat' ? 0xf2a33a : 0x9a6a3e;
    const dark = kind === 'cat' ? 0xd9822b : 0x6e4a2a;
    parts = [
      box(0.32, 0.28, 0.62, fur, 0, 0.36, 0),
      box(0.3, 0.28, 0.28, fur, 0, 0.58, 0.38),
      box(0.08, 0.1, 0.06, dark, -0.09, 0.76, 0.38),
      box(0.08, 0.1, 0.06, dark, 0.09, 0.76, 0.38),
      box(0.14, 0.1, 0.1, kind === 'dog' ? 0x3a2a1e : 0xffc0cb, 0, 0.52, 0.55),
      box(0.07, 0.07, kind === 'cat' ? 0.4 : 0.22, dark, 0, kind === 'cat' ? 0.62 : 0.5, -0.4),
    ];
    for (const x of [-0.1, 0.1]) for (const z of [-0.22, 0.22]) parts.push(box(0.08, 0.24, 0.08, dark, x, 0.12, z));
  }
  return sceneryGeometry(mergeGeometries(parts, false)!);
}

/** One instanced mesh per animal kind; each wanders its circle, ducks paddle, pets pause and trot. */
function animals(view: WorldView, kind: 'duck' | 'cat' | 'dog', list: readonly Critter[], teardown: (() => void)[]): Mover {
  const per = kind === 'duck' ? 4 : 1;
  const geometry = animalGeometry(kind);
  const mesh = new InstancedMesh(geometry, view.kit.scenery, list.length * per);
  mesh.castShadow = kind !== 'duck';
  mesh.frustumCulled = false;
  view.stage.add(mesh);
  teardown.push(() => {
    mesh.removeFromParent();
    mesh.dispose();
    geometry.dispose();
  });
  const m = new Object3D();
  return (t) => {
    list.forEach((c, i) => {
      for (let k = 0; k < per; k++) {
        const phase = i * 1.7 + k * 0.9;
        const speed = kind === 'duck' ? 0.25 : 0.35;
        const pause = kind === 'duck' ? 0 : Math.max(0, Math.sin(t * 0.3 + phase)) * 2;
        const a = (t - pause) * speed + phase + (kind === 'duck' ? k * 0.35 : 0);
        const r = c.r * (kind === 'duck' ? 1 - k * 0.12 : 1);
        m.position.set(c.x + Math.cos(a) * r, c.y + (kind === 'duck' ? Math.sin(t * 2 + k) * 0.03 : Math.abs(Math.sin(t * 8 + phase)) * 0.05), c.z + Math.sin(a) * r);
        m.rotation.set(0, -a, 0);
        m.scale.setScalar(kind === 'duck' && k > 0 ? 0.7 : 1);
        m.updateMatrix();
        mesh.setMatrixAt(i * per + k, m.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** Butterflies: two flapping two-sided wings per instance (scenery material, no extra shader), round flower beds and fountains. */
function butterflies(view: WorldView, list: readonly Critter[], teardown: (() => void)[]): Mover {
  const per = 2;
  const flat = new BufferGeometry();
  flat.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0.16, 0, 0.1, 0.16, 0, -0.08, 0, 0, 0, 0.16, 0, -0.08, 0.16, 0, 0.1, 0, 0, 0, -0.16, 0, 0.1, -0.16, 0, -0.08, 0, 0, 0, -0.16, 0, -0.08, -0.16, 0, 0.1]), 3));
  const colour = new Color(0xffd43b);
  const accent = new Color(0xf06292);
  const cols = new Float32Array(36);
  for (let v = 0; v < 12; v++) (v % 3 === 0 ? accent : colour).toArray(cols, v * 3);
  flat.setAttribute('color', new BufferAttribute(cols, 3));
  const wing = sceneryGeometry(flat);
  const mesh = new InstancedMesh(wing, view.kit.scenery, list.length * per);
  mesh.frustumCulled = false;
  view.stage.add(mesh);
  teardown.push(() => {
    mesh.removeFromParent();
    mesh.dispose();
  });
  const m = new Object3D();
  return (t) => {
    list.forEach((c, i) => {
      for (let k = 0; k < per; k++) {
        const p = i * 2.3 + k * 3.1;
        const a = t * (0.6 + k * 0.2) + p;
        m.position.set(c.x + Math.cos(a) * c.r + Math.sin(t * 1.7 + p) * 0.3, c.y + Math.sin(t * 2.3 + p) * 0.35, c.z + Math.sin(a * 1.3) * c.r);
        m.rotation.set(0, -a, 0);
        m.scale.set(Math.abs(Math.sin(t * 14 + p)) * 0.9 + 0.1, 1, 1);
        m.updateMatrix();
        mesh.setMatrixAt(i * per + k, m.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** Soft smoke puffs rising from chimneys and campfires, one Points cloud for all. */
function smoke(view: WorldView, sources: readonly { x: number; y: number; z: number }[], teardown: (() => void)[]): Mover {
  const per = 7;
  const n = sources.length * per;
  const pos = new Float32Array(n * 3);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  const pts = new Points(g, new PointsMaterial({ color: 0xeeeeee, size: 0.7, transparent: true, opacity: 0.45, depthWrite: false }));
  pts.frustumCulled = false;
  view.stage.add(pts);
  teardown.push(() => {
    pts.removeFromParent();
    g.dispose();
  });
  return (t) => {
    sources.forEach((s, i) => {
      for (let k = 0; k < per; k++) {
        const life = (t * 0.35 + k / per + i * 0.13) % 1;
        const o = (i * per + k) * 3;
        pos[o] = s.x + Math.sin(life * 4 + i) * 0.4 * life + life * 0.8;
        pos[o + 1] = s.y + life * 3.2;
        pos[o + 2] = s.z + Math.cos(life * 3 + k) * 0.3 * life;
      }
    });
    g.getAttribute('position').needsUpdate = true;
  };
}

/** A flock of low-poly gulls circling above the islands, wings flapping. */
function birds(view: WorldView, teardown: (() => void)[]): Mover {
  const wing = new BufferGeometry();
  wing.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 0.35, -0.08, 0, -0.3, 0.08, 0, -0.3, 0, 0.02, 0.05, -0.75, 0.12, -0.2, -0.05, 0, -0.12, 0, 0.02, 0.05, 0.05, 0, -0.12, 0.75, 0.12, -0.2]), 3),
  );
  wing.computeVertexNormals();
  const n = 12;
  const flock = new InstancedMesh(wing, new MeshLambertMaterial({ color: 0xf8f8f8, side: DoubleSide }), n);
  flock.frustumCulled = false;
  view.stage.add(flock);
  teardown.push(() => flock.removeFromParent());
  const m = new Object3D();
  const e = Math.min(view.layout.extent, 120);
  return (t) => {
    for (let i = 0; i < n; i++) {
      const r = e * (0.45 + (i % 3) * 0.12);
      const a = t * (0.12 + (i % 2) * 0.03) + (i * 2 * Math.PI) / n;
      m.position.set(Math.cos(a) * r, 14 + (i % 4) * 2 + Math.sin(t + i) * 0.6, Math.sin(a) * r);
      m.rotation.set(0, -a, 0);
      m.scale.set(1.4, 1.4 * (0.4 + Math.abs(Math.sin(t * 6 + i))), 1.4);
      m.updateMatrix();
      flock.setMatrixAt(i, m.matrix);
    }
    flock.instanceMatrix.needsUpdate = true;
  };
}

/** Pink blossom petals drifting over the hub and the nearest districts. */
function petals(view: WorldView, teardown: (() => void)[]): Mover {
  const random = seededRandom(7);
  const n = 260;
  const base = new Float32Array(n * 3);
  const e = Math.min(view.layout.extent, 90);
  for (let i = 0; i < n; i++) {
    const a = random() * 2 * Math.PI;
    const r = Math.sqrt(random()) * e;
    base.set([Math.cos(a) * r, 0.5 + random() * 4, Math.sin(a) * r], i * 3);
  }
  const pos = new Float32Array(base);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  const pts = new Points(g, new PointsMaterial({ color: 0xffc2d6, size: 0.18, transparent: true, opacity: 0.85, depthWrite: false }));
  pts.frustumCulled = false;
  view.stage.add(pts);
  teardown.push(() => pts.removeFromParent());
  return (t) => {
    for (let i = 0; i < n; i++) {
      pos[i * 3] = base[i * 3]! + Math.sin(t * 0.5 + i) * 0.8;
      pos[i * 3 + 1] = base[i * 3 + 1]! + Math.sin(t * 0.8 + i * 1.7) * 0.5;
      pos[i * 3 + 2] = base[i * 3 + 2]! + Math.cos(t * 0.4 + i) * 0.8;
    }
    g.getAttribute('position').needsUpdate = true;
  };
}

const SKINS = ['a', 'c', 'b', 'd', 'e', 'f', 'g', 'h', 'i'];
const SHIRTS = [0xe23d2b, 0x1e88e5, 0xf2a33a, 0x8a5bd6, 0x2fa38a, 0xf06292, 0xffd43b, 0x4dabf7, 0x69db7c];

/** NPC kids: the first ones play or sit at the hangouts nearest the spawn, the rest walk the paths. */
async function kids(view: WorldView, avatars: AvatarFactory, count: number, shadows: boolean): Promise<Mover[]> {
  const out: Mover[] = [];
  const spawn = view.layout.spawn;
  const near = (x: number, z: number) => Math.hypot(x - spawn.x, z - spawn.z);
  const spots = [...view.dressing.hangouts].sort((a, b) => near(a.x, a.z) - near(b.x, b.z));
  const walks = [...view.dressing.paths].filter((p) => Math.hypot(p.bx - p.ax, p.bz - p.az) > 6).sort((a, b) => near(a.ax, a.az) - near(b.ax, b.az));
  for (let i = 0; i < count; i++) {
    const ids = avatars.bodies.map((b) => b.id);
    const skin = SKINS.slice(i % SKINS.length).find((s) => ids.includes(s)) ?? ids[i % ids.length]!;
    const avatar = await avatars.create({ skin, tint: SHIRTS[i % SHIRTS.length]! });
    avatar.root.traverse((o) => (o.castShadow = shadows));
    view.stage.add(avatar.root);
    const hang = i % 3 !== 2 ? spots[Math.floor((i * 2) / 3)] : undefined;
    const walk = walks[i];
    const draw = (move: Mover): Mover => (t, dt) => {
      const eye = view.stage.camera.position;
      avatar.root.visible = Math.hypot(eye.x - avatar.root.position.x, eye.z - avatar.root.position.z) < KID_DRAW;
      if (avatar.root.visible) move(t, dt);
    };
    if (hang) out.push(draw(hangout(avatar, hang, i)));
    else if (walk) out.push(draw(walker(avatar, walk, i)));
    else {
      avatar.root.position.set(Math.cos(i * 1.3) * 4.2, 0, Math.sin(i * 1.3) * 4.2);
      avatar.play('idle');
      out.push(draw((_t, dt) => avatar.update(dt)));
    }
  }
  return out;
}

function hangout(avatar: Avatar, h: Hangout, i: number): Mover {
  if (h.kind === 'sit') {
    avatar.root.position.set(h.x, 0.06, h.z);
    avatar.root.rotation.y = h.face;
    avatar.play('idle');
    return (_t, dt) => avatar.update(dt);
  }
  avatar.play('run');
  return (t, dt) => {
    const a = t * 1.4 + i;
    avatar.root.position.set(h.x + Math.cos(a) * 1.3, 0.06, h.z + Math.sin(a) * 1.3);
    avatar.root.rotation.y = -a + Math.PI;
    avatar.update(dt);
  };
}

function walker(avatar: Avatar, path: Segment, i: number): Mover {
  avatar.play('walk');
  const len = Math.hypot(path.bx - path.ax, path.bz - path.az);
  return (t, dt) => {
    const s = (t * 1.3 + i * 3) % (2 * len);
    const k = s < len ? s / len : 2 - s / len;
    const back = s >= len;
    const side = 0.5 * (back ? -1 : 1);
    const nx = (path.bz - path.az) / len;
    const nz = -(path.bx - path.ax) / len;
    avatar.root.position.set(path.ax + (path.bx - path.ax) * k + nx * side, 0.06, path.az + (path.bz - path.az) * k + nz * side);
    avatar.root.rotation.y = Math.atan2((path.bx - path.ax) * (back ? -1 : 1), (path.bz - path.az) * (back ? -1 : 1));
    avatar.update(dt);
  };
}
