import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  IcosahedronGeometry,
  LatheGeometry,
  PlaneGeometry,
  Vector2,
  Quaternion,
  RingGeometry,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldData } from '../domain/types';
import type { Look, LookPalette } from './look';
import type { Circle, WorldLayout } from './layout';
import { paint, type MaterialKit } from './material-kit';
import { Palette, PurposeColor } from './palette';
import { seededRandom } from './random';
import { Surface, type SurfaceId } from './surfaces';
import { bakedWaterGeometry, waterMaterial } from './water';

/** World units per stud on baseplate tops. */
export const STUD = 0.5;
const WATER_Y = -3;
const PLAZA = 7;
const PAD = 3.6;
const PAD_H = 0.3;
/** Ground decals sit just under the 6 cm walks and every pad, plaza and building, so only open lawn shows them. */
const DECAL_Y = 0.025;

/** Static island scene: land, studded tops, water and clouds, a few merged meshes in total. */
export class IslandBuilder {
  private land: BufferGeometry[] = [];
  private tops: BufferGeometry[] = [];
  private clouds: BufferGeometry[] = [];
  /** Island index (hubs, then zones) of each land and tops part, for the per-island meshes. */
  private landOwner: number[] = [];
  private topsOwner: number[] = [];
  private owner = 0;
  /** Atlas layer the next added part is tagged with. */
  private surface: SurfaceId = Surface.plain;
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
    this.landOwner = [];
    this.topsOwner = [];
    const purposes = new Map(world.sections.flatMap((s) => s.activities).map((a) => [a.id, a.purpose]));

    layout.hubs.forEach((hub, i) => {
      this.owner = i;
      this.island(hub);
      this.decals(hub, world.courseId * 31 + i, [{ x: 0, z: 0, r: PLAZA + 2 }, { x: hub.x, z: hub.z, r: Math.min(hub.radius * 0.45, 9) }]);
    });
    this.owner = 0;
    this.plaza();
    layout.zones.forEach((zone, i) => {
      this.owner = layout.hubs.length + i;
      this.island(zone);
      this.decals(zone, world.courseId * 31 + 1000 + i, zone.plots.map((p) => ({ x: p.x, z: p.z, r: PAD })));
      for (const p of zone.plots) {
        const color = PurposeColor[purposes.get(p.activityId) ?? 'other'] ?? Palette.pink;
        this.surface = Surface.paving;
        this.add(this.land, roundedPad(PAD, PAD_H), this.p.trim, p.x, 0, p.z, p.facing);
        this.surface = Surface.plain;
        this.top(new PlaneGeometry(PAD - 0.3, PAD - 0.3), color, p.x, PAD_H + 0.01, p.z, p.facing);
      }
    });
    this.cloudBank(world.courseId, layout.extent);

    const group = new Group();
    group.name = 'islands';
    group.add(this.perIsland(layout.hubs.length + layout.zones.length));
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

  /**
   * The same land and tops split per island (one group each, island order): play draws only the live islands; the merged
   * meshes stay for the overview and the collider.
   */
  private perIsland(count: number): Group {
    const parts = new Group();
    parts.name = 'island-land';
    for (let i = 0; i < count; i++) {
      const g = new Group();
      g.name = 'land-part';
      const land = this.land.filter((_, k) => this.landOwner[k] === i);
      const tops = this.tops.filter((_, k) => this.topsOwner[k] === i);
      for (const [name, list, material, cast] of [['land', land, this.kit.plastic, false], ['tops', tops, this.kit.studs, true]] as const) {
        const merged = list.length ? mergeGeometries(list, false) : null;
        if (!merged) continue;
        const m = new Mesh(merged, material);
        m.name = name;
        m.castShadow = cast;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        g.add(m);
      }
      g.visible = false;
      parts.add(g);
    }
    return parts;
  }

  /** The spawn plaza: radial terracotta paving in a cream trim ring (the designer puts the fountain in the middle). */
  private plaza(): void {
    this.surface = Surface.paving;
    // Paving, trim and shade step 1 cm apart: coplanar tops z-fight as the camera moves.
    this.add(this.land, new CylinderGeometry(PLAZA + 0.5, PLAZA + 0.6, 0.11, 48), this.p.trimShade, 0, 0.055, 0);
    this.add(this.land, new CylinderGeometry(PLAZA + 0.3, PLAZA + 0.3, 0.04, 48), this.p.trim, 0, 0.1, 0);
    this.surface = Surface.brick;
    const wedges = 16;
    for (let i = 0; i < wedges; i++) {
      const g = new CylinderGeometry(PLAZA, PLAZA, 0.1, 3, 1, false, (i / wedges) * Math.PI * 2, (Math.PI * 2) / wedges);
      this.add(this.land, g, i % 2 ? this.p.path[0]! : this.p.path[2]!, 0, 0.08, 0);
    }
    this.surface = Surface.plain;
  }

