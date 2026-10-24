import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { plotRings, segmentDistance } from './island-layout';
import type { Circle, WorldLayout, Zone } from './layout';
import type { LookPalette } from './look';
import FOOTPRINTS from './model-footprints.json';
import { Occupancy } from './occupancy';
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

/** A moving model for the life layer: a flag that waves, a boat or a buoy that bobs. */
export interface LifeSpot {
  readonly kind: 'flag' | 'boat' | 'buoy';
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
  /** Small dressing the low tier leaves out (never solid). */
  readonly minor?: boolean;
  /** Extra dressing only the xhigh tier shows (never solid). */
  readonly rich?: boolean;
  /** Repaints the model's green roof faces with this colour. */
  readonly roof?: number;
}

/** An animal of the life layer, wandering a small circle round (x, z). */
export interface Critter {
  readonly kind: 'duck' | 'cat' | 'dog' | 'butterfly';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

/** Where NPC kids hang out: playing on a playground piece or sitting at a bench, fountain or campfire. */
export interface Hangout {
  readonly kind: 'play' | 'sit';
  readonly x: number;
  readonly z: number;
  readonly face: number;
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
  /** Collision-only walls round low basins the capsule would otherwise step over (fountains). */
  readonly blockers: BufferGeometry[];
}

/** A sailing ship looping a circle round the archipelago. */
export interface Sail {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/** Everything the designer decides for a course; pure data, the same for the same layout and seed. */
export interface Dressing {
  readonly districts: readonly District[];
  readonly life: readonly LifeSpot[];
  readonly paths: readonly Segment[];
  readonly obstacles: readonly Obstacle[];
  /** Walkable bridge decks, rim to rim. */
  readonly bridges: readonly Segment[];
  readonly critters: readonly Critter[];
  readonly hangouts: readonly Hangout[];
  /** Chimney and campfire smoke sources. */
  readonly smoke: readonly { readonly x: number; readonly y: number; readonly z: number }[];
  readonly sails: readonly Sail[];
}

interface Footprint {
  readonly h: number;
  readonly w: number;
  readonly r: number;
}

const FOOT = FOOTPRINTS as Readonly<Record<string, Footprint>>;

const TREES: readonly (readonly [string, number])[] = [['suburb/tree-large', 5], ['town/tree-high-round', 5.4], ['nature/tree_detailed', 4.6], ['nature/tree_oak', 4.2], ['nature/tree_default', 4.8], ['nature/tree_fat', 3.6], ['nature/tree_pineRoundA', 4.4], ['nature/tree_blocks', 3.8], ['suburb/tree-small', 3.4]];
const BUSHES: readonly (readonly [string, number])[] = [['nature/plant_bushDetailed', 0.9], ['nature/plant_bushLarge', 1]];
const FLOWERS = ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA', 'nature/flower_redB', 'nature/flower_yellowB', 'nature/flower_purpleB', 'nature/flower_redC', 'nature/flower_purpleC'];
const TUFTS = ['nature/grass_large', 'nature/grass_leafs', 'nature/grass_leafsLarge', 'nature/plant_flatTall', 'nature/plant_flatShort', 'nature/plant_bushSmall'];
const CROPS = ['nature/crop_pumpkin', 'nature/crop_carrot', 'nature/crop_melon', 'nature/crops_cornStageC', 'nature/crops_wheatStageB', 'nature/crops_leafsStageB'];
const SHORE_ROCKS = ['nature/rock_largeA', 'nature/rock_largeC', 'nature/rock_smallA', 'nature/rock_smallC'];
const THEMES = ['park', 'market', 'garden', 'plaza', 'woods'] as const;
type Theme = (typeof THEMES)[number];
/** Cheerful repaint colours for house roofs, playground kit and awnings. */
const ACCENTS = [0xe8604c, 0x3d8bd9, 0xf2a33a, 0x8a5bd6, 0x2fa38a, 0xf06292];
const ROCKS = ['nature/rock_largeA', 'nature/rock_largeB', 'nature/rock_largeC', 'nature/rock_tallA', 'nature/rock_tallB'];
const CLIFFS = ['nature/cliff_large_stone', 'nature/cliff_large_stone', 'nature/cliff_large_rock'];
const HALL: readonly [string, number] = ['suburb/building-type-t', 7.5];
const MESAS = ['suburb/building-type-k', 'suburb/building-type-c'];
const SIDE: readonly (readonly [string, number])[] = [['suburb/building-type-a', 3.8], ['town/stall-green', 2.6], ['suburb/building-type-h', 4], ['suburb/building-type-e', 4]];
const SMALL: readonly (readonly [string, number])[] = [['town/stall-bench', 0.55], ['town/fountain-round-detail', 0.7], ['suburb/planter', 0.7]];
const LEAF_TINT = 0xc8eaa0;

/** Every kit model the designer may place (the loader fetches exactly these). */
export function modelIds(): string[] {
  return [
    ...new Set([
      ...TREES.map((t) => t[0]),
      ...BUSHES.map((t) => t[0]),
      ...FLOWERS,
      ...TUFTS,
      ...CROPS,
      ...SHORE_ROCKS,
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
      'town/stall-red',
      'town/stall-stool',
      'town/cart',
      'town/banner-red',
      'town/banner-green',
      'town/fountain-round',
      'pirate/barrel',
      'pirate/crate',
      'pirate/rocks-sand-a',
      'pirate/rocks-b',
      'pirate/grass-plant',
      'pirate/ship-small',
      'pirate/flag-high',
      'nature/crops_dirtRow',
      'nature/fence_simple',
      'nature/pot_large',
      'nature/log',
      'nature/stump_round',
      'nature/mushroom_redGroup',
      'nature/mushroom_tanGroup',
      'nature/tent_smallOpen',
      'nature/campfire_stones',
      'nature/sign',
      'nature/lily_large',
      'nature/lily_small',
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
  private readonly occ = new Occupancy();
  private readonly critters: Critter[] = [];
  private readonly hangouts: Hangout[] = [];
  private readonly smoke: { x: number; y: number; z: number }[] = [];
  private readonly themeShift: number;
  private readonly entries = new Set<Segment>();
  private readonly random: () => number;
  private district!: District;

  constructor(
    private readonly layout: WorldLayout,
    seed: number,
    private readonly p: LookPalette,
  ) {
    this.random = seededRandom(seed ^ 0x2545f491);
    this.themeShift = Math.floor(this.random() * THEMES.length);
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
      this.themed(hub, i === 0 ? ['market', 'park'] : ['plaza'], i === 0 ? 2 : 1);
      this.fillIsland(hub, i === 0 ? PLAZA + 0.8 : SMALL_PLAZA + 0.8);
      this.shore(hub);
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
      const theme = THEMES[(i + this.themeShift) % THEMES.length]!;
      this.themed(z, [theme], Math.max(1, Math.round((z.radius * z.radius) / 120)));
      this.fillIsland(z, 0);
      this.shore(z);
    });
    const sails = this.sea(districts);
    return {
      districts, life: this.life, paths: this.paths, obstacles: this.obstacles, bridges: this.bridges,
      critters: this.critters, hangouts: this.hangouts, smoke: this.smoke, sails,
    };
  }

  private open(island: Circle): District {
    this.district = { island, placements: [], terrain: [], glow: [], blockers: [] };
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
      for (const side of [-1, 1]) {
        const ox = (Math.cos(yaw) * side * 1.17);
        const oz = (-Math.sin(yaw) * side * 1.17);
        this.terrain(new BoxGeometry(0.16, 0.1, len), this.p.stone, (s.ax + s.bx) / 2 + ox, 0.05, (s.az + s.bz) / 2 + oz, yaw, false, true);
      }
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
    this.smoke.push({ x: lx, y: 1.6 + HALL[1] * 0.95, z: lz });
    this.life.push({ kind: 'flag', id: 'pirate/flag-pennant', x: lx, y: 1.6 + HALL[1] * 0.98, z: lz, yaw: 0, height: 2.6 });
    gaps(bearings).forEach(([a, width], i) => {
      if (Math.abs(wrap(a - back)) < 0.8 || width * (hub.radius - 4.4) < 16) return;
      const x = Math.cos(a) * (hub.radius - 4.4);
      const z = Math.sin(a) * (hub.radius - 4.4);
      const [id, h] = SIDE[i % SIDE.length]!;
      this.building(id, h, x, z, Math.atan2(-x, -z));
    });
    for (const [a, width] of gaps(bearings)) {
      const x = Math.cos(a) * (PLAZA + 1.3);
      const z = Math.sin(a) * (PLAZA + 1.3);
      this.lamp(x, z, 2.8);
      for (const side of [-1, 1]) {
        const b = a + side * Math.min(0.3, width / 4);
        const bx = Math.cos(b) * (PLAZA + 1.9);
        const bz = Math.sin(b) * (PLAZA + 1.9);
        if (this.nearBridge(bx, bz, DECK_HALF + 1.3)) continue;
        if (this.model('town/stall-bench', bx, 0, bz, Math.atan2(-bx, -bz), 0.55, { solid: true })) this.hangouts.push({ kind: 'sit', x: bx * 0.86, z: bz * 0.86, face: Math.atan2(bx, bz) });
      }
    }
    this.dock(hub, true);
  }

  /** A further plaza: paving, a fountain in the middle and lamps between its bridges. */
  private plaza(hub: Circle, index: number): void {
    this.terrain(new CylinderGeometry(SMALL_PLAZA, SMALL_PLAZA, 0.1, 40), this.p.path[1] ?? this.p.stone, hub.x, 0.03, hub.z, 0, false, false);
    this.model('town/fountain-round-detail', hub.x, 0.05, hub.z, this.random() * 6, 1.3, { solid: true });
    this.hangouts.push({ kind: 'sit', x: hub.x + 3.2, z: hub.z, face: Math.PI / 2 });
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
      if (this.free(x, zz, 1.6, 0.8)) this.model(id, x, 0, zz, this.random() * 6, hh, { solid: id !== 'suburb/planter', detail: true });
    }
    if (z.plots.length === 0) {
      this.model('town/fountain-round-detail', z.x, 0, z.z, 0, 1.3, { solid: true });
    }
    const [sx, sz] = [z.x + Math.cos(entry) * (z.radius - 3.2) + Math.cos(entry + Math.PI / 2) * 2.2, z.z + Math.sin(entry) * (z.radius - 3.2) + Math.sin(entry + Math.PI / 2) * 2.2];
    this.item('nature/sign', sx, sz, Math.atan2(Math.cos(entry), Math.sin(entry)), 1.3, { solid: true, detail: true, margin: 0.3 });
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
    const house = id.startsWith('suburb');
    const roof = house ? this.pick(ACCENTS) : undefined;
    if (this.model(id, x, 0, z, face + (house ? Math.PI : 0), h, { solid: true, ...(roof !== undefined ? { roof } : {}) }) && house && this.random() < 0.4) {
      this.smoke.push({ x, y: h * 0.92, z });
    }
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
      if (i % HEDGE_CYCLE >= HEDGE_RUN || this.nearBridge(x, zz, DECK_HALF + 1.6)) continue;
      this.model('town/hedge-large', x, 0, zz, -a, 0.9, { solid: true, detail: true, wall: 0.7 });
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
        if (this.onPlot(x, zz, 0.8)) continue;
        this.lamp(x, zz, 2.6);
      }
    }
  }

