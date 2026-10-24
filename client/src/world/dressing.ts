import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { plotRings, segmentDistance } from './island-layout';
import type { Circle, WorldLayout, Zone } from './layout';
import type { LookPalette } from './look';
import FOOTPRINTS from './model-footprints.json';
import { seededRandom } from './random';

export const WATER_Y = -3;
/** Height of the bridge deck's walking surface. */
export const DECK_Y = 0.08;
/** Half the walkable width between the bridge rails. */
export const DECK_HALF = 1.35;
const DECK_W = 3.2;
const RAIL_H = 1;
const PLAZA = 7;
const SMALL_PLAZA = 6;
const CLIFF_TOP = 0.12;
const LAMP_STEP = 9;
const HEDGE_STEP = 1.5;
/** Hedge pieces per run and per run plus gap round a zone's rim. */
const HEDGE_RUN = 6;
const HEDGE_CYCLE = 9;
const HUB_AREA = 22 * 22;

export interface Segment {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
}

/** A moving model for the life layer: a flag that waves or a boat that bobs. */
export interface LifeSpot {
  readonly kind: 'flag' | 'boat';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly height: number;
}

/** One placed kit model: scaled to `height` (or `width`); solid ones collide, detail ones drop out at a distance. */
export interface Placement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly height: number;
  readonly width?: number;
  readonly sway?: boolean;
  readonly tint?: number;
  readonly solid: boolean;
  readonly detail: boolean;
}

/** Painted terrain geometry (paths, terraces, rails, piers) in world space. */
export interface TerrainPart {
  readonly geometry: BufferGeometry;
  readonly solid: boolean;
  readonly detail: boolean;
}

/** Ground circle a solid thing takes up (its full reach round its axis). */
export interface Obstacle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/** The dressing of one island and the bridge that reaches it: what one merged, LOD-switched mesh is built from. */
export interface District {
  readonly island: Circle;
  readonly placements: Placement[];
  readonly terrain: TerrainPart[];
  readonly glow: BufferGeometry[];
}

/** Everything the designer decides for a course; pure data, the same for the same layout and seed. */
export interface Dressing {
  readonly districts: readonly District[];
  readonly life: readonly LifeSpot[];
  readonly paths: readonly Segment[];
  readonly obstacles: readonly Obstacle[];
  /** Walkable bridge decks, rim to rim. */
  readonly bridges: readonly Segment[];
}

interface Footprint {
  readonly h: number;
  readonly w: number;
  readonly r: number;
}

const FOOT = FOOTPRINTS as Readonly<Record<string, Footprint>>;

const TREES: readonly (readonly [string, number])[] = [['suburb/tree-large', 5], ['town/tree-high-round', 5.4], ['nature/tree_detailed', 4.6], ['nature/tree_oak', 4.2]];
const BUSHES: readonly (readonly [string, number])[] = [['nature/plant_bushDetailed', 0.9], ['nature/plant_bushLarge', 1]];
const FLOWERS = ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA'];
const ROCKS = ['nature/rock_largeA', 'nature/rock_largeB', 'nature/rock_largeC', 'nature/rock_tallA', 'nature/rock_tallB'];
const CLIFFS = ['nature/cliff_large_stone', 'nature/cliff_large_stone', 'nature/cliff_large_rock'];
const HALL: readonly [string, number] = ['suburb/building-type-t', 7.5];
const MESAS = ['suburb/building-type-k', 'suburb/building-type-c'];
const SIDE: readonly (readonly [string, number])[] = [['suburb/building-type-a', 3.8], ['town/stall-green', 2.6], ['suburb/building-type-h', 4], ['suburb/building-type-e', 4]];
const SMALL: readonly (readonly [string, number])[] = [['town/stall-bench', 0.7], ['town/fountain-round-detail', 1.1], ['suburb/planter', 0.7]];
const LEAF_TINT = 0xc8eaa0;

/** Every kit model the designer may place (the loader fetches exactly these). */
export function modelIds(): string[] {
  return [
    ...new Set([
      ...TREES.map((t) => t[0]),
      ...BUSHES.map((t) => t[0]),
      ...FLOWERS,
      ...ROCKS,
      ...CLIFFS,
      HALL[0],
      ...MESAS,
      ...SIDE.map((t) => t[0]),
      ...SMALL.map((t) => t[0]),
      'nature/cliff_steps_rock',
      'nature/path_stone',
      'nature/bridge_center_wood',
      'pirate/flag-pennant',
      'pirate/structure-platform-dock',
      'pirate/boat-row-small',
      'town/lantern',
      'town/hedge-large',
    ]),
  ];
}

