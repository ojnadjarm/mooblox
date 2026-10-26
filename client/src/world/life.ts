import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Frustum,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Sphere,
  Vector3,
  type Camera,
  type Material,
  type WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldView } from '../boot/app';
import type { Avatar } from '../player/avatar';
import type { AvatarFactory } from '../player/avatar-kit';
import { SEAT } from '../player/clips';
import { focus } from '../player/attention';
import { hash01 } from '../player/motion';
import { animalGeometry } from './critter-models';
import { C, CRITTERS, critterState, keepClear, nudge, pace, reactStep, rise } from './critter-react';
import { paintPlace, type Critter, type Dressing, type Hangout, type LifeSpot, type Sail, type Segment } from './dressing';
import { INSTANCED_DEPTH } from './depth-materials';
import { clothWeights } from './flag-cloth';
import { GroundScatter, lawnTest } from './ground-scatter';
import { CAMPUS } from './look';
import type { ModelLibrary } from './model-library';
import { hop, routeAt, strollRoute, walkerRoute, type Route, type RoutePose, type Sight } from './npc-schedule';
import { seededRandom } from './random';
import { Campfires } from './campfire';
import { GpuWarmup } from './gpu-warmup';
import { QUALITY } from '../perf/quality';
import { Smoke, type SmokeSource } from './smoke';
import { sceneryGeometry, singleModel } from './scenery';

type Mover = (t: number, dt: number) => void;

/** NPC kids per tier: playing, sitting and walking the paths (none on low). */
const KID_COUNT: Readonly<Record<string, number>> = { low: 0, medium: 2, high: 3, xhigh: 8 };
/** Two kids share a sit spot side by side, this far (m) either side of it. */
const SIT_SIDE = 0.8;
/** Metres past the current island's rim a kid still counts as on it (beach, shore fence). */
const KID_SHORE = 2;
/** Kids further than this from the camera are not drawn. */
const KID_DRAW = 60;
/** Walker pace (m/s, base + per-kid spread: the walk clip's stride fits 3.3-6) and turn rate (1/s) towards the next heading. */
const WALK_PACE = 3.3;
const WALK_SPREAD = 0.6;
const WALK_TURN = 7;
/** Each kid's part, by index: 'sit' pairs share the nearest hangout, 'play' pairs the nearest playground, 'stroll' loops the sights from the plaza fountain on, 'walk' walks a path. */
const ROLES = ['sit', 'stroll', 'sit', 'walk', 'play', 'play', 'walk', 'stroll'] as const;
/** Sights walkers visit (stalls, signs, fountains): kit model, ground radius when no obstacle says, and the eye height (m) of what they look at. */
const SIGHTS: Readonly<Record<string, { readonly r: number; readonly up: number }>> = {
  'town/stall-red': { r: 1.3, up: 0.05 },
  'town/stall-green': { r: 1.3, up: 0.05 },
  'nature/sign': { r: 0.4, up: -0.45 },
  'town/fountain-round': { r: 1.6, up: -0.9 },
  'town/fountain-round-detail': { r: 1.6, up: -0.9 },
};

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
      if (!spots.length) continue;
      const geometry = singleModel(lib, spots[0]!.id, 1);
      movers.push(instanced(view, kind === 'flag' ? clothWeights(geometry) : geometry, spots, view.kit.sceneryInstanced, teardown));
    }
    const buoys = d.life.filter((s) => s.kind === 'buoy');
    if (buoys.length) movers.push(instanced(view, buoyGeometry(), buoys, view.kit.sceneryInstanced, teardown));
    if (d.sails.length) movers.push(ships(view, lib, d.sails, teardown));
    if (minor) {
      for (const kind of ['duck', 'cat', 'dog'] as const) {
        const list = d.critters.filter((c) => c.kind === kind);
        if (list.length) movers.push(animals(view, kind, list, teardown));
      }
      const flutter = d.critters.filter((c) => c.kind === 'butterfly');
      if (flutter.length) movers.push(butterflies(view, flutter, teardown));
      if (d.smoke.length) movers.push(smoke(view, d.smoke, teardown));
      const camps = d.smoke.filter((s) => s.kind === 'campfire');
      if (camps.length) movers.push(fires(view, camps, teardown));
    }
    movers.push(birds(view, teardown), petals(view, teardown), scatter(view, teardown));
  };
  build();
  view.onRebuild(build);
  const count = KID_COUNT[view.quality.tier] ?? 0;
  if (avatars && count) movers.push(...(await kids(view, avatars, count, view.quality.tier === 'xhigh')));
  let t = 0;
  view.onFrame((dt) => {
    t += dt;
    trackPlayer(dt);
    for (const m of movers) m(t, dt);
  });
}