  private lamp(x: number, z: number, h: number): void {
    if (!this.model('town/lantern', x, 0, z, 0, h, { solid: true, detail: true, margin: 0.5 })) return;
    this.district.glow.push(paintPlace(new CylinderGeometry(0.17, 0.17, 0.27, 8), 0xffd890, x, h * 0.875, z, 0));
  }

  /** Trees, bushes, flower beds and rocks over an island, as many as its area holds. */
  private fillIsland(c: Circle, inner: number): void {
    const k = (c.radius * c.radius) / HUB_AREA;
    this.fill(c, inner, Math.round(18 * k), 3.2, 1.4, (x, z, s) => this.tree(x, z, s));
    this.fill(c, inner, Math.round(40 * k), 1.2, 0.8, (x, z) => this.bush(x, z));
    this.fill(c, inner, Math.round(30 * k), 1, 0.6, (x, z) => this.flowerBed(x, z));
    this.fill(c, inner, Math.round(10 * k), 1.4, 0.8, (x, z) => this.model(this.pick(ROCKS), x, 0, z, this.random() * 6, 0.6 + this.random() * 0.6, { detail: true }));
    this.fill(c, inner, Math.round(70 * k), 0.5, 0.2, (x, z) => this.model(this.pick(TUFTS), x, 0, z, this.random() * 6, 0.35 + this.random() * 0.3, { sway: true, detail: true, minor: true, tint: LEAF_TINT }));
    this.fill(c, inner, Math.round(90 * k), 0.4, 0.1, (x, z) => this.model(this.pick(this.random() < 0.6 ? TUFTS : FLOWERS), x, 0, z, this.random() * 6, 0.3 + this.random() * 0.25, { sway: true, detail: true, rich: true }));
    this.groundPatches(c, Math.round(16 * k));
    this.pets(c);
  }