/** Designs the cosy-campus dressing for any layout: districts sized by their island, everything kept off plots, paths and bridges. */
export function designWorld(layout: WorldLayout, seed: number, palette: LookPalette): Dressing {
  return new Designer(layout, seed, palette).build();
}

class Designer {
  private readonly life: LifeSpot[] = [];
  private readonly paths: Segment[] = [];
  private readonly obstacles: Obstacle[] = [];
  private readonly bridges: Segment[] = [];
  private readonly spans: Segment[] = [];
  /** Plaza walks: from each hub's centre out to every bridge landing on it. */
  private readonly walks: Segment[] = [];
  private readonly spots: Obstacle[] = [];
  private readonly entries = new Set<Segment>();
  private readonly random: () => number;
  private district!: District;

  constructor(
    private readonly layout: WorldLayout,
    seed: number,
    private readonly p: LookPalette,
  ) {
    this.random = seededRandom(seed ^ 0x2545f491);
    for (const z of layout.zones) this.spans.push(span(z.anchor, z));
    for (const l of layout.links) this.spans.push(span(layout.hubs[l.from]!, layout.hubs[l.to]!));
    for (const z of layout.zones) this.walks.push(spoke(z.anchor, z));
    for (const l of layout.links) this.walks.push(spoke(layout.hubs[l.from]!, layout.hubs[l.to]!), spoke(layout.hubs[l.to]!, layout.hubs[l.from]!));
  }

  build(): Dressing {
    const { hubs, zones } = this.layout;
    const districts: District[] = [];
    hubs.forEach((hub, i) => {
      districts.push(this.open(hub));
      this.rimCliffs(hub, WATER_Y - 0.4, CLIFF_TOP, hub.radius);
      this.hubWalks(hub, i === 0 ? PLAZA : SMALL_PLAZA);
      if (i === 0) this.hub(hub);
      else this.plaza(hub, i);
      this.fillIsland(hub, i === 0 ? PLAZA + 0.8 : SMALL_PLAZA + 0.8);
    });
    for (const l of this.layout.links) {
      this.district = districts[l.to]!;
      this.bridge(hubs[l.from]!, hubs[l.to]!);
    }
    zones.forEach((z) => this.layPaths(z));
    zones.forEach((z, i) => {
      districts.push(this.open(z));
      this.paintPaths(z);
      this.rimCliffs(z, WATER_Y - 0.4, CLIFF_TOP, z.radius);
      this.bridge(z.anchor, z);
      this.zone(z, i);
      this.fillIsland(z, 0);
    });
    return { districts, life: this.life, paths: this.paths, obstacles: this.obstacles, bridges: this.bridges };
  }

  private open(island: Circle): District {
    this.district = { island, placements: [], terrain: [], glow: [] };
    return this.district;
  }