/** Where the local player stands and how fast it moves (m/s), for critters to react to; `near` false while there is none. */
const PLAYER = { near: false, x: 0, z: 0, v: 0 };
/** A player move longer than this (m) in one frame is a teleport, not a run. */
const PLAYER_JUMP = 2;

function trackPlayer(dt: number): void {
  if (!focus.owner) {
    PLAYER.near = false;
    return;
  }
  const d = Math.hypot(focus.x - PLAYER.x, focus.z - PLAYER.z);
  const v = PLAYER.near && dt > 0 && d < PLAYER_JUMP ? d / dt : 0;
  PLAYER.v += (v - PLAYER.v) * Math.min(1, 10 * dt);
  PLAYER.near = true;
  PLAYER.x = focus.x;
  PLAYER.z = focus.z;
}

/** Grass tufts and pebbles on the open lawn ahead of the camera, one draw (low: fewer, nearer). */
function scatter(view: WorldView, teardown: (() => void)[]): Mover {
  const low = view.quality.tier === 'low';
  const { layout, dressing } = view;
  const open = lawnTest([...layout.hubs, ...layout.zones], layout.zones.flatMap((z) => z.plots), [...dressing.paths, ...dressing.bridges], dressing.occupancy, 8.5);
  const p = CAMPUS.palette;
  const s = new GroundScatter(view.kit.scenery, { grass: p.grass, stone: p.rock }, low ? 9 : 18, low ? 80 : 360, open);
  view.stage.add(s.mesh);
  teardown.push(() => {
    s.mesh.removeFromParent();
    s.dispose();
  });
  const cam = view.stage.camera;
  return () => {
    const e = cam.matrixWorld.elements;
    const fx = -e[8]!;
    const fz = -e[10]!;
    const f = Math.hypot(fx, fz) || 1;
    s.update(cam.position.x + (fx / f) * 7, cam.position.z + (fz / f) * 7);
  };
}

const FRUSTUM = new Frustum();
const VIEW = new Matrix4();
const BALL = new Sphere();
/** Metres added round a mover before the frustum test: the camera may still turn this frame. */
const VIEW_MARGIN = 3;

