import {
  BoxGeometry,
  CircleGeometry,
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
import type { Look, LookPalette } from './look';
import type { Circle, WorldLayout } from './layout';
import { paint, type MaterialKit } from './material-kit';
import { Palette, PurposeColor } from './palette';
import { seededRandom } from './random';
import { waterMaterial } from './water';

/** World units per stud on baseplate tops. */
export const STUD = 0.5;
const WATER_Y = -3;
const PLAZA = 7;
const PAD = 3.6;
const PAD_H = 0.3;

/** Static island scene: land, studded tops, water and clouds, a few merged meshes in total. */
export class IslandBuilder {
  private land: BufferGeometry[] = [];
  private tops: BufferGeometry[] = [];
  private clouds: BufferGeometry[] = [];
  private readonly p: LookPalette;

  constructor(
    private readonly kit: MaterialKit,
    private readonly look: Look,
  ) {
    this.p = look.palette;
  }

  build(world: WorldData, layout: WorldLayout): Group {
    this.land = [];
    this.tops = [];
    this.clouds = [];
    const purposes = new Map(world.sections.flatMap((s) => s.activities).map((a) => [a.id, a.purpose]));

    for (const hub of layout.hubs) {
      this.island(hub);
    }
    this.top(new CircleGeometry(PLAZA, 40), this.p.path[0] ?? Palette.stone, 0, 0.02, 0);
    this.add(this.land, new CylinderGeometry(PLAZA + 0.15, PLAZA + 0.15, 0.1, 40, 1, true), this.p.stoneDark, 0, 0.0, 0);
    this.box(3.2, 0.3, 3.2, this.p.stoneDark, 0, 0.15, 0);
    this.top(new PlaneGeometry(3.2, 3.2), Palette.blue, 0, 0.31, 0);
    for (const zone of layout.zones) {
      this.island(zone);
      for (const p of zone.plots) {
        const color = PurposeColor[purposes.get(p.activityId) ?? 'other'] ?? Palette.pink;
        this.box(PAD, PAD_H, PAD, Palette.white, p.x, PAD_H / 2, p.z, p.facing);
        this.top(new PlaneGeometry(PAD - 0.3, PAD - 0.3), color, p.x, PAD_H + 0.01, p.z, p.facing);
      }
    }
    this.cloudBank(world.courseId, layout.extent);

    const group = new Group();
    group.name = 'islands';
    group.add(this.mesh('land', this.land, this.kit.plastic, true));
    group.add(this.mesh('tops', this.tops, this.kit.studs, true));
    const water = this.mesh('water', [this.water()], waterMaterial(this.look, [...layout.hubs, ...layout.zones]), false);
    water.receiveShadow = false;
    group.add(water);
    group.add(this.mesh('clouds', this.clouds, this.kit.plastic, false));
    return group;
  }

  private island(c: Circle): void {
    const seg = Math.max(32, Math.round(c.radius * 4));
    this.top(new CircleGeometry(c.radius, seg), this.p.grass, c.x, 0, c.z);
    this.add(this.land, new CylinderGeometry(c.radius, c.radius, 0.4, seg, 1, true), this.p.grassLight, c.x, -0.2, c.z);
    this.add(this.land, new CylinderGeometry(c.radius, c.radius * 0.93, 0.9, seg, 1, true), this.p.dirt, c.x, -0.85, c.z);
    this.add(this.land, new CylinderGeometry(c.radius * 0.93, c.radius * 0.85, 3, seg, 1, true), this.p.dirtDark, c.x, -2.8, c.z);
    this.add(this.land, new CylinderGeometry(c.radius + 0.9, c.radius + 1.6, 0.3, seg), this.p.sand, c.x, WATER_Y + 0.12, c.z);
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
      const flat = new Vector3(1, 0.45, 0.6);
      this.add(this.clouds, new SphereGeometry(w * 0.5, 12, 8), this.p.cloud, x, y, z, a, flat);
      this.add(this.clouds, new SphereGeometry(w * 0.32, 12, 8), this.p.cloud, x + w * 0.3, y + 1.2, z, a, flat);
      this.add(this.clouds, new SphereGeometry(w * 0.28, 12, 8), this.p.cloud, x - w * 0.35, y + 0.6, z + 0.6, a, flat);
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