  /** The entry walk from the bridge to the middle and a brick ring walk through each ring of plots. */
  private layPaths(z: Zone): void {
    const ex = Math.cos(z.angle + Math.PI);
    const ez = Math.sin(z.angle + Math.PI);
    const count = z.plots.length;
    const stop = count === 1 ? z.plots[0]!.radius : 0;
    const walk = { ax: z.x + ex * (z.radius - 0.4), az: z.z + ez * (z.radius - 0.4), bx: z.x + ex * stop, bz: z.z + ez * stop };
    this.paths.push(walk);
    this.entries.add(walk);
    for (const ring of plotRings(count)) {
      if (ring.radius === 0) continue;
      const n = Math.max(16, Math.round((2 * Math.PI * ring.radius) / 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const b = ((i + 1) / n) * 2 * Math.PI;
        this.paths.push({ ax: z.x + Math.cos(a) * ring.radius, az: z.z + Math.sin(a) * ring.radius, bx: z.x + Math.cos(b) * ring.radius, bz: z.z + Math.sin(b) * ring.radius });
      }
    }
  }

  /** Brick walks of a zone (flat strips with round joints) and stepping stones on the entry walk. */
  private paintPaths(z: Zone): void {
    const colour = this.p.path[0] ?? 0xc9765a;
    this.paths.forEach((s) => {
      if (Math.hypot((s.ax + s.bx) / 2 - z.x, (s.az + s.bz) / 2 - z.z) > z.radius) return;
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      const yaw = Math.atan2(s.bx - s.ax, s.bz - s.az);
      this.terrain(new BoxGeometry(2.2, 0.06, len), colour, (s.ax + s.bx) / 2, 0.03, (s.az + s.bz) / 2, yaw, false, false);
      this.terrain(new CylinderGeometry(1.1, 1.1, 0.06, 10), colour, s.bx, 0.031, s.bz, 0, false, false);
      if (!this.entries.has(s)) return;
      for (let t = 1.2; t < len - 0.8; t += 2.4) {
        const x = s.ax + ((s.bx - s.ax) * t) / len;
        const zz = s.az + ((s.bz - s.az) * t) / len;
        this.model('nature/path_stone', x, 0.06, zz, yaw + this.random() * 0.4, 0, { width: 1.1, detail: true });
      }
    });
  }

  /** Paved walks from the plaza edge out to each bridge on this hub. */
  private hubWalks(hub: Circle, plaza: number): void {
    const colour = this.p.path[1] ?? this.p.stone;
    for (const w of this.walks) {
      if (w.ax !== hub.x || w.az !== hub.z) continue;
      const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
      const ux = (w.bx - w.ax) / len;
      const uz = (w.bz - w.az) / len;
      const mid = (plaza + len) / 2;
      this.terrain(new BoxGeometry(2.6, 0.08, len - plaza + 0.4), colour, hub.x + ux * mid, 0.035, hub.z + uz * mid, Math.atan2(ux, uz), false, false);
    }
  }

  private hub(hub: Circle): void {
    this.terrain(new CylinderGeometry(PLAZA + 0.3, PLAZA + 0.3, 0.1, 48), this.p.stoneDark, hub.x, 0, hub.z, 0, false, false);
    const bearings = this.bearingsAt(0);
    const back = widestGap(bearings, this.random() * 2 * Math.PI);
    const lr = hub.radius - 4.5;
    const lx = Math.cos(back) * lr;
    const lz = Math.sin(back) * lr;
    const face = Math.atan2(-lx, -lz);
    this.terrace(lx, lz, 3.8, 1.6, face);
    this.model(HALL[0], lx, 1.6, lz, face + Math.PI, HALL[1], { solid: true });
    this.life.push({ kind: 'flag', id: 'pirate/flag-pennant', x: lx, y: 1.6 + HALL[1] * 0.98, z: lz, yaw: 0, height: 2.6 });
    gaps(bearings).forEach(([a, width], i) => {
      if (Math.abs(wrap(a - back)) < 0.8 || width * (hub.radius - 4.4) < 16) return;
      const x = Math.cos(a) * (hub.radius - 4.4);
      const z = Math.sin(a) * (hub.radius - 4.4);
      const [id, h] = SIDE[i % SIDE.length]!;
      this.building(id, h, x, z, Math.atan2(-x, -z));
    });
    for (const [a] of gaps(bearings)) {
      const x = Math.cos(a) * (PLAZA + 1.3);
      const z = Math.sin(a) * (PLAZA + 1.3);
      this.lamp(x, z, 2.8);
    }
    this.dock(hub, true);
  }

  /** A further plaza: paving, a fountain in the middle and lamps between its bridges. */
  private plaza(hub: Circle, index: number): void {
    this.terrain(new CylinderGeometry(SMALL_PLAZA, SMALL_PLAZA, 0.1, 40), this.p.path[1] ?? this.p.stone, hub.x, 0.03, hub.z, 0, false, false);
    this.model('town/fountain-round-detail', hub.x, 0.05, hub.z, this.random() * 6, 1.3, { solid: true });
    this.reserve(hub.x, hub.z, 3);
    for (const [a] of gaps(this.bearingsAt(index))) {
      this.lamp(hub.x + Math.cos(a) * (SMALL_PLAZA + 1), hub.z + Math.sin(a) * (SMALL_PLAZA + 1), 2.6);
    }
  }

  private zone(z: Zone, i: number): void {
    const out = z.angle;
    const entry = out + Math.PI;
    const r = z.radius - 4;
    const mx = z.x + Math.cos(out) * r;
    const mz = z.z + Math.sin(out) * r;
    const face = Math.atan2(z.x - mx, z.z - mz);
    const h = 1.8 + (i % 2) * 0.8;
    if (this.free(mx, mz, 6, 0.5, true)) {
      this.terrace(mx, mz, 3.4, h, face);
      this.model(MESAS[i % 2]!, mx, h, mz, face + Math.PI, 5.6, { solid: true });
      this.life.push({ kind: 'flag', id: 'pirate/flag-pennant', x: mx + Math.sin(face + Math.PI / 2) * 2, y: h, z: mz + Math.cos(face + Math.PI / 2) * 2, yaw: face, height: 3.4 });
    }
    const step = 9 / (z.radius - 4);
    for (let a = out + 0.9, k = 0; a < out + 2 * Math.PI - 0.9; a += step, k++) {
      if (Math.abs(wrap(a - entry)) < 0.6) continue;
      const [id, hh] = SIDE[(i + k) % SIDE.length]!;
      const ring = z.radius - 1.6 - this.reach(id, hh);
      const x = z.x + Math.cos(a) * ring;
      const zz = z.z + Math.sin(a) * ring;
      this.building(id, hh, x, zz, Math.atan2(z.x - x, z.z - zz));
    }
    const smalls = Math.round((5 * z.radius) / 19.5);
    for (let k = 0; k < smalls; k++) {
      const a = entry + (k - (smalls - 1) / 2) * (2.6 / z.radius) * 4;
      const x = z.x + Math.cos(a) * (z.radius - 1.9);
      const zz = z.z + Math.sin(a) * (z.radius - 1.9);
      const [id, hh] = SMALL[k % SMALL.length]!;
      if (this.free(x, zz, 1.6, 0.8)) {
        this.reserve(x, zz, 1);
        this.model(id, x, 0, zz, this.random() * 6, hh, { solid: id !== 'suburb/planter', detail: true });
      }
    }
    if (z.plots.length === 0) {
      this.model('town/fountain-round-detail', z.x, 0, z.z, 0, 1.3, { solid: true });
      this.reserve(z.x, z.z, 3);
    }
    this.hedgeRing(z);
    this.lampsAlongPaths(z);
    this.dock(z, false);
  }

  /** A raised grass terrace with rock cliff sides and rock stairs facing `face`. */
  private terrace(x: number, z: number, r: number, h: number, face: number): void {
    this.reserve(x, z, r + 1.6);
    this.obstacles.push({ x, z, r: r + 1.1 });
    this.terrain(new CylinderGeometry(r, r, h, 28), this.p.grass, x, h / 2, z, 0, true, false);
    this.rimCliffs({ x, z, radius: r }, -0.1, h + 0.1, r + 0.2);
    this.model('nature/cliff_steps_rock', x + Math.sin(face) * (r + 0.4), 0, z + Math.cos(face) * (r + 0.4), face, h + 0.05, {});
  }

  private building(id: string, h: number, x: number, z: number, face: number): void {
    const reach = this.reach(id, h);
    if (!this.free(x, z, reach * 2, 1, true)) return;
    this.reserve(x, z, reach);
    this.model(id, x, 0, z, face + (id.startsWith('suburb') ? Math.PI : 0), h, { solid: true });
  }

  /** Rock cliff faces all round a circle, from `base` up to `top`. */
  private rimCliffs(c: Circle, base: number, top: number, r: number): void {
    const h = top - base;
    const n = Math.max(8, Math.round((2 * Math.PI * r) / (h * 0.62)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const rr = r - 0.3 * h + (this.random() - 0.5) * 0.3;
      this.model(this.pick(CLIFFS), c.x + dx * rr, base - this.random() * 0.4, c.z + dz * rr, Math.atan2(dx, dz) + (this.random() - 0.5) * 0.25, h + this.random() * 0.4, {});
    }
  }

  /** Kit plank decks rim to rim on log piers, with a wooden rail each side (both collide, no hidden boxes). */
  private bridge(from: Circle, to: Circle): void {
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const dx = (to.x - from.x) / dist;
    const dz = (to.z - from.z) / dist;
    const yaw = Math.atan2(dx, dz);
    const a = from.radius - 0.8;
    const b = dist - to.radius + 0.8;
    const foot = FOOT['nature/bridge_center_wood']!;
    const thick = (foot.h * DECK_W) / foot.w;
    const pieces = Math.ceil((b - a) / (DECK_W - 0.2));
    const pitch = (b - a) / pieces;
    for (let k = 0; k < pieces; k++) {
      const t = a + pitch * (k + 0.5);
      this.model('nature/bridge_center_wood', from.x + dx * t, DECK_Y - thick, from.z + dz * t, yaw, 0, { width: DECK_W, solid: true, ground: true });
    }
    this.bridges.push({ ax: from.x + dx * from.radius, az: from.z + dz * from.radius, bx: from.x + dx * (dist - to.radius), bz: from.z + dz * (dist - to.radius) });
    const ra = from.radius + 0.2;
    const rb = dist - to.radius - 0.2;
    const mid = (ra + rb) / 2;
    for (const side of [-1, 1]) {
      const ox = dz * side * (DECK_HALF + 0.15);
      const oz = -dx * side * (DECK_HALF + 0.15);
      this.terrain(new BoxGeometry(0.16, 0.14, rb - ra), this.p.woodDark, from.x + dx * mid + ox, DECK_Y + RAIL_H, from.z + dz * mid + oz, yaw, true, false);
      const posts = Math.max(2, Math.round((rb - ra) / 3) + 1);
      for (let k = 0; k < posts; k++) {
        const t = ra + ((rb - ra) * k) / (posts - 1);
        this.terrain(new BoxGeometry(0.2, RAIL_H, 0.2), this.p.wood, from.x + dx * t + ox, DECK_Y + RAIL_H / 2, from.z + dz * t + oz, yaw, true, false);
        this.terrain(new CylinderGeometry(0.18, 0.22, -WATER_Y - 0.6, 7), this.p.woodDark, from.x + dx * t + ox, WATER_Y / 2 - 0.5, from.z + dz * t + oz, 0, false, true);
      }
    }
  }

  private dock(c: Circle, big: boolean): void {
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
      const a = (c === this.layout.hub ? widestGap(this.bearingsAt(0), 0) + Math.PI * 0.35 : (c as Zone).angle) + turn;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const tip = c.radius + (big ? 9 : 7);
      const tipX = c.x + dx * tip;
      const tipZ = c.z + dz * tip;
      const clear =
        this.spans.every((s) => segmentDistance(tipX, tipZ, s) > 5 && segmentDistance(c.x + dx * (c.radius + 1), c.z + dz * (c.radius + 1), s) > 4) &&
        [...this.layout.hubs, ...this.layout.zones].every((o) => o === c || Math.hypot(tipX - o.x, tipZ - o.z) > o.radius + 6);
      if (!clear) continue;
      const yaw = Math.atan2(dx, dz);
      for (let t = c.radius + 1.2, k = 0; k < (big ? 3 : 2); t += 2.5, k++) {
        this.model('pirate/structure-platform-dock', c.x + dx * t, WATER_Y - 0.6, c.z + dz * t, yaw, 0, { width: 2.6, detail: true });
      }
      const t = c.radius + (big ? 6.5 : 4.5);
      const off = big ? 3.4 : 2.4;
      this.life.push({ kind: 'boat', id: 'pirate/boat-row-small', x: c.x + dx * t + dz * off, y: WATER_Y - 0.15, z: c.z + dz * t - dx * off, yaw, height: 1.1 });
      return;
    }
  }

  /** Runs of clipped hedge just inside the shore, open where the bridge lands. */
  private hedgeRing(z: Zone): void {
    const r = z.radius - 0.9;
    const n = Math.round((2 * Math.PI * r) / HEDGE_STEP);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const x = z.x + Math.cos(a) * r;
      const zz = z.z + Math.sin(a) * r;
      if (i % HEDGE_CYCLE >= HEDGE_RUN || this.nearBridge(x, zz, DECK_HALF + 1.6) || this.near(x, zz, 0.4)) continue;
      this.model('town/hedge-large', x, 0, zz, -a, 0.9, { solid: true, detail: true });
    }
  }