  private island(c: Circle): void {
    const seg = Math.max(this.low ? 24 : 32, Math.round(c.radius * this.rimDetail));
    this.lawn(c, seg);
    this.surface = Surface.grass;
    this.add(this.land, lip(c.radius, seg), this.p.grassLight, c.x, 0, c.z);
    this.surface = Surface.cliff;
    this.add(this.land, new CylinderGeometry(c.radius, c.radius * 0.93, 0.9, seg, 1, true), this.p.dirt, c.x, -0.85, c.z);
    this.add(this.land, new CylinderGeometry(c.radius * 0.93, c.radius * 0.85, 3, seg, 1, true), this.p.dirtDark, c.x, -2.8, c.z);
    this.surface = Surface.sand;
    this.add(this.land, new CylinderGeometry(c.radius + 0.9, c.radius + 1.6, 0.3, seg), this.p.sand, c.x, WATER_Y + 0.12, c.z);
    this.surface = Surface.plain;
  }

  /**
   * Painted ground decals on open lawn: flower meadows, worn dirt patches and puddles, seeded per island, kept off the plaza,
   * the pads and the rim. Merged into the land (no draw of their own); anything built on top hides them.
   */
  private decals(c: Circle, seed: number, keepOut: readonly { x: number; z: number; r: number }[]): void {
    const random = seededRandom(seed);
    const count = Math.round((c.radius * c.radius) / 22);
    const kinds = [
      { surface: Surface.meadow, colour: this.p.grass, r: [2, 3.4], share: 0.55 },
      { surface: Surface.ground, colour: this.p.dirt, r: [0.9, 1.7], share: 0.3 },
      { surface: Surface.metal, colour: 0x8fb6cf, r: [0.45, 0.85], share: 0.15 },
    ] as const;
    const placed: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const d = Math.sqrt(random()) * (c.radius - 3);
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      const roll = random();
      const kind = roll < kinds[0].share ? kinds[0] : roll < kinds[0].share + kinds[1].share ? kinds[1] : kinds[2];
      const r = kind.r[0] + random() * (kind.r[1] - kind.r[0]);
      // Decals share one height: one overlapping another would z-fight.
      if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + r) || placed.some((k) => Math.hypot(x - k.x, z - k.z) < (k.r + r) * 1.15)) continue;
      placed.push({ x, z, r });
      this.surface = kind.surface;
      this.add(this.land, blobGeometry(r, random), kind.colour, x, DECAL_Y, z, random() * 6);
    }
    this.surface = Surface.plain;
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
    this.land.push(tag(g, Surface.grass));
    this.landOwner.push(this.owner);
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
    this.tops.push(tag(paint(g, color), Surface.metal, true));
    this.topsOwner.push(this.owner);
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
    into.push(tag(paint(g, color), this.surface));
    if (into === this.land) this.landOwner.push(this.owner);
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

/** Tags every vertex with one atlas layer (`surface` attribute, the same set on every merged part). */
function tag(geometry: BufferGeometry, surface: SurfaceId, keepUv = false): BufferGeometry {
  if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i));
  if (!keepUv) geometry.deleteAttribute('uv');
  geometry.setAttribute('surface', new BufferAttribute(new Float32Array(geometry.getAttribute('position').count).fill(surface), 1));
  return geometry;
}

/** The island's grass edge: a rounded lip rolling over from the lawn down into the cliff (soft rim, no hard corner). */
function lip(radius: number, seg: number): BufferGeometry {
  const pts: Vector2[] = [];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push(new Vector2(radius - 0.35 + Math.sin(a) * 0.45, -0.35 + Math.cos(a) * 0.35));
  }
  pts.push(new Vector2(radius, -0.4));
  return new LatheGeometry(pts.reverse(), seg);
}

/** A plot pad: a cream slab with rounded corners and a chamfered top edge. */
function roundedPad(size: number, height: number): BufferGeometry {
  const half = size / 2;
  const r = 0.45;
  const pts: Vector2[] = [];
  for (const [cx, cz, a0] of [[half - r, half - r, 0], [-half + r, half - r, Math.PI / 2], [-half + r, -half + r, Math.PI], [half - r, -half + r, Math.PI * 1.5]] as const) {
    for (let k = 0; k <= 3; k++) {
      const a = a0 + (k / 3) * (Math.PI / 2);
      pts.push(new Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
  }
  const ring = (inset: number, y: number) => pts.map((p) => new Vector3(p.x * (1 - inset / half), y, p.y * (1 - inset / half)));
  const rings = [ring(0, 0), ring(0, height - 0.08), ring(0.08, height)];
  const pos: number[] = [];
  const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3) => pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
  const n = pts.length;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < n; i++) quad(rings[k]![i]!, rings[k]![(i + 1) % n]!, rings[k + 1]![i]!, rings[k + 1]![(i + 1) % n]!);
  }
  const top = rings[2]!;
  for (let i = 1; i < n - 1; i++) pos.push(top[0]!.x, top[0]!.y, top[0]!.z, top[i + 1]!.x, top[i + 1]!.y, top[i + 1]!.z, top[i]!.x, top[i]!.y, top[i]!.z);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** A soft irregular flat blob (decal), facing up. */
function blobGeometry(r: number, random: () => number): BufferGeometry {
  const n = 9;
  const pos: number[] = [];
  const rim = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = r * (0.75 + random() * 0.4);
    return [Math.cos(a) * k, Math.sin(a) * k] as const;
  });
  for (let i = 0; i < n; i++) {
    const [ax, az] = rim[i]!;
    const [bx, bz] = rim[(i + 1) % n]!;
    pos.push(0, 0, 0, bx, 0, bz, ax, 0, az);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}
