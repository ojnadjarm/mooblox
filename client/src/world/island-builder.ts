import {
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  IcosahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
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
import { bakedWaterGeometry, waterMaterial } from './water';

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
    /** Low tier: baked vertex-colour water instead of the per-pixel shader, coarser island rims. */
    private readonly low = false,
    /** Rim segments per metre of island radius (medium uses fewer than high). */
    private readonly rimDetail = low ? 1.5 : 4,
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
    this.plaza();
    for (const zone of layout.zones) {
      this.island(zone);
      for (const p of zone.plots) {
        const color = PurposeColor[purposes.get(p.activityId) ?? 'other'] ?? Palette.pink;
        this.box(PAD, PAD_H, PAD, this.p.trim, p.x, PAD_H / 2, p.z, p.facing);
        this.top(new PlaneGeometry(PAD - 0.3, PAD - 0.3), color, p.x, PAD_H + 0.01, p.z, p.facing);
      }
    }
    this.cloudBank(world.courseId, layout.extent);

    const group = new Group();
    group.name = 'islands';
    // The lawn and rims are flat or face the unshadowed water: they receive the sun's shadow but never need to cast one.
    group.add(this.mesh('land', this.land, this.kit.plastic, false));
    group.add(this.mesh('tops', this.tops, this.kit.studs, true));
    const circles = [...layout.hubs, ...layout.zones];
    const water = this.low
      ? this.mesh('water', [bakedWaterGeometry(this.look, circles, layout.extent, WATER_Y)], this.kit.glow, false)
      : this.mesh('water', [this.water()], waterMaterial(this.look, circles), false);
    water.receiveShadow = false;
    water.renderOrder = 1;
    group.add(water);
    group.add(this.mesh('clouds', this.clouds, this.kit.plastic, false));
    return group;
  }

  /** The spawn plaza: radial terracotta paving in a cream trim ring, a cream ring round a round, stepped blue spawn pad. */
  private plaza(): void {
    this.add(this.land, new CylinderGeometry(PLAZA + 0.5, PLAZA + 0.6, 0.12, 48), this.p.trimShade, 0, 0.06, 0);
    this.add(this.land, new CylinderGeometry(PLAZA + 0.3, PLAZA + 0.3, 0.04, 48), this.p.trim, 0, 0.1, 0);
    const wedges = 16;
    for (let i = 0; i < wedges; i++) {
      const g = new CylinderGeometry(PLAZA, PLAZA, 0.1, 3, 1, false, (i / wedges) * Math.PI * 2, (Math.PI * 2) / wedges);
      this.add(this.land, g, i % 2 ? this.p.path[0]! : this.p.path[2]!, 0, 0.08, 0);
    }
    this.add(this.land, new CylinderGeometry(3, 3, 0.16, 32), this.p.trim, 0, 0.08, 0);
    this.add(this.land, new CylinderGeometry(2.1, 2.3, 0.32, 24), this.p.trimShade, 0, 0.16, 0);
    this.top(new CircleGeometry(1.85, 24), Palette.blue, 0, 0.325, 0);
  }

  private island(c: Circle): void {
    const seg = Math.max(this.low ? 24 : 32, Math.round(c.radius * this.rimDetail));
    this.lawn(c, seg);
    this.add(this.land, new CylinderGeometry(c.radius, c.radius, 0.4, seg, 1, true), this.p.grassLight, c.x, -0.2, c.z);
    this.add(this.land, new CylinderGeometry(c.radius, c.radius * 0.93, 0.9, seg, 1, true), this.p.dirt, c.x, -0.85, c.z);
    this.add(this.land, new CylinderGeometry(c.radius * 0.93, c.radius * 0.85, 3, seg, 1, true), this.p.dirtDark, c.x, -2.8, c.z);
    this.add(this.land, new CylinderGeometry(c.radius + 0.9, c.radius + 1.6, 0.3, seg), this.p.sand, c.x, WATER_Y + 0.12, c.z);
  }

  /** The island's lawn: flat-coloured (no studs), with a soft warm-to-cool gradient across it. */
  private lawn(c: Circle, seg: number): void {
    const g = new RingGeometry(0, c.radius, seg, 2).rotateX(-Math.PI / 2).translate(c.x, 0, c.z);
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const lit = new Color(this.p.grass);
    const cool = new Color(this.p.grassLight);
    const k = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const t = 0.5 + 0.5 * Math.sin(x * 0.09 + z * 0.05) * Math.cos(z * 0.08 - x * 0.03);
      k.copy(lit).lerp(cool, t * 0.85);
      colors.set([k.r, k.g, k.b], i * 3);
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    this.land.push(g);
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
      this.add(this.clouds, new IcosahedronGeometry(w * 0.5, 0), this.p.cloud, x, y, z, a, flat);
      this.add(this.clouds, new IcosahedronGeometry(w * 0.34, 0), this.p.cloud, x + w * 0.32, y + 1.2, z, a + 0.7, flat);
      this.add(this.clouds, new IcosahedronGeometry(w * 0.3, 0), this.p.cloud, x - w * 0.36, y + 0.6, z + 0.6, a + 1.9, flat);
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
