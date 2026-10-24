import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldData } from '../domain/types';
import type { DecorSpot } from './decor';
import type { Circle, WorldLayout } from './layout';
import { paint, type MaterialKit } from './material-kit';
import { Palette, PurposeColor } from './palette';
import { seededRandom } from './random';

/** World units per stud on baseplate tops. */
export const STUD = 0.5;
const WATER_Y = -1;
const PLAZA = 7;
const PAD = 3.6;
const PAD_H = 0.3;
const BRIDGE_W = 3;
const PLANK = 0.6;

/** Static island scene: land, studded tops, water and clouds, a few merged meshes in total. */
export class IslandBuilder {
  private land: BufferGeometry[] = [];
  private tops: BufferGeometry[] = [];
  private clouds: BufferGeometry[] = [];

  constructor(private readonly kit: MaterialKit) {}

  build(world: WorldData, layout: WorldLayout, decor: readonly DecorSpot[]): Group {
    this.land = [];
    this.tops = [];
    this.clouds = [];
    const purposes = new Map(world.sections.flatMap((s) => s.activities).map((a) => [a.id, a.purpose]));

    this.island(layout.hub);
    this.top(new CircleGeometry(PLAZA, 40), Palette.stone, 0, 0.02, 0);
    this.box(3.2, 0.3, 3.2, Palette.stoneDark, 0, 0.15, 0);
    this.top(new PlaneGeometry(3.2, 3.2), Palette.blue, 0, 0.31, 0);
    for (const zone of layout.zones) {
      this.island(zone);
      this.bridge(layout.hub, zone);
      for (const p of zone.plots) {
        const color = PurposeColor[purposes.get(p.activityId) ?? 'other'] ?? Palette.pink;
        this.box(PAD, PAD_H, PAD, Palette.white, p.x, PAD_H / 2, p.z, p.facing);
        this.top(new PlaneGeometry(PAD - 0.3, PAD - 0.3), color, p.x, PAD_H + 0.01, p.z, p.facing);
      }
    }
    for (const d of decor) {
      this.decor(d);
    }
    this.cloudBank(world.courseId, layout.extent);

    const group = new Group();
    group.name = 'islands';
    group.add(this.mesh('land', this.land, this.kit.plastic, true));
    group.add(this.mesh('tops', this.tops, this.kit.studs, true));
    group.add(this.mesh('water', [this.water()], this.kit.plastic, false));
    group.add(this.mesh('clouds', this.clouds, this.kit.plastic, false));
    return group;
  }

  private island(c: Circle): void {
    const seg = Math.max(32, Math.round(c.radius * 4));
    this.top(new CircleGeometry(c.radius, seg), Palette.grass, c.x, 0, c.z);
    this.add(this.land, new CylinderGeometry(c.radius, c.radius, 0.4, seg, 1, true), Palette.grassLight, c.x, -0.2, c.z);
    this.add(this.land, new CylinderGeometry(c.radius, c.radius * 0.8, 2.6, seg, 1, true), Palette.dirt, c.x, -1.7, c.z);
    this.add(this.land, new CylinderGeometry(c.radius + 1.4, c.radius + 2, 0.3, seg), Palette.sand, c.x, WATER_Y + 0.12, c.z);
  }

  private bridge(hub: Circle, zone: Circle & { angle: number }): void {
    const dist = Math.hypot(zone.x, zone.z);
    const from = hub.radius - 0.8;
    const to = dist - zone.radius + 0.8;
    const yaw = Math.atan2(zone.x, zone.z);
    const dx = zone.x / dist;
    const dz = zone.z / dist;
    let i = 0;
    for (let t = from; t <= to; t += PLANK, i++) {
      this.box(BRIDGE_W, 0.2, PLANK - 0.08, i % 2 ? Palette.wood : Palette.woodDark, dx * t, 0.1, dz * t, yaw);
    }
    const mid = (from + to) / 2;
    const len = to - from;
    for (const side of [-1, 1]) {
      const ox = dz * side * (BRIDGE_W / 2 - 0.1);
      const oz = -dx * side * (BRIDGE_W / 2 - 0.1);
      this.box(0.2, 0.2, len, Palette.woodDark, dx * mid + ox, 0.9, dz * mid + oz, yaw);
      for (let t = from + 0.5; t < to; t += 2) {
        this.box(0.25, 1.9, 0.25, Palette.woodDark, dx * t + ox, -0.05, dz * t + oz, yaw);
      }
    }
  }