  private lampsAlongPaths(z: Zone): void {
    for (const s of this.paths) {
      if (Math.hypot(s.bx - z.x, s.bz - z.z) > z.radius) continue;
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      if (len < LAMP_STEP) continue;
      const nx = (s.bz - s.az) / len;
      const nz = -(s.bx - s.ax) / len;
      for (let t = 2.5, k = 0; t < len - 1; t += LAMP_STEP, k++) {
        const side = k % 2 ? 1.7 : -1.7;
        const x = s.ax + ((s.bx - s.ax) * t) / len + nx * side;
        const zz = s.az + ((s.bz - s.az) * t) / len + nz * side;
        if (this.near(x, zz, 0.3) || this.onPlot(x, zz, 0.8)) continue;
        this.lamp(x, zz, 2.6);
      }
    }
  }

  private lamp(x: number, z: number, h: number): void {
    this.reserve(x, z, 0.6);
    this.model('town/lantern', x, 0, z, 0, h, { solid: true, detail: true });
    this.district.glow.push(paintPlace(new CylinderGeometry(0.17, 0.17, 0.27, 8), 0xffd890, x, h * 0.875, z, 0));
  }

  /** Trees, bushes, flower beds and rocks over an island, as many as its area holds. */
  private fillIsland(c: Circle, inner: number): void {
    const k = (c.radius * c.radius) / HUB_AREA;
    this.fill(c, inner, Math.round(18 * k), 3.2, 1.4, (x, z, s) => this.tree(x, z, s));
    this.fill(c, inner, Math.round(40 * k), 1.2, 0.8, (x, z) => this.bush(x, z));
    this.fill(c, inner, Math.round(26 * k), 1, 0.6, (x, z) => this.flowerBed(x, z));
    this.fill(c, inner, Math.round(10 * k), 1.4, 0.8, (x, z) => this.model(this.pick(ROCKS), x, 0, z, this.random() * 6, 0.6 + this.random() * 0.6, { detail: true }));
  }