  private fill(c: Circle, inner: number, tries: number, gap: number, clearPath: number, make: (x: number, z: number, s: number) => void): void {
    const outer = c.radius - 1.9;
    for (let i = 0; i < tries * 3; i++) {
      const a = this.random() * 2 * Math.PI;
      const r = Math.sqrt(inner * inner + this.random() * (outer * outer - inner * inner));
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (this.free(x, z, gap, clearPath)) {
        make(x, z, this.random());
        this.reserve(x, z, gap / 2);
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
    for (let i = 0; i < 5; i++) {
      this.model(i === 2 ? this.pick(FLOWERS) : id, x + (this.random() - 0.5) * 1.2, 0, z + (this.random() - 0.5) * 1.2, this.random() * 6, 0.45 + this.random() * 0.2, { sway: true, detail: true, ...(i > 2 ? { minor: true } : {}) });
    }
    if (this.random() < 0.3) this.critters.push({ kind: 'butterfly', x, y: 0.9, z, r: 1.4 });
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
    return this.occ.hits(x, z, r);
  }

  private reserve(x: number, z: number, r: number): void {
    this.occ.add(x, z, r);
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

  /**
   * Places a model. Solid ones below terrace height (unless walked on, `ground`) claim their footprint (or `wall`, the
   * half length of an abutting wall piece) in the occupancy grid and are skipped, returning false, when it is taken.
   */
  private model(id: string, x: number, y: number, z: number, yaw: number, height: number, o: ModelOptions): boolean {
    const solid = o.solid === true;
    if (solid && y < 1 && !o.ground) {
      const f = FOOT[id]!;
      const r = o.wall ?? (o.width ? (f.r * o.width) / f.w : (f.r * height) / f.h);
      if (this.occ.hits(x, z, r)) return false;
      this.occ.add(x, z, r + (o.margin ?? (o.wall ? 0 : 0.2)));
      this.obstacles.push({ x, z, r });
      if (id.includes('fountain')) {
        const wall = new CylinderGeometry(r * 0.92, r * 0.92, 1.4, 20, 1, true);
        wall.translate(x, y + 0.7, z);
        this.district.blockers.push(wall);
      }
    }
    this.district.placements.push({
      id, x, y, z, yaw, height, solid, detail: o.detail === true,
      ...(o.width ? { width: o.width } : {}),
      ...(o.sway ? { sway: true } : {}),
      ...(o.tint !== undefined ? { tint: o.tint } : {}),
      ...(o.minor ? { minor: true } : {}),
      ...(o.rich ? { rich: true } : {}),
      ...(o.roof !== undefined ? { roof: o.roof } : {}),
    });
    return true;
  }

  /** A model on open ground: kept off plots, paths, bridges and the shore, and off everything already placed. */
  private item(id: string, x: number, z: number, yaw: number, height: number, o: ModelOptions): boolean {
    const r = o.width ? (FOOT[id]!.r * o.width) / FOOT[id]!.w : this.reach(id, height);
    if (!this.free(x, z, 2 * r, 0.1)) return false;
    if (!o.solid) {
      this.model(id, x, 0, z, yaw, height, o);
      this.reserve(x, z, r);
      return true;
    }
    return this.model(id, x, 0, z, yaw, height, o);
  }

  /** Own-built solid geometry (playground kit): all parts or none, claiming one footprint of radius r. */
  private structure(x: number, z: number, yaw: number, r: number, parts: readonly (readonly [BufferGeometry, number, number, number, number])[]): boolean {
    if (!this.free(x, z, 2 * r, 0.1)) return false;
    this.occ.add(x, z, r + 0.2);
    this.obstacles.push({ x, z, r });
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (const [g, colour, px, py, pz] of parts) {
      this.terrain(g, colour, x + px * c + pz * s, py, z - px * s + pz * c, yaw, true, false);
    }
    return true;
  }

  /** Themed corners of an island (playgrounds, market stalls, gardens, fountain squares, woods), as many as fit. */
  private themed(c: Circle, themes: readonly Theme[], count: number): void {
    let placed = 0;
    for (let k = 0; k < count * 30 && placed < count; k++) {
      const a = this.random() * 2 * Math.PI;
      const r = Math.sqrt(this.random()) * (c.radius - 3);
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (!this.free(x, z, 4, 0.2)) continue;
      if (this.vignette(themes[placed % themes.length]!, x, z, Math.atan2(c.x - x, c.z - z))) placed++;
    }
  }

  private vignette(theme: Theme, x: number, z: number, face: number): boolean {
    const at = (dx: number, dz: number): [number, number] => [x + dx * Math.cos(face) + dz * Math.sin(face), z - dx * Math.sin(face) + dz * Math.cos(face)];
    const accent = this.pick(ACCENTS);
    if (theme === 'park') {
      const piece = playground(Math.floor(this.random() * 3), accent, this.pick(ACCENTS), this.p.wood);
      if (!this.structure(x, z, face, piece.r, piece.parts)) return false;
      this.hangouts.push({ kind: 'play', x: at(0, -piece.r - 0.6)[0], z: at(0, -piece.r - 0.6)[1], face });
      const [bx, bz] = at(0, piece.r + 1.8);
      this.item('town/stall-bench', bx, bz, face + Math.PI, 0.55, { solid: true });
      for (const [dx, dz] of [[-piece.r - 1.2, 0.6], [piece.r + 1.2, -0.4]] as const) {
        const [fx, fz] = at(dx, dz);
        this.item(this.pick(FLOWERS), fx, fz, this.random() * 6, 0.55, { sway: true, detail: true, minor: true });
      }
      return true;
    }
    if (theme === 'market') {
      if (!this.item(this.random() < 0.5 ? 'town/stall-red' : 'town/stall-green', x, z, face + Math.PI, 2.6, { solid: true })) return false;
      const goods: [string, number, number, number][] = [['pirate/barrel', -2.1, 0.4, 0.8], ['pirate/crate', 2.1, 0.5, 0.65], ['town/cart', 2.6, -2, 1.1], ['town/banner-red', -2.4, -1.4, 2.4]];
      for (const [id, dx, dz, h] of goods) {
        const [gx, gz] = at(dx, dz);
        this.item(id === 'town/banner-red' && this.random() < 0.5 ? 'town/banner-green' : id, gx, gz, face + this.random() * 0.6, h, { solid: true, detail: true });
      }
      for (const dx of [-0.7, 0.7]) {
        const [sx, sz] = at(dx, -1.9);
        this.item('town/stall-stool', sx, sz, this.random() * 6, 0.45, { detail: true, minor: true });
      }
      this.hangouts.push({ kind: 'sit', x: at(0, -2.4)[0], z: at(0, -2.4)[1], face: face + Math.PI });
      return true;
    }
    if (theme === 'garden') {
      let rows = 0;
      for (const dz of [-1.1, 0, 1.1]) {
        const [rx, rz] = at(0, dz);
        if (!this.free(rx, rz, 3.4, 0.1)) continue;
        rows++;
        this.reserve(rx, rz, 1.7);
        this.model('nature/crops_dirtRow', rx, 0.01, rz, face + Math.PI / 2, 0, { width: 3, detail: true });
        const crop = this.pick(CROPS);
        for (const dx of [-1, 0, 1]) {
          const [cx, cz] = at(dx, dz);
          this.model(crop, cx, 0.05, cz, this.random() * 6, crop.includes('corn') ? 1.3 : 0.55, { sway: true, detail: true, minor: true });
        }
      }
      if (rows === 0) return false;
      for (const dx of [-1, 0, 1]) {
        const [fx, fz] = at(dx * 1.4, 2.1);
        this.item('nature/fence_simple', fx, fz, face + Math.PI / 2, 0, { width: 1.4, solid: true, detail: true, wall: 0.68 });
      }
      const [px, pz] = at(-2.4, -1.6);
      this.item('nature/pot_large', px, pz, 0, 0.5, { detail: true, minor: true });
      this.hangouts.push({ kind: 'play', x: at(2.6, 0)[0], z: at(2.6, 0)[1], face: face - Math.PI / 2 });
      return true;
    }
    if (theme === 'plaza') {
      if (!this.item('town/fountain-round', x, z, this.random() * 6, 0.6, { solid: true })) return false;
      this.terrain(new CylinderGeometry(3.1, 3.1, 0.04, 24), this.p.path[1] ?? this.p.stone, x, 0.012, z, 0, false, false);
      for (const side of [-1, 1]) {
        const [bx, bz] = at(side * 3.6, 0);
        this.item('town/stall-bench', bx, bz, face + (side * Math.PI) / 2, 0.55, { solid: true });
        const [qx, qz] = at(0, side * 3.4);
        this.item('suburb/planter', qx, qz, this.random() * 6, 0.7, { detail: true });
      }
      this.hangouts.push({ kind: 'sit', x: at(0, -2.6)[0], z: at(0, -2.6)[1], face });
      this.critters.push({ kind: 'butterfly', x, y: 1.4, z, r: 2.4 });
      return true;
    }
    const [tx, tz] = at(0, 0);
    if (!this.item('nature/tent_smallOpen', tx, tz, face + Math.PI, 1.5, { solid: true, detail: true })) return false;
    const [fx, fz] = at(0, -2.3);
    this.model('nature/campfire_stones', fx, 0, fz, 0, 0.22, { detail: true });
    this.reserve(fx, fz, 0.8);
    this.smoke.push({ x: fx, y: 0.3, z: fz });
    this.hangouts.push({ kind: 'sit', x: at(1.3, -2.3)[0], z: at(1.3, -2.3)[1], face: face - Math.PI / 2 });
    const [lx, lz] = at(-1.5, -2.4);
    this.item('nature/log', lx, lz, face + Math.PI / 2, 0.35, { solid: true, detail: true });
    for (const [dx, dz, id, h] of [[2.4, 1.4, 'nature/tree_pineRoundA', 4.2], [-2.6, 1.2, 'nature/tree_fat', 3.4], [2.6, -0.8, 'nature/stump_round', 0.4]] as const) {
      const [px, pz] = at(dx, dz);
      this.item(id, px, pz, this.random() * 6, h, { solid: true, sway: id.includes('tree'), ...(id.includes('tree') ? { tint: LEAF_TINT } : { detail: true }) });
    }
    for (const [dx, dz] of [[-1.2, 1.8], [1.2, 2.1], [-2.2, -0.4]] as const) {
      const [mx, mz] = at(dx, dz);
      this.item(this.random() < 0.5 ? 'nature/mushroom_redGroup' : 'nature/mushroom_tanGroup', mx, mz, this.random() * 6, 0.35, { detail: true, minor: true });
    }
    return true;
  }

  /** Flat lighter, darker and meadow patches so no large plain lawn remains. */
  private groundPatches(c: Circle, count: number): void {
    const colours = [this.p.grassLight, 0x6aae4c, 0x9ccc5c, 0x88c46a, 0xb5d77a];
    for (let i = 0; i < count; i++) {
      const a = this.random() * 2 * Math.PI;
      const r = Math.sqrt(this.random()) * (c.radius - 2.5);
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (this.onPlot(x, z, 2.5)) continue;
      const size = 1.2 + this.random() * 2.2;
      const g = new CylinderGeometry(size, size, 0.02, 9);
      g.scale(1 + this.random() * 0.7, 1, 1);
      this.terrain(g, this.pick(colours), x, 0.004 + (i % 4) * 0.002, z, this.random() * 6, false, true);
    }
  }

  /** Rocks, reeds and lily pads along the waterline, ducks off the shore, a buoy or two. */
  private shore(c: Circle): void {
    const n = Math.round((2 * Math.PI * c.radius) / 2.4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI + this.random() * 0.1;
      const kind = this.random();
      const out = c.radius + 0.4 + this.random() * 1.2;
      const x = c.x + Math.cos(a) * out;
      const z = c.z + Math.sin(a) * out;
      if (this.nearBridge(x, z, DECK_HALF + 2.5) || this.occ.hits(x, z, 0.6)) continue;
      if (kind < 0.45) this.model(this.pick(SHORE_ROCKS), x, WATER_Y - 0.25, z, this.random() * 6, 0.6 + this.random() * 0.7, { detail: true });
      else if (kind < 0.8) {
        for (let k = 0; k < 3; k++) {
          this.model('nature/grass_leafsLarge', x + (this.random() - 0.5), WATER_Y - 0.05, z + (this.random() - 0.5), this.random() * 6, 0.9 + this.random() * 0.4, { sway: true, detail: true, minor: true, tint: 0x9bc46c });
        }
      } else {
        const lx = c.x + Math.cos(a) * (out + 1.5);
        const lz = c.z + Math.sin(a) * (out + 1.5);
        this.model(this.random() < 0.5 ? 'nature/lily_large' : 'nature/lily_small', lx, WATER_Y + 0.03, lz, this.random() * 6, 0, { width: 0.9, detail: true, minor: true });
      }
    }
    for (let tries = 0; tries < 12; tries++) {
      const a = this.random() * 2 * Math.PI;
      const x = c.x + Math.cos(a) * (c.radius + 5);
      const z = c.z + Math.sin(a) * (c.radius + 5);
      if (this.nearBridge(x, z, 6) || this.occ.hits(x, z, 2.5) || this.otherIsland(c, x, z, 4)) continue;
      this.critters.push({ kind: 'duck', x, y: WATER_Y, z, r: 2.2 });
      this.reserve(x, z, 2.5);
      break;
    }
    for (let tries = 0; tries < 12; tries++) {
      const a = this.random() * 2 * Math.PI;
      const x = c.x + Math.cos(a) * (c.radius + 8);
      const z = c.z + Math.sin(a) * (c.radius + 8);
      if (this.nearBridge(x, z, 5) || this.occ.hits(x, z, 1) || this.otherIsland(c, x, z, 3)) continue;
      this.life.push({ kind: 'buoy', id: 'buoy', x, y: WATER_Y, z, yaw: 0, height: 1 });
      this.reserve(x, z, 1);
      break;
    }
  }

  private otherIsland(c: Circle, x: number, z: number, gap: number): boolean {
    return [...this.layout.hubs, ...this.layout.zones].some((o) => o !== c && Math.hypot(x - o.x, z - o.z) < o.radius + gap);
  }

  /** A cat or dog idling on each island. */
  private pets(c: Circle): void {
    for (let tries = 0; tries < 20; tries++) {
      const a = this.random() * 2 * Math.PI;
      const r = Math.sqrt(this.random()) * (c.radius - 3);
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (!this.free(x, z, 3, 0)) continue;
      this.reserve(x, z, 1.5);
      this.critters.push({ kind: this.random() < 0.5 ? 'cat' : 'dog', x, y: 0, z, r: 1.2 });
      return;
    }
  }

  /** Rocky islets with grass between the islands, and the ships sailing round the archipelago. */
  private sea(districts: readonly District[]): Sail[] {
    const islands = [...this.layout.hubs, ...this.layout.zones];
    const reach = Math.max(...islands.map((c) => Math.hypot(c.x, c.z) + c.radius));
    const want = 2 + Math.round((reach * reach) / 4000);
    const placed: { x: number; z: number }[] = [];
    for (let tries = 0; tries < want * 40 && placed.length < want; tries++) {
      const a = this.random() * 2 * Math.PI;
      const r = 20 + this.random() * (reach + 6);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (islands.some((c) => Math.hypot(x - c.x, z - c.z) < c.radius + 9) || this.spans.some((s) => segmentDistance(x, z, s) < 9)) continue;
      if (placed.some((p) => Math.hypot(x - p.x, z - p.z) < 16) || this.occ.hits(x, z, 4)) continue;
      placed.push({ x, z });
      this.reserve(x, z, 4);
      const home = islands.reduce((best, c, i) => (Math.hypot(x - c.x, z - c.z) < Math.hypot(x - islands[best]!.x, z - islands[best]!.z) ? i : best), 0);
      this.district = districts[home]!;
      this.model(this.random() < 0.5 ? 'pirate/rocks-sand-a' : 'pirate/rocks-b', x, WATER_Y - 1.1, z, this.random() * 6, 2.6 + this.random(), {});
      this.model('pirate/grass-plant', x + 0.4, WATER_Y + 1.2, z - 0.3, this.random() * 6, 0.8, { sway: true, detail: true, minor: true });
      if (placed.length === 1) this.life.push({ kind: 'flag', id: 'pirate/flag-pennant', x, y: WATER_Y + 1.4, z, yaw: 0, height: 2.2 });
    }
    return [{ x: 0, z: 0, r: reach + 14 }, { x: 0, z: 0, r: reach + 26 }];
  }

  private terrain(g: BufferGeometry, color: number, x: number, y: number, z: number, yaw: number, solid: boolean, detail: boolean): void {
    this.district.terrain.push({ geometry: paintPlace(g, color, x, y, z, yaw), solid, detail });
  }
}

interface ModelOptions {
  width?: number;
  sway?: boolean;
  tint?: number;
  solid?: boolean;
  detail?: boolean;
  ground?: boolean;
  minor?: boolean;
  rich?: boolean;
  roof?: number;
  /** Footprint radius of an abutting wall piece (hedges, fences) instead of its full reach. */
  wall?: number;
  /** Extra clearance claimed round the footprint (default 0.2 m). */
  margin?: number;
}

type Part = readonly [BufferGeometry, number, number, number, number];

/** Blocky playground kit built here: 0 swing, 1 slide, 2 seesaw. Parts are (geometry, colour, x, y, z) in local space. */
function playground(kind: number, main: number, second: number, wood: number): { r: number; parts: Part[] } {
  if (kind === 0) {
    const parts: Part[] = [];
    for (const x of [-1.3, 1.3]) for (const z of [-0.5, 0.5]) parts.push([new BoxGeometry(0.14, 2.3, 0.14).rotateX(z > 0 ? -0.2 : 0.2), main, x, 1.1, z * 0.8]);
    parts.push([new BoxGeometry(2.9, 0.14, 0.14), second, 0, 2.25, 0]);
    for (const x of [-0.6, 0.6]) {
      parts.push([new BoxGeometry(0.03, 1.6, 0.03), 0x555555, x - 0.2, 1.45, 0], [new BoxGeometry(0.03, 1.6, 0.03), 0x555555, x + 0.2, 1.45, 0]);
      parts.push([new BoxGeometry(0.5, 0.06, 0.28), second, x, 0.62, 0]);
    }
    return { r: 1.6, parts };
  }
  if (kind === 1) {
    return {
      r: 1.9,
      parts: [
        [new BoxGeometry(0.9, 1.5, 0.9), main, -0.9, 0.75, 0],
        [new BoxGeometry(1.0, 0.12, 1.0), second, -0.9, 1.56, 0],
        [new BoxGeometry(0.7, 0.08, 2.3).rotateX(0.62).rotateY(Math.PI / 2), second, 0.45, 0.82, 0],
        [new BoxGeometry(0.1, 0.3, 2.3).rotateX(0.62).rotateY(Math.PI / 2), main, 0.45, 1.0, 0.36],
        [new BoxGeometry(0.1, 0.3, 2.3).rotateX(0.62).rotateY(Math.PI / 2), main, 0.45, 1.0, -0.36],
      ],
    };
  }
  return {
    r: 1.6,
    parts: [
      [new BoxGeometry(0.3, 0.4, 0.4), wood, 0, 0.2, 0],
      [new BoxGeometry(2.8, 0.08, 0.32).rotateZ(0.14), main, 0, 0.46, 0],
      [new BoxGeometry(0.06, 0.32, 0.36), second, -1.2, 0.45, 0],
      [new BoxGeometry(0.06, 0.32, 0.36), second, 1.2, 0.78, 0],
    ],
  };
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
