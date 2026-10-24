import { BufferAttribute, BufferGeometry, InstancedMesh, MeshLambertMaterial, Object3D, Points, PointsMaterial, type Material } from 'three';
import type { WorldView } from '../boot/app';
import type { AvatarFactory } from '../player/avatar-kit';
import type { LifeSpot, Segment } from './dressing';
import type { ModelLibrary } from './model-library';
import { seededRandom } from './random';
import { singleModel } from './scenery';

/** Ambient life: waving flags and bobbing boats (one instanced mesh per model), gulls, petals; kids on the paths unless low tier. */
export async function startLife(view: WorldView, lib: ModelLibrary, avatars: AvatarFactory | null): Promise<void> {
  const movers: ((t: number, dt: number) => void)[] = [];
  let teardown: (() => void)[] = [];
  const build = (): void => {
    for (const off of teardown) off();
    teardown = [];
    movers.length = 0;
    const { life } = view.dressing;
    for (const kind of ['flag', 'boat'] as const) {
      const spots = life.filter((s) => s.kind === kind);
      if (spots.length) movers.push(instanced(view, lib, spots, view.kit.scenery, teardown));
    }
    movers.push(birds(view, teardown), petals(view, teardown));
  };
  build();
  view.onRebuild(build);
  if (avatars) movers.push(...(await kids(view, avatars, view.dressing.paths)));
  let t = 0;
  view.onFrame((dt) => {
    t += dt;
    for (const m of movers) m(t, dt);
  });
}

function instanced(view: WorldView, lib: ModelLibrary, spots: readonly LifeSpot[], material: Material, teardown: (() => void)[]): (t: number) => void {
  const first = spots[0]!;
  const geometry = singleModel(lib, first.id, 1);
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
        m.position.y = s.y + Math.sin(t * 1.3 + phase) * 0.06;
        m.rotation.set(0, s.yaw, Math.sin(t * 0.9 + phase) * 0.04);
      }
      m.updateMatrix();
      mesh.setMatrixAt(i, m.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** A flock of low-poly gulls circling above the islands, wings flapping. */
function birds(view: WorldView, teardown: (() => void)[]): (t: number) => void {
  const wing = new BufferGeometry();
  wing.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 0.35, -0.08, 0, -0.3, 0.08, 0, -0.3, 0, 0.02, 0.05, -0.75, 0.12, -0.2, -0.05, 0, -0.12, 0, 0.02, 0.05, 0.05, 0, -0.12, 0.75, 0.12, -0.2]), 3),
  );
  wing.computeVertexNormals();
  const n = 9;
  const flock = new InstancedMesh(wing, new MeshLambertMaterial({ color: 0xf8f8f8, side: 2 }), n);
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
function petals(view: WorldView, teardown: (() => void)[]): (t: number) => void {
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

const KIDS = [
  { skin: 'a', tint: 0xe23d2b },
  { skin: 'c', tint: 0x1e88e5 },
];

/** NPC kids walking to and fro on the walks nearest the hub (idling on the plaza when there are none). */
async function kids(view: WorldView, avatars: AvatarFactory, paths: readonly Segment[]): Promise<((t: number, dt: number) => void)[]> {
  const out: ((t: number, dt: number) => void)[] = [];
  const long = [...paths].filter((p) => Math.hypot(p.bx - p.ax, p.bz - p.az) > 6).sort((a, b) => Math.hypot(a.ax, a.az) - Math.hypot(b.ax, b.az));
  for (let i = 0; i < KIDS.length; i++) {
    const avatar = await avatars.create(KIDS[i]!);
    view.stage.add(avatar.root);
    const path = long[i];
    if (!path) {
      avatar.root.position.set(Math.cos(i * 1.3) * 4.2, 0, Math.sin(i * 1.3) * 4.2);
      avatar.root.rotation.y = i * 1.3 + Math.PI;
      avatar.play('idle');
      out.push((_t, dt) => avatar.update(dt));
      continue;
    }
    avatar.play('walk');
    const len = Math.hypot(path.bx - path.ax, path.bz - path.az);
    out.push((t, dt) => {
      const s = (t * 1.3 + i * 3) % (2 * len);
      const k = s < len ? s / len : 2 - s / len;
      const back = s >= len;
      const side = 0.5 * (back ? -1 : 1);
      const nx = (path.bz - path.az) / len;
      const nz = -(path.bx - path.ax) / len;
      avatar.root.position.set(path.ax + (path.bx - path.ax) * k + nx * side, 0.06, path.az + (path.bz - path.az) * k + nz * side);
      avatar.root.rotation.y = Math.atan2((path.bx - path.ax) * (back ? -1 : 1), (path.bz - path.az) * (back ? -1 : 1));
      avatar.update(dt);
    });
  }
  return out;
}