  private fill(c: Circle, inner: number, tries: number, gap: number, clearPath: number, make: (x: number, z: number, s: number) => void): void {
    const outer = c.radius - 1.9;
    for (let i = 0; i < tries * 3; i++) {
      const a = this.random() * 2 * Math.PI;
      const r = Math.sqrt(inner * inner + this.random() * (outer * outer - inner * inner));
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (this.free(x, z, gap, clearPath)) {
        this.reserve(x, z, gap / 2);
        make(x, z, this.random());
      }
    }
  }

  private tree(x: number, z: number, s: number): void {
    const [id, h] = this.pick(TREES);
    this.model(id, x, 0, z, this.random() * 6, h * (0.8 + s * 0.3), { sway: true, solid: true, ...(id.startsWith('nature/') ? { tint: LEAF_TINT } : {}) });
  }

  private bush(x: number, z: number): void {
    const [id, h] = this.pick(BUSHES);
    this.model(id, x, 0, z, this.random() * 6, h * (0.8 + this.random() * 0.5), { sway: true, detail: true, ...(id.startsWith('nature/plant') ? { tint: LEAF_TINT } : {}) });
  }

  private flowerBed(x: number, z: number): void {
    const id = this.pick(FLOWERS);
    for (let i = 0; i < 3; i++) {
      this.model(i === 2 ? this.pick(FLOWERS) : id, x + (this.random() - 0.5) * 1.2, 0, z + (this.random() - 0.5) * 1.2, this.random() * 6, 0.45 + this.random() * 0.2, { sway: true, detail: true });
    }
  }