  private decor(d: DecorSpot): void {
    const s = d.scale;
    switch (d.kind) {
      case 'tree':
        this.add(this.land, new CylinderGeometry(0.22 * s, 0.32 * s, 1.8 * s, 8), Palette.wood, d.x, 0.9 * s, d.z);
        this.add(this.land, new SphereGeometry(1.25 * s, 14, 10), Palette.leaves, d.x, 2.5 * s, d.z);
        break;
      case 'pine':
        this.add(this.land, new CylinderGeometry(0.2 * s, 0.28 * s, 1.2 * s, 8), Palette.wood, d.x, 0.6 * s, d.z);
        this.add(this.land, new ConeGeometry(1.3 * s, 1.8 * s, 10), Palette.leavesDark, d.x, 1.8 * s, d.z, d.yaw);
        this.add(this.land, new ConeGeometry(1 * s, 1.5 * s, 10), Palette.leavesDark, d.x, 2.7 * s, d.z, d.yaw);
        this.add(this.land, new ConeGeometry(0.7 * s, 1.2 * s, 10), Palette.leavesDark, d.x, 3.5 * s, d.z, d.yaw);
        break;
      case 'bush':
        this.add(this.land, new SphereGeometry(0.75 * s, 12, 8), Palette.grassLight, d.x, 0.35 * s, d.z, 0, new Vector3(1, 0.75, 1));
        break;
      case 'rock':
        this.add(this.land, new BoxGeometry(1.1 * s, 0.7 * s, 0.9 * s), Palette.stone, d.x, 0.3 * s, d.z, d.yaw);
        this.add(this.land, new BoxGeometry(0.6 * s, 0.5 * s, 0.6 * s), Palette.stoneDark, d.x + 0.5 * s, 0.25 * s, d.z, d.yaw + 0.5);
        break;
    }
  }

  private cloudBank(seed: number, extent: number): void {
    const random = seededRandom(seed ^ 0x51ed27);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 2 * Math.PI + random();
      const r = extent * (1.2 + random() * 1.2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = 60 + random() * 15;
      const w = 6 + random() * 6;
      this.add(this.clouds, new BoxGeometry(w, 2, w * 0.55), Palette.white, x, y, z, a);
      this.add(this.clouds, new BoxGeometry(w * 0.55, 1.6, w * 0.4), Palette.white, x + 1.5, y + 1.4, z, a);
      this.add(this.clouds, new BoxGeometry(w * 0.4, 1.2, w * 0.35), Palette.white, x - w * 0.4, y + 0.8, z + 0.6, a);
    }
  }

  private water(): BufferGeometry {
    const g = new CircleGeometry(1500, 96);
    g.applyMatrix4(new Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, WATER_Y, 0));
    return paint(g, Palette.water);
  }

  private box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, yaw = 0): void {
    this.add(this.land, new BoxGeometry(w, h, d), color, x, y, z, yaw);
  }

  /** A flat studded top: horizontal, uv in studs from world x/z. */
  private top(g: BufferGeometry, color: number, x: number, y: number, z: number, yaw = 0): void {
    g.rotateX(-Math.PI / 2);
    g.rotateY(yaw);
    g.translate(x, y, z);
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / STUD, pos.getZ(i) / STUD);
    }
    this.tops.push(paint(g, color));
  }

  private add(
    into: BufferGeometry[],
    g: BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
    yaw = 0,
    scale = new Vector3(1, 1, 1),
  ): void {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    g.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z), q, scale));
    into.push(paint(g, color));
  }

  private mesh(name: string, parts: BufferGeometry[], material: Material, cast: boolean): Mesh {
    const merged = mergeGeometries(parts, false);
    for (const p of parts) {
      p.dispose();
    }
    if (!merged) {
      throw new Error(`mooblox: cannot merge ${name}`);
    }
    const mesh = new Mesh(merged, material);
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