/** The camera's view volume now (call once per mover per frame, before `inView`). */
function viewFrustum(camera: Camera): void {
  camera.updateMatrixWorld();
  FRUSTUM.setFromProjectionMatrix(VIEW.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}

/** True when a ball of radius `r` at (x, y, z) reaches into the last `viewFrustum`. */
function inView(x: number, y: number, z: number, r: number): boolean {
  BALL.center.set(x, y, z);
  BALL.radius = r + VIEW_MARGIN;
  return FRUSTUM.intersectsSphere(BALL);
}

function instanced(view: WorldView, geometry: BufferGeometry, spots: readonly LifeSpot[], material: Material, teardown: (() => void)[]): Mover {
  const mesh = new InstancedMesh(geometry, material, spots.length);
  // Water receives no shadow: only flags (over land) cast one.
  mesh.castShadow = spots[0]?.kind === 'flag';
  mesh.customDepthMaterial = INSTANCED_DEPTH;
  mesh.frustumCulled = false;
  view.stage.add(mesh);
  teardown.push(() => {
    mesh.removeFromParent();
    mesh.dispose();
    geometry.dispose();
  });
  // A shadow caster stays drawn out of view: its shadow may fall into it.
  const cull = !mesh.castShadow;
  const m = new Object3D();
  return (t) => {
    let n = 0;
    if (cull) viewFrustum(view.stage.camera);
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!;
      // Only what the player can see past the haze and in view is posed and drawn (instances packed at the front).
      if (!view.sees(s.x, s.z) || (cull && !inView(s.x, s.y, s.z, 2 * s.height))) continue;
      const phase = s.x * 0.37 + s.z * 0.11;
      m.position.set(s.x, s.y, s.z);
      m.scale.setScalar(s.height);
      if (s.kind === 'flag') {
        m.rotation.set(0, s.yaw + Math.sin(t * 0.7 + phase) * 0.2, 0);
      } else {
        m.position.y = s.y + Math.sin(t * 1.3 + phase) * 0.08;
        m.rotation.set(Math.sin(t * 1.1 + phase) * 0.06, s.yaw + t * (s.kind === 'buoy' ? 0.2 : 0), Math.sin(t * 0.9 + phase) * 0.06);
      }
      m.updateMatrix();
      mesh.setMatrixAt(n++, m.matrix);
    }
    mesh.count = n;
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

/** Half the length of a 7 m sailing ship, round its waterline centre (m). */
const SHIP_REACH = 6;

/** Sailing ships looping their circles round the archipelago. */
function ships(view: WorldView, lib: ModelLibrary, sails: readonly Sail[], teardown: (() => void)[]): Mover {
  const geometry = singleModel(lib, 'pirate/ship-small', 7);
  const mesh = new InstancedMesh(geometry, view.kit.sceneryInstanced, sails.length);
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  view.stage.add(mesh);
  teardown.push(() => {
    mesh.removeFromParent();
    mesh.dispose();
    geometry.dispose();
  });
  const m = new Object3D();
  return (t) => {
    let n = 0;
    viewFrustum(view.stage.camera);
    for (let i = 0; i < sails.length; i++) {
      const s = sails[i]!;
      const dir = i % 2 ? -1 : 1;
      const a = dir * t * (5 / s.r) + i * 2.1;
      const x = s.x + Math.cos(a) * s.r;
      const z = s.z + Math.sin(a) * s.r;
      // Drawn only past the haze's edge and in view (packed at the front).
      if (!view.sees(x, z) || !inView(x, 0, z, SHIP_REACH)) continue;
      m.position.set(x, -3.4 + Math.sin(t * 0.8 + i) * 0.1, z);
      m.rotation.set(0, -a + (dir > 0 ? Math.PI : 0), Math.sin(t * 0.7 + i) * 0.05);
      m.updateMatrix();
      mesh.setMatrixAt(n++, m.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** One instanced mesh per animal kind; each wanders its circle (ducks paddle, pets pause and trot) and reacts to the player (`critter-react.ts`). */
function animals(view: WorldView, kind: 'duck' | 'cat' | 'dog', list: readonly Critter[], teardown: (() => void)[]): Mover {
  const per = kind === 'duck' ? 4 : 1;
  const geometry = animalGeometry(kind);
  const mesh = new InstancedMesh(geometry, view.kit.sceneryInstanced, list.length * per);
  mesh.name = kind;
  mesh.castShadow = kind !== 'duck';
  mesh.customDepthMaterial = INSTANCED_DEPTH;
  mesh.frustumCulled = false;
  view.stage.add(mesh);
  teardown.push(() => {
    mesh.removeFromParent();
    mesh.dispose();
    geometry.dispose();
  });
  const tune = CRITTERS[kind];
  const state = critterState(list.length * per);
  const roam = kind === 'duck' ? 2.5 : 4;
  const ground = kind === 'duck' ? null : groundAreas(view, list, roam);
  const calm = calmCritters(list, tune);
  const m = new Object3D();
  const lo = new Vector3();
  const hi = new Vector3();
  return (t, dt) => {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      if (!view.sees(c.x, c.z)) continue;
      const asleep = calm.asleep(i, c);
      let still = true;
      for (let k = 0; k < per; k++) {
        const j = i * per + k;
        const clock = state[j * C.size + C.clock]!;
        const phase = i * 1.7 + k * 0.9;
        const speed = kind === 'duck' ? 0.25 : 0.35;
        const pause = kind === 'duck' ? 0 : Math.max(0, Math.sin(clock * 0.3 + phase)) * 2;
        const a = (clock - pause) * speed + phase + (kind === 'duck' ? k * 0.35 : 0);
        const r = c.r * (kind === 'duck' ? 1 - k * 0.12 : 1);
        const bx = c.x + Math.cos(a) * r;
        const bz = c.z + Math.sin(a) * r;
        const gait = kind === 'duck' ? Math.sin(t * 2 + k) * 0.03 : Math.abs(Math.sin(t * 8 + phase)) * 0.05;
        if (asleep) {
          state[j * C.size + C.clock] = clock + dt;
          m.position.set(bx, c.y + gait, bz);
          m.rotation.set(0, -a, 0);
        } else {
          if (!reactStep(state, j, tune, bx, bz, -a, c.x, c.z, c.r + roam, PLAYER.near, PLAYER.x, PLAYER.z, PLAYER.v, dt)) still = false;
          const o = j * C.size;
          if (ground) {
            keepClear(state, j, bx, bz, ground.area, ground.from[i]!, ground.from[i + 1]!, PET_BODY);
            const vx = state[o + C.vx]!;
            const vz = state[o + C.vz]!;
            if (vx * vx + vz * vz > PET_STILL) {
              lo.set(bx + state[o + C.ox]!, c.y + PET_PROBE, bz + state[o + C.oz]!);
              hi.set(lo.x, lo.y + PET_BODY, lo.z);
              const push = view.collider.resolve(lo, hi, PET_BODY);
              nudge(state, j, push.x, push.z);
            }
          }
          state[j * C.size + C.clock] = clock + dt * pace(state, j, tune);
          m.position.set(bx + state[o + C.ox]!, c.y + gait + rise(state, j, tune), bz + state[o + C.oz]!);
          m.rotation.set(0, state[o + C.yaw]!, 0);
        }
        m.scale.setScalar(kind === 'duck' && k > 0 ? 0.7 : 1);
        m.updateMatrix();
        mesh.setMatrixAt(n++, m.matrix);
      }
      calm.settle(i, asleep || still);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** Which critters sleep through the reaction step: calm last frame and the player too far from home to wake them. */
function calmCritters(list: readonly Critter[], tune: { readonly release: number }): { asleep(i: number, c: Critter): boolean; settle(i: number, calm: boolean): void } {
  const calm = new Uint8Array(list.length).fill(1);
  const wake = new Float64Array(list.length);
  for (let i = 0; i < list.length; i++) wake[i] = (tune.release + list[i]!.r + 1) ** 2;
  return {
    asleep: (i, c) => {
      const dx = PLAYER.x - c.x;
      const dz = PLAYER.z - c.z;
      return calm[i] === 1 && (!PLAYER.near || dx * dx + dz * dz > wake[i]!);
    },
    settle: (i, still) => {
      calm[i] = still ? 1 : 0;
    },
  };
}

/** Half-width (m) a cat or dog keeps off obstacles, and how far inside its island's rim its centre stays. */
const PET_BODY = 0.3;
const PET_RIM = 0.6;
/** Height (m) of the lower end of the body capsule kept out of world solids (cliff walls, stairs, terraces): its foot clears paths by 0.15 m. */
const PET_PROBE = 0.45;
/** Squared speed (m²/s²) under which a pet off its wander is standing: it was pushed clear while it moved, so it skips the probe. */
const PET_STILL = 0.01;

/** Each pet's ground (`keepClear`): its island's disc, then the obstacles within `reach` m of its wander circle; critter i's run is from[i]..from[i + 1]. */
function groundAreas(view: WorldView, list: readonly Critter[], reach: number): { area: Float64Array; from: Uint32Array } {
  const islands = [...view.layout.hubs, ...view.layout.zones];
  const out: number[] = [];
  const from = new Uint32Array(list.length + 1);
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    from[i] = out.length;
    const own = islands.find((d) => Math.hypot(d.x - c.x, d.z - c.z) < d.radius);
    out.push(own?.x ?? c.x, own?.z ?? c.z, own ? own.radius - PET_RIM : c.r + reach);
    for (const o of view.dressing.obstacles) {
      if (Math.hypot(o.x - c.x, o.z - c.z) < c.r + reach + o.r + PET_BODY) out.push(o.x, o.z, o.r);
    }
  }
  from[list.length] = out.length;
  return { area: new Float64Array(out), from };
}

/** Butterflies: two flapping two-sided wings per instance (scenery material, no extra shader), round flower beds and fountains; they scatter up from the player. */
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
  const mesh = new InstancedMesh(wing, view.kit.sceneryInstanced, list.length * per);
  mesh.name = 'butterfly';
  mesh.frustumCulled = false;
  view.stage.add(mesh);
  teardown.push(() => {
    mesh.removeFromParent();
    mesh.dispose();
  });
  const tune = CRITTERS.butterfly;
  const state = critterState(list.length * per);
  const calm = calmCritters(list, tune);
  const m = new Object3D();
  return (t, dt) => {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      if (!view.sees(c.x, c.z)) continue;
      const asleep = calm.asleep(i, c);
      let still = true;
      for (let k = 0; k < per; k++) {
        const j = i * per + k;
        const p = i * 2.3 + k * 3.1;
        const a = t * (0.6 + k * 0.2) + p;
        const bx = c.x + Math.cos(a) * c.r + Math.sin(t * 1.7 + p) * 0.3;
        const bz = c.z + Math.sin(a * 1.3) * c.r;
        const bob = c.y + Math.sin(t * 2.3 + p) * 0.35;
        if (asleep) m.position.set(bx, bob, bz);
        else {
          if (!reactStep(state, j, tune, bx, bz, -a, c.x, c.z, c.r + tune.leash, PLAYER.near, PLAYER.x, PLAYER.z, PLAYER.v, dt)) still = false;
          const o = j * C.size;
          m.position.set(bx + state[o + C.ox]!, bob + rise(state, j, tune), bz + state[o + C.oz]!);
        }
        m.rotation.set(0, -a, 0);
        m.scale.set(Math.abs(Math.sin(t * 14 + p)) * 0.9 + 0.1, 1, 1);
        m.updateMatrix();
        mesh.setMatrixAt(n++, m.matrix);
      }
      calm.settle(i, asleep || still);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** Chimney and campfire smoke, one instanced draw (not on low). */
function smoke(view: WorldView, sources: readonly SmokeSource[], teardown: (() => void)[]): Mover {
  const puffs = new Smoke(sources, view.quality.tier);
  view.stage.add(puffs.mesh);
  precompile(view, puffs.mesh);
  teardown.push(() => puffs.dispose());
  return (t) => puffs.update(t, view.stage.camera.position);
}

/** Campfire flames and embers on the lamp-glow material, plus a ground glow (the low tier draws no campfire models, so none). */
function fires(view: WorldView, spots: readonly SmokeSource[], teardown: (() => void)[]): Mover {
  const glow = view.kit.glow as MeshBasicMaterial;
  const fire = new Campfires(spots, view.quality.tier, glow, glow.color.r);
  view.stage.add(fire.flames);
  if (fire.glow) {
    view.stage.add(fire.glow);
    precompile(view, fire.glow);
  }
  teardown.push(() => fire.dispose());
  return (t) => fire.update(t, view.stage.camera.position);
}

/** Links a new effect's shader program now (for the tier's post chain target or the canvas), not in the frame it first shows. */
function precompile(view: WorldView, mesh: Object3D): void {
  const r = view.stage.renderer;
  const warm = WARMUPS.get(r) ?? new GpuWarmup(r);
  WARMUPS.set(r, warm);
  warm.compile(mesh, view.stage.camera, view.stage.scene, QUALITY[view.quality.tier].post);
}
const WARMUPS = new WeakMap<WebGLRenderer, GpuWarmup>();

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
  // The flock wheels over wherever the player is (eased after the camera), so the sky above every island has gulls.
  const centre = { x: view.layout.spawn.x, z: view.layout.spawn.z };
  return (t, dt) => {
    const eye = view.stage.camera.position;
    const k = 1 - Math.exp(-dt / 4);
    centre.x += (eye.x - centre.x) * k;
    centre.z += (eye.z - centre.z) * k;
    for (let i = 0; i < n; i++) {
      const r = 14 + (i % 3) * 7 + (i % 5);
      const a = t * (0.16 + (i % 2) * 0.04) * (i % 4 === 3 ? -1 : 1) + (i * 2 * Math.PI) / n;
      m.position.set(centre.x + Math.cos(a) * r, 11 + (i % 4) * 2.2 + Math.sin(t + i) * 0.6, centre.z + Math.sin(a) * r);
      m.rotation.set(0, i % 4 === 3 ? Math.PI - a : -a, 0);
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
const SHIRTS = [0xe5484d, 0x2f7fe0, 0xff9a3c, 0x8e5ad8, 0x2fa39a, 0xf07aa8, 0xf6c445, 0x5ed8d2, 0x5db761];

/** Whether (x, z) is on the island the player stands on (its circle plus the shore): kids show only there. */
function onIsland(view: WorldView, x: number, z: number): boolean {
  const hubs = view.layout.hubs;
  const c = view.island < hubs.length ? hubs[view.island] : view.layout.zones[view.island - hubs.length];
  return c !== undefined && Math.hypot(x - c.x, z - c.z) <= c.radius + KID_SHORE;
}

/** NPC kids by `ROLES`: sitting or playing at the hangouts nearest the spawn, strolling from the plaza fountain, walking the paths. */
async function kids(view: WorldView, avatars: AvatarFactory, count: number, shadows: boolean): Promise<Mover[]> {
  const out: Mover[] = [];
  const spawn = view.layout.spawn;
  const near = (x: number, z: number) => Math.hypot(x - spawn.x, z - spawn.z);
  const spots = [...view.dressing.hangouts].sort((a, b) => near(a.x, a.z) - near(b.x, b.z));
  const sights = sightsOf(view.dressing, view.layout.hubs[0]).sort((a, b) => near(a.x, a.z) - near(b.x, b.z));
  const seat = spots.find((h) => h.kind === 'sit') ?? spots[0];
  const play = spots.find((h) => h.kind === 'play') ?? spots[1];
  let strollers = 0;
  const taken = new Set<number>();
  const walks = [...view.dressing.paths].filter((p) => Math.hypot(p.bx - p.ax, p.bz - p.az) > 6).sort((a, b) => near(a.ax, a.az) - near(b.ax, b.az));
  for (let i = 0; i < count; i++) {
    const ids = avatars.bodies.map((b) => b.id);
    const skin = SKINS.slice(i % SKINS.length).find((s) => ids.includes(s)) ?? ids[i % ids.length]!;
    const avatar = await avatars.create({ skin, tint: SHIRTS[i % SHIRTS.length]! });
    avatar.root.traverse((o) => (o.castShadow = shadows));
    view.stage.add(avatar.root);
    const role = ROLES[i % ROLES.length]!;
    const hang = role === 'sit' ? seat : role === 'play' ? play : undefined;
    const draw = (move: Mover): Mover => (t, dt) => {
      const eye = view.stage.camera.position;
      const at = avatar.root.position;
      const kx = eye.x - at.x;
      const kz = eye.z - at.z;
      avatar.root.visible = kx * kx + kz * kz < KID_DRAW * KID_DRAW && onIsland(view, at.x, at.z);
      if (avatar.root.visible) move(t, dt);
    };
    const speed = WALK_PACE + hash01(i, 21) * WALK_SPREAD;
    const pause = 2 + (i % 2);
    const route = hang
      ? null
      : ((role === 'walk' ? pathWalk(walks, taken, sights, view.dressing.obstacles, speed, pause) : null) ?? stroll(strollers++, sights, view.dressing.obstacles, speed, pause));
    if (hang) out.push(draw(hangout(avatar, hang, i)));
    else if (route) out.push(draw(walker(avatar, route, i, speed, sights)));
    else {
      avatar.root.position.set(Math.cos(i * 1.3) * 4.2, 0, Math.sin(i * 1.3) * 4.2);
      avatar.play('idle');
      out.push(draw((_t, dt) => avatar.update(dt)));
    }
  }
  return out;
}

/** The walk of the nearest untaken path with a visit on it (else the nearest untaken path), now taken; null when none is left. */
function pathWalk(walks: readonly Segment[], taken: Set<number>, sights: readonly Sight[], obstacles: Dressing['obstacles'], speed: number, pause: number): Route | null {
  let bare = -1;
  for (let k = 0; k < walks.length; k++) {
    if (taken.has(k)) continue;
    const w = walks[k]!;
    const route = walkerRoute(w.ax, w.az, w.bx, w.bz, sights, obstacles, speed, pause);
    if (route.sight.some((s) => s >= 0)) {
      taken.add(k);
      return route;
    }
    if (bare < 0) bare = k;
  }
  if (bare < 0) return null;
  taken.add(bare);
  const w = walks[bare]!;
  return walkerRoute(w.ax, w.az, w.bx, w.bz, sights, obstacles, speed, pause);
}

/** The first stroll that starts at sight `from` or the next ones round the list (nearest the spawn first), or null. */
function stroll(from: number, sights: readonly Sight[], obstacles: Dressing['obstacles'], speed: number, pause: number): Route | null {
  for (let k = 0; k < sights.length; k++) {
    const route = strollRoute((from + k) % sights.length, sights, obstacles, speed, pause);
    if (route) return route;
  }
  return null;
}

function hangout(avatar: Avatar, h: Hangout, i: number): Mover {
  if (h.kind === 'sit') {
    const side = i % ROLES.length === ROLES.indexOf('sit') ? -SIT_SIDE : SIT_SIDE;
    avatar.root.position.set(h.x + Math.cos(h.face) * side, (h.seat ?? 0.06) - SEAT, h.z - Math.sin(h.face) * side);
    avatar.root.rotation.y = h.face;
    avatar.play('sit');
    return (_t, dt) => avatar.update(dt);
  }
  avatar.play('run');
  const period = 3.5 + (i % 3) * 1.3;
  return (t, dt) => {
    const a = t * 1.4 + i;
    const y = hop(t + i, period);
    avatar.root.position.set(h.x + Math.cos(a) * 1.3, 0.06 + y, h.z + Math.sin(a) * 1.3);
    avatar.root.rotation.y = -a + Math.PI;
    avatar.play(y > 0 ? 'jump' : 'run');
    avatar.update(dt);
  };
}

/** Stalls, signs and fountains on every island, sized by the obstacle each stands in, and the spawn plaza's fountain. */
function sightsOf(d: Dressing, plaza: { readonly x: number; readonly z: number } | undefined): Sight[] {
  const out: Sight[] = [];
  const fountain = plaza && d.obstacles.find((o) => Math.hypot(o.x - plaza.x, o.z - plaza.z) < 0.5);
  if (fountain) out.push({ x: fountain.x, z: fountain.z, r: fountain.r, up: -0.6 });
  for (const district of d.districts) {
    for (const p of district.placements) {
      const kind = SIGHTS[p.id];
      if (!kind) continue;
      const own = d.obstacles.find((o) => Math.hypot(o.x - p.x, o.z - p.z) < 0.5);
      out.push({ x: p.x, z: p.z, r: own?.r ?? kind.r, up: kind.up });
    }
  }
  return out;
}

/** A walker on its route at its own pace: stands and looks round at bare stops, looks at the stall or sign it visits, turning smoothly. */
function walker(avatar: Avatar, route: Route, i: number, speed: number, sights: readonly Sight[]): Mover {
  const n = route.x.length;
  const pose: RoutePose = { x: route.x[n - 1]!, z: route.z[n - 1]!, heading: Math.atan2(route.x[0]! - route.x[n - 1]!, route.z[0]! - route.z[n - 1]!), walking: true, sight: -1 };
  let facing = pose.heading;
  let looking = -1;
  avatar.play('walk');
  return (t, dt) => {
    routeAt(route, t + i * 3, pose);
    const s = pose.sight >= 0 ? sights[pose.sight]! : null;
    const want = s ? Math.atan2(s.x - pose.x, s.z - pose.z) : pose.walking ? pose.heading : pose.heading + 0.7 * Math.sin(t * 1.6 + i);
    const d = Math.atan2(Math.sin(want - facing), Math.cos(want - facing));
    const turned = d * Math.min(1, WALK_TURN * dt);
    facing += turned;
    if (pose.sight !== looking) {
      looking = pose.sight;
      if (s) avatar.gaze(s.x, s.z, s.up);
      else avatar.gaze(NaN);
    }
    avatar.play(pose.walking ? 'walk' : 'idle');
    avatar.setMotion(pose.walking ? speed : 0, dt > 0 ? turned / dt : 0);
    avatar.root.position.set(pose.x, 0.06, pose.z);
    avatar.root.rotation.y = facing;
    avatar.update(dt);
  };
}