  /** Free ground: off plots, bridges, plazas, paths (by `clearPath`) and earlier things (by `gap`), inside its island (centre only on the `rim`). */
  private free(x: number, z: number, gap: number, clearPath: number, rim = false): boolean {
    const island = [...this.layout.hubs, ...this.layout.zones].find((c) => Math.hypot(x - c.x, z - c.z) < c.radius - (rim ? 1.4 : 1.5 + gap / 2));
    return (
      island !== undefined &&
      !this.onPlot(x, z, 1.2 + gap / 2) &&
      !this.nearBridge(x, z, DECK_HALF + 1.4 + gap / 2) &&
      this.layout.hubs.every((h, i) => Math.hypot(x - h.x, z - h.z) > (i === 0 ? PLAZA : SMALL_PLAZA) + 0.6 + gap / 2) &&
      this.paths.every((s) => segmentDistance(x, z, s) > clearPath + 1.1 + gap / 2) &&
      !this.near(x, z, gap / 2)
    );
  }

  private onPlot(x: number, z: number, margin: number): boolean {
    return this.layout.zones.some((zone) => zone.plots.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + margin));
  }

  /** Whether (x, z) is within d of a bridge line, its landing included. */
  private nearBridge(x: number, z: number, d: number): boolean {
    return this.spans.some((s) => segmentDistance(x, z, extend(s, 3)) < d) || this.walks.some((s) => segmentDistance(x, z, s) < d);
  }

  private near(x: number, z: number, r: number): boolean {
    return this.spots.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + r);
  }

  private reserve(x: number, z: number, r: number): void {
    this.spots.push({ x, z, r });
  }

  /** Bearings of every bridge on hub i: its zones' and its plaza links'. */
  private bearingsAt(i: number): number[] {
    const hub = this.layout.hubs[i]!;
    const out = this.layout.zones.filter((z) => z.anchor === hub).map((z) => z.angle);
    for (const l of this.layout.links) {
      const other = l.from === i ? this.layout.hubs[l.to] : l.to === i ? this.layout.hubs[l.from] : undefined;
      if (other) out.push(Math.atan2(other.z - hub.z, other.x - hub.x));
    }
    return out;
  }

  /** Scaled reach of a model round its axis. */
  private reach(id: string, height: number): number {
    const f = FOOT[id]!;
    return (f.r * height) / f.h;
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.random() * list.length)]!;
  }

  /** Places a model; solid ones below terrace height also block the ground, unless they are walked on (`ground`). */
  private model(id: string, x: number, y: number, z: number, yaw: number, height: number, o: { width?: number; sway?: boolean; tint?: number; solid?: boolean; detail?: boolean; ground?: boolean }): void {
    const solid = o.solid === true;
    if (solid && y < 1 && !o.ground) {
      const f = FOOT[id]!;
      this.obstacles.push({ x, z, r: o.width ? (f.r * o.width) / f.w : (f.r * height) / f.h });
    }
    this.district.placements.push({
      id, x, y, z, yaw, height, solid, detail: o.detail === true,
      ...(o.width ? { width: o.width } : {}),
      ...(o.sway ? { sway: true } : {}),
      ...(o.tint !== undefined ? { tint: o.tint } : {}),
    });
  }

  private terrain(g: BufferGeometry, color: number, x: number, y: number, z: number, yaw: number, solid: boolean, detail: boolean): void {
    this.district.terrain.push({ geometry: paintPlace(g, color, x, y, z, yaw), solid, detail });
  }
}

function span(from: Circle, to: Circle): Segment {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  const dx = (to.x - from.x) / d;
  const dz = (to.z - from.z) / d;
  return { ax: from.x + dx * from.radius, az: from.z + dz * from.radius, bx: to.x - dx * to.radius, bz: to.z - dz * to.radius };
}

/** From the centre of `from` to its rim facing `to`. */
function spoke(from: Circle, to: Circle): Segment {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  return { ax: from.x, az: from.z, bx: from.x + ((to.x - from.x) / d) * from.radius, bz: from.z + ((to.z - from.z) / d) * from.radius };
}

function extend(s: Segment, by: number): Segment {
  const len = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
  const ux = ((s.bx - s.ax) / len) * by;
  const uz = ((s.bz - s.az) / len) * by;
  return { ax: s.ax - ux, az: s.az - uz, bx: s.bx + ux, bz: s.bz + uz };
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Middle bearing and width of each gap between sorted bearings (one full turn when there are none). */
function gaps(bearings: readonly number[]): [number, number][] {
  if (bearings.length === 0) return [[0, 2 * Math.PI]];
  const sorted = bearings.map((b) => ((b % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
  return sorted.map((a, i) => {
    const b = i === sorted.length - 1 ? sorted[0]! + 2 * Math.PI : sorted[i + 1]!;
    return [(a + b) / 2, b - a];
  });
}

function widestGap(bearings: readonly number[], fallback: number): number {
  if (bearings.length === 0) return fallback;
  return gaps(bearings).reduce((best, g) => (g[1] > best[1] ? g : best))[0];
}

/** Moves a geometry into place and paints it one colour (non-indexed, fresh normals). */
export function paintPlace(g: BufferGeometry, color: number, x: number, y: number, z: number, yaw: number): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  flat.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1)));
  const c = new Color(color);
  const n = flat.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  flat.setAttribute('color', new BufferAttribute(col, 3));
  flat.computeVertexNormals();
  return flat;
}
