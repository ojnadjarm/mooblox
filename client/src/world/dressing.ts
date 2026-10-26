import { Box3, BoxGeometry, BufferAttribute, Color, CylinderGeometry, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { buildLandmark, type Landmark } from './landmarks/landmarks';
import { FOUNTAIN_LIP, FOUNTAIN_STEP, tieredFountain } from './landmarks/fountain';
import { gardenRoom, HEDGE_THICK, roomReach, ROOMS, type RoomSize } from './landmarks/garden-room';
import { frameArcs, planterRun, runFootprint, type FrameArc, type FrameRing } from './landmarks/plaza-frame';
import { dropUndersides, KERB, kerbArc, kerbRun, ringBand } from './landmarks/kerb';
import { chimney } from './chimney';
import { CLIFF, cliffWall, TERRACE_CLIFF, type CliffSize, type CliffToe } from './cliff-wall';
import { outlinePrism, shelfArcs, shelfCentre, shelfOutline, shelfSamples, shelfSite, onShelf, type Shelf } from './shelf';
import { HUB_THEME, pickThemes, THEMES as DISTRICT_THEMES, type Corner, type DistrictTheme } from './landmarks/themes';
import { plotRings, segmentDistance } from './island-layout';
import type { Circle, WorldLayout, Zone } from './layout';
import type { LookPalette } from './look';
import FOOTPRINTS from './model-footprints.json';
import { Occupancy, type GroundQuery } from './occupancy';
import { SegmentIndex } from './segment-index';
import { fadeBlob, lawnColour, softBlob } from './lawn-colour';
import { seededRandom } from './random';
import { recipe, WAYSIDE, type Recipe, type RecipeKind } from './recipes';
import { pathPoints, SIGHT_IDS, wayStops } from './path-stops';
import { boxSamples, inBox, makeStair, STAIR, stairBoxes, stairFlight, stairPier, type Stair, type StairBox, type StairColours } from './stair';
import type { SmokeSource } from './smoke';

export const WATER_Y = -3;
/** Height of the bridge deck's walking surface. */
export const DECK_Y = 0.08;
/** Half the walkable width between the bridge rails. */
export const DECK_HALF = 1.35;
const DECK_W = 3.2;
const RAIL_H = 1;
const PLAZA = 7;
const SMALL_PLAZA = 6;
/** Top of the island cliff: just under the grass lip, which overhangs it. */
const RIM_TOP = -0.42;
/** How far a raised lawn's cliff foot reaches past its rim (its obstacle). */
const LAWN_FOOT = 0.3;
/** Raised lawn sizes, largest first (radius range, clearance round the cliff foot); the small ones only fill what the large miss. */
const LAWNS = [{ r: [2.2, 3], clear: 0.8 }, { r: [1.8, 2.2], clear: 0.5 }] as const;
/** The kid capsule's radius: room kept between a stair landing and the nearest solid. */
const KID_RADIUS = 0.5;
const KID_HEIGHT = 2.6;
/** Rocks rising more than this (metres) collide. */
const ANKLE = 0.3;
/** A cliff toe rock's top over its centre, per metre of its radius (cliff-wall.ts). */
const TOE_RISE = 0.65;
/** Room kept between a stair landing and an activity plot's edge. */
const PLOT_CLEAR = 1;
/** Half a walk's width (its kerbs stand just outside). */
const WALK_HALF = 1.1;
/** Width of the stairs up terraces and shelves. */
const STAIR_WIDE = 2.2;
/** How much a terrace stair's pier may lengthen to clear its landmark, and the highest ledge the kid steps onto. */
const PIER_GROW = 2;
const CLIMB = 0.65;
/** How far a landing pier reaches past its flight each side. */
const PIER_SIDE = 0.2;
/** Turns (rad) from a raised level's wanted stair bearing tried in order until the flight and its landing fit. */
const STAIR_TURNS = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.3, -1.3, 1.7, -1.7, 2.2, -2.2, 2.7, -2.7, Math.PI];
/** Thickness of a raised lawn's grass lip over its cliff. */
const TERRACE_LIP = 0.16;
const LAMP_STEP = 9;
/** Wayside stops keep at most this far (m) between sights along a walk, so strollers can link them (24 m reach). */
const WAYSIDE_SPACING = 11;
const HEDGE_STEP = 1.5;
/** Hedge pieces per run and per run plus gap round a zone's rim. */
const HEDGE_RUN = 6;
const HEDGE_CYCLE = 9;
const HUB_AREA = 22 * 22;
const ROOM_SAMPLES = ROOMS.map(roomFootprint);
/** Garden room sites tried per room, most open first (each try tests the whole footprint). */
const ROOM_TRIES = 80;
/** Spawn plaza frame: planter ring just outside the paving, openings (half width), runs and walk-through gaps along the rim (m). */
const FRAME: FrameRing = { r0: PLAZA + 0.1, r1: PLAZA + 1.25, h: 0.48 };
const FRAME_OPEN = 2.5;
const FRAME_RUN = 4.6;
const FRAME_GAP = 1.8;
/** A shelf's outer face over the island cliff: no toe rocks (they would hang over the water), shallow steps, block ridges under its grass lip. */
const SHELF_RIM: CliffSize = { ...TERRACE_CLIFF, toe: 0, step: [0.03, 0.08], upperOut: [-0.2, -0.16], level: 0.005 };
/** The island cliff's ledges sit 5 mm off the 1 cm grid the beach top (WATER_Y + 0.27) lies on. */
const ISLAND_CLIFF: CliffSize = { ...CLIFF, level: 0.005 };
/** Models standing higher than this (m) are on a raised level and must stand wholly on it. */
const LEVEL_MIN = 0.3;
/** Ground reach (m) a tree needs under it: its trunk, not its crown. */
const TRUNK = 0.4;
/** Widest ground reach (m) a district hero is laid out at before its scale; wider bases are scaled down to it. */
const HERO_REACH = 4.6;
/** Least top height (m) of a district hero: a little over twice a house. */
const HERO_TOP = 8.4;
/** Kit pieces laid as walkable ground (decks, bridges, planks): never dropped for a clash, though props keep off them. */
const DECK = /dock|platform|bridge|plank/;
/** Props that touch by design: rock clusters, tiled decks, bridges and walls, lily pads, crops in their rows, flush path stones. */
export function attached(a: string, b: string): boolean {
  if (/path_stone/.test(a + b) || (/rock/.test(a) && /rock/.test(b)) || (/lily/.test(a) && /lily/.test(b)) || (/crop/.test(a) && /crop/.test(b))) return true;
  return a === b && (DECK.test(a) || /hedge|fence/.test(a));
}
/** Colour scale at the middle of a grounding patch; it fades to the ground's own colour at the rim. */
const PATCH_SHADE = 0.86;
/** Height step (m) between overlapping walk layers: ring strips, their joint discs, the entry walk, its end disc. */
const WALK_STEP = 0.005;
/** Clearance kept between a shelf and bridge lines, path centre lines and plot rims. */
const SHELF_CLEAR = { bridge: 2.2, path: 1.7, plot: 0.8 } as const;

/** A kerb in plan: a straight run `len` long centred on (x, z) along `yaw`, or an arc of radius `r` about (x, z) from `a0` to `a1`. */
export type KerbPiece =
  | { readonly kind: 'run'; readonly x: number; readonly z: number; readonly yaw: number; readonly len: number }
  | { readonly kind: 'arc'; readonly x: number; readonly z: number; readonly r: number; readonly a0: number; readonly a1: number };

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
  /** Repaints the model in two horizontal bands (keeping its shading): `hi` above world y `split`, `lo` below (banded cliffs). */
  readonly bands?: { readonly split: number; readonly hi: number; readonly lo: number };
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
  /** Seat top (m) of the bench or stool pair two sitting kids share, side by side; absent = on the ground. */
  readonly seat?: number;
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
  /** Each bridge's planks, rails, posts and piers (one span per bridge, in `bridges` order). */
  readonly spans: readonly District[];
  readonly critters: readonly Critter[];
  readonly hangouts: readonly Hangout[];
  /** Chimney and campfire smoke sources. */
  readonly smoke: readonly SmokeSource[];
  readonly sails: readonly Sail[];
  /** Every placed hero landmark: its district theme, ground spot and top height. */
  readonly landmarks: readonly { readonly theme: string; readonly x: number; readonly z: number; readonly y: number; readonly reach: number; readonly top: number }[];
  /** Every flight of steps, low walkable level to high. */
  readonly stairs: readonly Stair[];
  /** Every kerb laid along a walk (ground plan). */
  readonly kerbs: readonly KerbPiece[];
  /** The hub landmark the spawn camera frames, or null. */
  readonly focus: { readonly x: number; readonly z: number } | null;
  /** Where the player starts: in front of the plaza fountain, facing it and the landmark beyond (`face` = yaw). */
  readonly start: { readonly x: number; readonly z: number; readonly face: number };
  /** Ground every placed model claimed (read-only), for later placement such as collectibles. */
  readonly occupancy: GroundQuery;
  /** Calm lawn kept free on the spawn hub for the trophy hall (built only while rewards are on), or null. */
  readonly hall: HallSite | null;
  /** Spot on the spawn plaza for the class goal monument, facing the plaza centre, or null. */
  readonly monument: HallSite | null;
}

/** A round site and the yaw its open side faces (the hub centre). */
export interface HallSite {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly face: number;
}

/** Trophy hall site radii tried on the spawn hub, largest first. */
const HALL_RADII = [3.6, 3.1, 2.6];
/** Monument footprint radius and its distance from the plaza centre (between the spawn pad and the plaza rim). */
const MONUMENT_R = 1.4;
const MONUMENT_D = 4.9;
/** The player's start, metres from the plaza centre, and the fountain wall's height: above a jump from its lip (0.76 + 1.67 m) plus the capsule's foot. */
const START_D = 4.3;
const FOUNTAIN_WALL = 3.4;
/** Height the fountain stands at: its step rises clear of the plaza paving. */
const FOUNTAIN_Y = 0.1;

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
/** Roof colours round the hub (teal, coral, sunflower). */
const HUB_ROOFS = [0xf07a5f, 0x2fa39a, 0xf6c445];
const ROCKS = ['nature/rock_largeA', 'nature/rock_largeB', 'nature/rock_largeC', 'nature/rock_tallA', 'nature/rock_tallB'];
const SIDE: readonly (readonly [string, number])[] = [['suburb/building-type-a', 3.8], ['town/stall-green', 2.6], ['suburb/building-type-h', 4], ['suburb/building-type-e', 4]];
const SMALL: readonly (readonly [string, number])[] = [['town/stall-bench', 0.55], ['town/fountain-round-detail', 0.7], ['suburb/planter', 0.7]];
const LEAF_TINT = 0xc8eaa0;
/** Warm lavender over the kit's grey rocks (the bible's rock colour, never neutral grey). */
const ROCK_TINT = 0xf0e2f4;

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
      ...SIDE.map((t) => t[0]),
      ...SMALL.map((t) => t[0]),
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

/**
 * Designs the cosy-campus dressing for any layout: districts sized by their island, everything kept off plots, paths and
 * bridges; `purposeOf` (activity id to Moodle purpose) picks each district's theme, else themes go in order.
 */
export function designWorld(layout: WorldLayout, seed: number, palette: LookPalette, purposeOf?: (activityId: number) => string | undefined): Dressing {
  return new Designer(layout, seed, palette, purposeOf).build();
}

class Designer {
  private readonly life: LifeSpot[] = [];
  private readonly paths: Segment[] = [];
  private readonly pathIndex = new SegmentIndex();
  private readonly plotIndex = new Occupancy();
  private readonly circles: readonly Circle[];
  /** Bridge lines extended by 3 m at both ends (their landings). */
  private readonly landings: Segment[] = [];
  private readonly obstacles: Obstacle[] = [];
  private readonly bridges: Segment[] = [];
  private readonly spans: Segment[] = [];
  private readonly bridgeParts: District[] = [];
  /** Grounding patches stamped so far (centre, ground height, radius). */
  private readonly patches: { x: number; y: number; z: number; r: number }[] = [];
  /** Plaza walks: from each hub's centre out to every bridge landing on it. */
  private readonly walks: Segment[] = [];
  private readonly occ = new Occupancy();
  private readonly critters: Critter[] = [];
  private readonly hangouts: Hangout[] = [];
  private readonly smoke: SmokeSource[] = [];
  private readonly themes: readonly DistrictTheme[];
  private theme: DistrictTheme = HUB_THEME;
  private readonly entries = new Set<Segment>();
  /** Each zone's plot ring walks (centre, radius) and the entry walk crossing them; their chords in `paths` are painted as one band. */
  private readonly rings: { x: number; z: number; r: number; entry: Segment }[] = [];
  private readonly ringChords = new Set<Segment>();
  private readonly kerbPieces: KerbPiece[] = [];
  private focus: { x: number; z: number } | null = null;
  private start: { x: number; z: number; face: number } | null = null;
  private hall: HallSite | null = null;
  private monument: HallSite | null = null;
  private frame: FrameArc[] = [];
  /** Waterline rocks of the current island's cliff, laid in `shore` once its bridges and dock are known. */
  private toes: CliffToe[] = [];
  private readonly landmarks: { theme: string; x: number; z: number; y: number; reach: number; top: number }[] = [];
  /** Islands that got a broad shelf (they need fewer raised lawns). */
  private readonly shelves = new Set<Circle>();
  private readonly stairs: Stair[] = [];
  /** Raised levels (shelves, terraces, raised lawns): their top height and whether a footprint circle lies wholly on them. */
  private readonly levels: { y: number; holds: (x: number, z: number, r: number) => boolean }[] = [];
  /** Upright props placed on the current island (reach circle, height span) and the stamp group that laid them out together (0: none). */
  private readonly props: { id: string; x: number; z: number; r: number; y0: number; y1: number; group: number }[] = [];
  private group = 0;
  private groups = 0;
  private readonly shelfStairs = new Map<Shelf, Stair>();
  /** Ground each stair's flight and landings keep free of later solids. */
  private readonly stairKeep: StairBox[] = [];
  /** The keep boxes' bounding circles, for a cheap first test. */
  private readonly keepIndex = new Occupancy();
  private readonly random: () => number;
  /** Wayside stops draw from their own stream so the rest of the world keeps its seeded layout. */
  private readonly wayRandom: () => number;
  /** Garden rooms draw from their own stream too. */
  private readonly roomRandom: () => number;
  private district!: District;

  constructor(
    private readonly layout: WorldLayout,
    seed: number,
    private readonly p: LookPalette,
    purposeOf?: (activityId: number) => string | undefined,
  ) {
    this.random = seededRandom(seed ^ 0x2545f491);
    this.wayRandom = seededRandom(seed ^ 0x5eed57a1);
    this.roomRandom = seededRandom(seed ^ 0x6a4d3e11);
    this.themes = pickThemes(layout.zones.map((z) => z.plots.map((pl) => purposeOf?.(pl.activityId) ?? ''))).map((t) => DISTRICT_THEMES[t]);
    for (const z of layout.zones) this.spans.push(span(z.anchor, z));
    for (const l of layout.links) this.spans.push(span(layout.hubs[l.from]!, layout.hubs[l.to]!));
    for (const z of layout.zones) this.walks.push(spoke(z.anchor, z));
    for (const l of layout.links) this.walks.push(spoke(layout.hubs[l.from]!, layout.hubs[l.to]!), spoke(layout.hubs[l.to]!, layout.hubs[l.from]!));
    this.circles = [...layout.hubs, ...layout.zones];
    for (const z of layout.zones) for (const p of z.plots) this.plotIndex.add(p.x, p.z, p.radius);
    for (const s of this.spans) this.landings.push(extend(s, 3));
  }

  build(): Dressing {
    const { hubs, zones } = this.layout;
    const districts: District[] = [];
    hubs.forEach((hub, i) => {
      districts.push(this.open(hub));
      this.theme = HUB_THEME;
      this.islandCliff(hub);
      this.hubWalks(hub, i === 0 ? PLAZA : SMALL_PLAZA);
      if (i === 0) this.hub(hub);
      else this.plaza(hub, i);
      this.themed(hub, i === 0 ? HUB_THEME.corners : ['plaza'], i === 0 ? 2 : 1);
      if (i === 0) {
        this.hall = this.hallSite(hub);
        this.monument = this.monumentSite(hub);
        this.plazaBenches(hub);
      }
      const stops = this.waysides(hub, this.walks.filter((w) => w.ax === hub.x && w.az === hub.z), i === 0 ? [hub] : []);
      this.fillIsland(hub, i === 0 ? PLAZA + 0.8 : SMALL_PLAZA + 0.8, stops);
      this.shore(hub);
    });
    for (const l of this.layout.links) {
      this.district = districts[l.to]!;
      this.bridge(hubs[l.from]!, hubs[l.to]!);
    }
    zones.forEach((z) => this.layPaths(z));
    zones.forEach((z, i) => {
      districts.push(this.open(z));
      this.theme = this.themes[i]!;
      this.paintPaths(z);
      this.islandCliff(z);
      this.bridge(z.anchor, z);
      this.zone(z, i);
      const sites = this.roomSites(z);
      for (let n = 0; n < Math.round(2 + (z.radius * z.radius) / HUB_AREA); n++) this.gardenRoom(n, sites);
      this.themed(z, this.theme.corners, Math.max(1, Math.round((z.radius * z.radius) / 120)));
      const stops = this.waysides(z, this.paths.filter((s) => Math.hypot(s.bx - z.x, s.bz - z.z) <= z.radius), []);
      this.fillIsland(z, 0, stops);
      this.shore(z);
    });
    const sails = this.sea(districts);
    return {
      districts, life: this.life, paths: this.paths, obstacles: this.obstacles, bridges: this.bridges, spans: this.bridgeParts,
      critters: this.critters, hangouts: this.hangouts, smoke: this.smoke, sails, focus: this.focus, landmarks: this.landmarks, stairs: this.stairs, kerbs: this.kerbPieces,
      start: this.start ?? { x: this.layout.spawn.x, z: this.layout.spawn.z, face: 0 },
      occupancy: this.occ,
      hall: this.hall,
      monument: this.monument,
    };
  }

  private open(island: Circle): District {
    this.district = { island, placements: [], terrain: [], glow: [], blockers: [] };
    this.props.length = 0;
    return this.district;
  }

  /** The entry walk from the bridge to the middle and a brick ring walk through each ring of plots. */
  private layPaths(z: Zone): void {
    const ex = Math.cos(z.angle + Math.PI);
    const ez = Math.sin(z.angle + Math.PI);
    const count = z.plots.length;
    const stop = count === 1 ? z.plots[0]!.radius : 0;
    const walk = { ax: z.x + ex * (z.radius - 0.4), az: z.z + ez * (z.radius - 0.4), bx: z.x + ex * stop, bz: z.z + ez * stop };
    this.addPath(walk);
    this.entries.add(walk);
    for (const ring of plotRings(count)) {
      if (ring.radius === 0) continue;
      this.rings.push({ x: z.x, z: z.z, r: ring.radius, entry: walk });
      const n = Math.max(16, 2 * Math.round((Math.PI * ring.radius) / 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const b = ((i + 1) / n) * 2 * Math.PI;
        const chord = { ax: z.x + Math.cos(a) * ring.radius, az: z.z + Math.sin(a) * ring.radius, bx: z.x + Math.cos(b) * ring.radius, bz: z.z + Math.sin(b) * ring.radius };
        this.addPath(chord);
        this.ringChords.add(chord);
      }
    }
  }

  /** Brick walks of a zone (ring bands, flat strips with round joints) and stepping stones on the entry walk. */
  private paintPaths(z: Zone): void {
    const colour = this.p.path[0] ?? 0xc9765a;
    const rings = this.rings.filter((r) => r.x === z.x && r.z === z.z);
    for (const ring of rings) this.ringWalk(ring, colour);
    this.paths.forEach((s) => {
      if (this.ringChords.has(s) || Math.hypot((s.ax + s.bx) / 2 - z.x, (s.az + s.bz) / 2 - z.z) > z.radius) return;
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      const yaw = Math.atan2(s.bx - s.ax, s.bz - s.az);
      // The entry walk crosses the ring bands: 1 cm over them, never coplanar (z-fighting), its joint disc 5 mm over the strip.
      const entry = this.entries.has(s) ? WALK_STEP * 2 : 0;
      // 2 cm past both kerb ends: their end caps would share the walk's end planes.
      this.terrain(dropUndersides(new BoxGeometry(2.2, 0.06 + entry, len + 0.04)), colour, (s.ax + s.bx) / 2, 0.03 + entry / 2, (s.az + s.bz) / 2, yaw, false, false);
      this.terrain(dropUndersides(new CylinderGeometry(1.2, 1.2, 0.06 + entry + WALK_STEP, 12)), colour, s.bx, 0.03 + (entry + WALK_STEP) / 2, s.bz, 0, false, false);
      this.entryKerbs(s, rings.filter((r) => r.entry === s), entry);
      if (!this.entries.has(s)) return;
      for (let t = 1.2; t < len - 0.8; t += 2.4) {
        const x = s.ax + ((s.bx - s.ax) * t) / len;
        const zz = s.az + ((s.bz - s.az) * t) / len;
        this.model('nature/path_stone', x, 0.06, zz, yaw + this.random() * 0.4, 0, { width: 1.1, detail: true });
      }
    });
  }

  /** A plot ring walk: a smooth brick band with curved kerbs either side, open where the entry walk crosses. */
  private ringWalk(ring: { x: number; z: number; r: number; entry: Segment }, colour: number): void {
    const { x, z, r, entry } = ring;
    const half = 1.1;
    this.terrain(ringBand(r - half, r + half, 0.06), colour, x, 0, z, 0, false, false);
    const off = half + KERB.w / 2 - 0.08;
    // The entry walk runs through the centre: the kerbs stop at the entry kerbs' inner faces.
    const bearing = Math.atan2(entry.az - z, entry.ax - x);
    const reach = half - 0.08;
    for (const rr of [r - off, r + off]) {
      const gap = Math.asin(Math.min(1, reach / rr));
      const seed = (Math.round(x * 10) * 73856093) ^ (Math.round(rr * 100) * 19349663);
      this.district.terrain.push({ geometry: kerbArc(rr, bearing + gap, bearing + 2 * Math.PI - gap, this.p.trim, seed).translate(x, 0, z), solid: false, detail: true });
      this.kerbPieces.push({ kind: 'arc', x, z, r: rr, a0: bearing + gap, a1: bearing + 2 * Math.PI - gap });
    }
  }

  /** Kerbs either side of a walk, cut where it crosses the `rings` (their outer kerb faces), `lift` m up. */
  private entryKerbs(s: Segment, rings: readonly { x: number; z: number; r: number }[], lift: number): void {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const off = 1.1 + KERB.w / 2 - 0.08;
    const edge = off + KERB.w / 2;
    const cuts = rings.map((ring) => {
      // Distance along the walk from a to the point nearest the ring centre, and where the kerb line enters and leaves the ring's kerbs.
      const t0 = ((ring.x - s.ax) * (s.bx - s.ax) + (ring.z - s.az) * (s.bz - s.az)) / len;
      const lo = ring.r - edge > off ? Math.sqrt((ring.r - edge) ** 2 - off ** 2) : 0;
      const hi = Math.sqrt((ring.r + edge) ** 2 - off ** 2);
      return [[t0 - hi, t0 - lo], [t0 + lo, t0 + hi]] as const;
    }).flat().sort((a, b) => a[0] - b[0]);
    let from = 0;
    for (const [c0, c1] of [...cuts, [len, len] as const]) {
      const to = Math.min(len, c0);
      if (to - from > 0.3) {
        const mid = (from + to) / 2;
        this.kerbs(s.ax + ((s.bx - s.ax) * mid) / len, s.az + ((s.bz - s.az) * mid) / len, Math.atan2(s.bx - s.ax, s.bz - s.az), to - from, 1.1, lift);
      }
      from = Math.max(from, c1);
    }
  }

  /** Paved walks from the plaza edge out to each bridge on this hub. */
  private hubWalks(hub: Circle, plaza: number): void {
    const colour = this.p.path[1] ?? this.p.stone;
    for (const w of this.walks) {
      if (w.ax !== hub.x || w.az !== hub.z) continue;
      const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
      this.avenue(hub, (w.bx - w.ax) / len, (w.bz - w.az) / len, plaza, len, colour, 2.6);
    }
  }

  /** A straight paved walk with cream edging along (ux, uz) from `from` to `to` metres off the hub centre. */
  private avenue(hub: Circle, ux: number, uz: number, from: number, to: number, colour: number, width: number): void {
    const mid = (from + to) / 2;
    const yaw = Math.atan2(ux, uz);
    this.terrain(dropUndersides(new BoxGeometry(width, 0.08, to - from + 0.4)), colour, hub.x + ux * mid, 0.035, hub.z + uz * mid, yaw, false, false);
    this.kerbs(hub.x + ux * mid, hub.z + uz * mid, yaw, to - from, width / 2);
  }

  /**
   * Chunky cream kerb runs (detail dressing) either side of a walk `len` long centred on (x, z) along `yaw`, inner faces `half` - 0.08 m
   * off its axis, `lift` m up (runs that overlap at a joint or crossing differ in height: coplanar tops z-fight).
   */
  private kerbs(x: number, z: number, yaw: number, len: number, half: number, lift = 0): void {
    const off = half + KERB.w / 2 - 0.08;
    for (const side of [-1, 1]) {
      const kx = x + Math.cos(yaw) * side * off;
      const kz = z - Math.sin(yaw) * side * off;
      const seed = (Math.round(kx * 10) * 73856093) ^ (Math.round(kz * 10) * 19349663);
      this.district.terrain.push({ geometry: kerbRun(len, this.p.trim, seed).rotateY(yaw).translate(kx, lift, kz), solid: false, detail: true });
      this.kerbPieces.push({ kind: 'run', x: kx, z: kz, yaw, len });
    }
  }

  private hub(hub: Circle): void {
    const bearings = this.bearingsAt(0);
    const back = widestGap(bearings, this.random() * 2 * Math.PI);
    const lr = hub.radius - 4.5;
    const lx = Math.cos(back) * lr;
    const lz = Math.sin(back) * lr;
    const face = Math.atan2(-lx, -lz);
    const lm = buildLandmark(HUB_THEME.landmark, this.p, HUB_THEME.accent, HUB_THEME.accentShade);
    const above = landmarkSolid(lm, lx, 1.6, lz, face, 1);
    const shelf = this.shelf(hub, back, FRAME.r1 + 2.5, lr - 4, 1.6, above);
    if (!shelf) this.terrace(lx, lz, 3.8, 1.6, face, above);
    this.theme = HUB_THEME;
    this.placeLandmark(lm, lx, 1.6, lz, face, 1);
    this.focus = { x: lx, z: lz };
    this.fountain(hub);
    if (shelf) this.shelfTop(hub, shelf, 1.6, { x: lx, z: lz, r: 3.8 });
    const ux = Math.cos(back);
    const uz = Math.sin(back);
    const end = shelf ? shelf.edge + 0.2 : lr - 3.6;
    this.avenue(hub, ux, uz, PLAZA, end, this.p.path[1] ?? this.p.stone, 2.4);
    this.walks.push({ ax: hub.x, az: hub.z, bx: hub.x + ux * end, bz: hub.z + uz * end });
    this.plazaFrame(hub, [...bearings, back]);
    gaps(bearings).forEach(([a, width], i) => {
      if (Math.abs(wrap(a - back)) < 0.8 || width * (hub.radius - 4.4) < 16) return;
      const x = Math.cos(a) * (hub.radius - 4.4);
      const z = Math.sin(a) * (hub.radius - 4.4);
      const [id, h] = SIDE[i % SIDE.length]!;
      this.building(id, h, x, z, Math.atan2(-x, -z), HUB_ROOFS[i % HUB_ROOFS.length]);
    });
    this.dock(hub, true);
  }

  /**
   * The spawn plaza's tiered fountain (hub concept) at its centre: solid stone (its moving water is not), ringed by a collision wall above any jump so nothing
   * passes into the basin; the player starts in front of it on the side away from the landmark, facing both.
   */
  private fountain(hub: Circle): void {
    const lm = tieredFountain(this.p, HUB_THEME.accent);
    for (const g of lm.parts) this.district.terrain.push({ geometry: g.translate(hub.x, FOUNTAIN_Y, hub.z), solid: !g.getAttribute('sway'), detail: false });
    this.district.blockers.push(new CylinderGeometry(FOUNTAIN_LIP, FOUNTAIN_LIP, FOUNTAIN_WALL, 24, 1, true).translate(hub.x, FOUNTAIN_WALL / 2, hub.z));
    this.reserve(hub.x, hub.z, FOUNTAIN_STEP + 0.2);
    this.obstacles.push({ x: hub.x, z: hub.z, r: FOUNTAIN_LIP });
    const a = this.focus ? Math.atan2(this.focus.z - hub.z, this.focus.x - hub.x) : 0;
    const x = hub.x - Math.cos(a) * START_D;
    const z = hub.z - Math.sin(a) * START_D;
    this.start = { x, z, face: Math.atan2(hub.x - x, hub.z - z) };
  }

  /** The spawn plaza's frame (art bible: hub concept): raised hedge planters round the rim, open with a lamp pair at every entry. */
  private plazaFrame(hub: Circle, entries: readonly number[]): void {
    const mid = (FRAME.r0 + FRAME.r1) / 2;
    this.frame = frameArcs(entries, FRAME_OPEN / mid, FRAME_RUN / mid, FRAME_GAP / mid);
    const random = seededRandom(0x91a2a);
    for (const arc of this.frame) {
      const g = planterRun(arc, FRAME, this.p, random).translate(hub.x, 0, hub.z);
      this.district.terrain.push({ geometry: g, solid: true, detail: false });
      for (const f of runFootprint(arc, FRAME)) this.reserve(hub.x + f.x, hub.z + f.z, f.r);
      for (const f of runFootprint(arc, FRAME, true)) this.obstacles.push({ x: hub.x + f.x, z: hub.z + f.z, r: f.r });
    }
    for (const a of entries) {
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      for (const side of [-1, 1]) this.lamp(hub.x + ux * (FRAME.r1 + 0.3) + uz * side * 1.9, hub.z + uz * (FRAME.r1 + 0.3) - ux * side * 1.9, 2.8);
    }
  }

  /** Benches inside the frame, one at the middle of each long planter run, lengthwise along it (the model is long in z), facing the spawn pad. */
  private plazaBenches(hub: Circle): void {
    const r = FRAME.r0 - 0.65;
    for (const arc of this.frame) {
      if ((arc.a1 - arc.a0) * r < 2.4) continue;
      const a = (arc.a0 + arc.a1) / 2;
      const bx = hub.x + Math.cos(a) * r;
      const bz = hub.z + Math.sin(a) * r;
      if (this.model('town/stall-bench', bx, 0, bz, Math.atan2(hub.x - bx, hub.z - bz) + Math.PI / 2, 0.55, { solid: true, wall: 0.5 })) {
        this.hangouts.push({ kind: 'sit', x: bx, z: bz, face: Math.atan2(hub.x - bx, hub.z - bz), seat: 0.55 });
      }
    }
  }

  /**
   * Keeps a calm round lawn on the hub for the trophy hall: the first free site on rings out from the plaza, angles nearest
   * the landmark first (so it frames with the tower from the spawn); no random draws.
   */
  private hallSite(hub: Circle): HallSite | null {
    const back = this.focus ? Math.atan2(this.focus.z - hub.z, this.focus.x - hub.x) : 0;
    for (const r of HALL_RADII) {
      for (let d = PLAZA + r + 1.2; d <= hub.radius - r - 1.6; d += 0.5) {
        const n = Math.max(24, Math.round((2 * Math.PI * d) / 0.75));
        for (let k = 0; k < n; k++) {
          const a = back + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * ((2 * Math.PI) / n);
          const x = hub.x + Math.cos(a) * d;
          const z = hub.z + Math.sin(a) * d;
          if (this.near(x, z, r) || this.nearBridge(x, z, r + 1.6) || this.pathIndex.within(x, z, r + 0.5)) continue;
          this.reserve(x, z, r + 0.4);
          return { x, z, r, face: Math.atan2(hub.x - x, hub.z - z) };
        }
      }
    }
    return null;
  }

  /**
   * The monument spot on the spawn plaza: beside the avenue to the landmark, on the side away from the trophy hall, off every
   * line from the pad to a bridge; no random draws.
   */
  private monumentSite(hub: Circle): HallSite | null {
    const back = this.focus ? Math.atan2(this.focus.z - hub.z, this.focus.x - hub.x) : 0;
    const hall = this.hall ? wrap(Math.atan2(this.hall.z - hub.z, this.hall.x - hub.x) - back) : 1;
    const side = hall > 0 ? -1 : 1;
    const bearings = this.bearingsAt(0);
    for (let off = 0.8; off <= Math.PI; off += 0.1) {
      for (const sign of [side, -side]) {
        const a = back + sign * off;
        if (bearings.some((b) => Math.abs(wrap(a - b)) < 0.45)) continue;
        const x = hub.x + Math.cos(a) * MONUMENT_D;
        const z = hub.z + Math.sin(a) * MONUMENT_D;
        this.reserve(x, z, MONUMENT_R);
        return { x, z, r: MONUMENT_R, face: Math.atan2(hub.x - x, hub.z - z) };
      }
    }
    return null;
  }

  /** A further plaza: paving, a fountain in the middle, lamps between its bridges and a shelf over its widest gap. */
  private plaza(hub: Circle, index: number): void {
    const shelf = this.shelf(hub, widestGap(this.bearingsAt(index), 0), SMALL_PLAZA + 2.5, hub.radius - 4, 1.2, null);
    if (shelf) this.shelfTop(hub, shelf, 1.2, { x: 0, z: 0, r: 0 });
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
    const lm = buildLandmark(this.theme.landmark, this.p, this.theme.accent, this.theme.accentShade);
    // Big districts get a bigger hero so it stays the tallest thing in view; a wide base is scaled down to fit HERO_REACH.
    const grow = Math.min(1.5, Math.max(1, z.radius / 18)) * Math.min(1, HERO_REACH / lm.radius);
    const tr = Math.max(3.4, lm.radius * grow + 0.5);
    const h = 1.8 + (i % 2) * 0.8;
    const d = z.radius - tr - 0.6;
    const lx = z.x + Math.cos(out) * d;
    const lz = z.z + Math.sin(out) * d;
    const shelf = this.shelf(z, out, z.radius * 0.15, d - tr + 0.2, h, landmarkSolid(lm, lx, h, lz, Math.atan2(z.x - lx, z.z - lz), grow));
    if (shelf) {
      const mx = lx;
      const mz = lz;
      this.placeLandmark(lm, mx, h, mz, Math.atan2(z.x - mx, z.z - mz), grow);
      this.shelfTop(z, shelf, h, { x: mx - z.x, z: mz - z.z, r: tr });
    }
    // Short of room, a small terrace by the rim with the hero scaled to it, raised (up to 2.6 m) to keep it HERO_TOP high.
    for (const terraceR of shelf ? [] : [tr, 3.4]) {
      const r = z.radius - terraceR - 0.6;
      const mx = z.x + Math.cos(out) * r;
      const mz = z.z + Math.sin(out) * r;
      const face = Math.atan2(z.x - mx, z.z - mz);
      if (!this.free(mx, mz, 2 * terraceR + 0.6, 0.5, true)) continue;
      const scale = (grow * terraceR) / tr;
      const hh = Math.max(h, Math.min(2.6, HERO_TOP - lm.height * scale));
      this.terrace(mx, mz, terraceR, hh, face, landmarkSolid(lm, mx, hh, mz, face, scale));
      this.placeLandmark(lm, mx, hh, mz, face, scale);
      break;
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

  /**
   * The island's broad upper shelf (art bible §3, district concept) towards bearing `at`: the broadest clear cap with its wall
   * `near`..`far` metres from the centre, `h` high, on cut stone with a rock stair facing the centre clear of the landmark
   * `above`; null when no site or no stair is clear.
   */
  private shelf(c: Circle, at: number, near: number, far: number, h: number, above: LandmarkSolid | null): Shelf | null {
    const main = c === this.layout.hub;
    const plaza = this.layout.hubs.includes(c) ? (main ? FRAME.r1 + 1.2 : SMALL_PLAZA + 0.8) : 0;
    const s = shelfSite(c.radius, at, near, far, (lx, lz) => {
      const x = c.x + lx;
      const z = c.z + lz;
      return (
        Math.hypot(lx, lz) < plaza || this.onPlot(x, z, SHELF_CLEAR.plot) || this.nearBridge(x, z, DECK_HALF + SHELF_CLEAR.bridge) ||
        this.pathIndex.within(x, z, SHELF_CLEAR.path) || this.near(x, z, 0.3)
      );
    });
    if (!s) return null;
    const centre = shelfCentre(s);
    const arcs = shelfArcs(s);
    const back = s.at + Math.PI;
    const half = STAIR_WIDE / 2 + PIER_SIDE;
    const out = s.radius + STAIR.pier;
    const flight = (b: number) => makeStair(c.x + centre.x + Math.cos(b) * out, c.z + centre.z + Math.sin(b) * out, Math.atan2(Math.cos(b), Math.sin(b)), 0, h, STAIR_WIDE, STAIR.pier);
    const turns = STAIR_TURNS.filter((t) => Math.abs(t) < arcs.wall - (half + 1) / s.radius);
    const turn = turns.find((t) => this.stairFits(flight(back + t), above));
    if (turn === undefined) return null;
    this.shelves.add(c);
    this.levels.push({ y: h, holds: (x, z, r) => onShelf(s, x - c.x, z - c.z, r) });
    const bearing = back + turn;
    const st = flight(bearing);
    const top = (g: BufferGeometry) => this.district.terrain.push({ geometry: g.translate(c.x, 0, c.z), solid: true, detail: false });
    top(outlinePrism(shelfOutline(s, -0.1, -0.1), -0.05, h - TERRACE_LIP, this.p.grass));
    top(outlinePrism(shelfOutline(s, 0.12, 0.06), h - TERRACE_LIP, h, this.p.grass));
    const inner = cliffWall(s.radius, -0.05, h - 0.1, 0, this.p, this.random, TERRACE_CLIFF, { at: s.at, half: Math.PI - arcs.wall + 0.6 / s.radius }, [{ at: bearing, half: (half + 0.05) / s.radius }]);
    top(inner.wall.translate(centre.x, 0, centre.z));
    for (const t of inner.toes) {
      const lx = centre.x + t.x;
      const lz = centre.z + t.z;
      if (Math.hypot(lx, lz) > c.radius - 1 || Math.abs(wrap(Math.atan2(t.z, t.x) - bearing)) < (half + t.r + 0.4) / s.radius) t.geometry.dispose();
      else this.district.terrain.push({ geometry: t.geometry.translate(c.x + centre.x, 0, c.z + centre.z), solid: false, detail: true });
    }
    const outer = cliffWall(c.radius, -0.05, h - 0.1, 0, this.p, this.random, SHELF_RIM, { at: back, half: Math.PI - arcs.rim + 0.5 / c.radius });
    top(outer.wall);
    this.layStair(st, this.stoneSteps());
    this.shelfStairs.set(s, st);
    // Obstacles tile the top edge to edge (touching, never overlapping) wherever earlier things left it free.
    const tiles = shelfSamples(s, 1.4, 0.3).filter((p) => !this.near(c.x + p.x, c.z + p.z, 0.7));
    for (const p of tiles) {
      this.reserve(c.x + p.x, c.z + p.z, 1);
      this.obstacles.push({ x: c.x + p.x, z: c.z + p.z, r: 0.7 });
    }
    return s;
  }

  /** Dressing on a shelf's top at `h`: a lamp pair at the stair head and up to three clusters, clear of the landmark `keep`. */
  private shelfTop(c: Circle, s: Shelf, h: number, keep: { x: number; z: number; r: number }): void {
    const st = this.shelfStairs.get(s)!;
    const ux = -Math.sin(st.face);
    const uz = -Math.cos(st.face);
    const head = { x: st.x - c.x + ux * (st.pier + 1.3), z: st.z - c.z + uz * (st.pier + 1.3) };
    for (const side of [-1, 1]) {
      const x = c.x + head.x - uz * side * 1.7;
      const z = c.z + head.z + ux * side * 1.7;
      this.model('town/lantern', x, h, z, 0, 2.6, { detail: true });
      this.district.glow.push(paintPlace(new CylinderGeometry(0.17, 0.17, 0.27, 8), 0xffd890, x, h + 2.6 * 0.875, z, 0));
    }
    const taken = [keep, { ...head, r: 2.2 }];
    for (const kind of ['treeClump', 'gardenBed', 'readingNook'] as const) {
      const rec = recipe(kind, this.random);
      const spots = shelfSamples(s, 1, rec.radius + 0.4);
      for (let k = 0; k < 12 && spots.length; k++) {
        const p = spots[Math.floor(this.random() * spots.length)]!;
        if (taken.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < t.r + rec.radius + 0.4)) continue;
        this.stamp(rec, c.x + p.x, h, c.z + p.z, Math.atan2(-p.x, -p.z), true);
        taken.push({ ...p, r: rec.radius });
        break;
      }
    }
  }

  /**
   * A raised grass terrace on the terrace cliff with a cut-stone stair facing `face` or the nearest bearing with clear landings,
   * its pier long enough to clear the landmark `above`.
   */
  private terrace(x: number, z: number, r: number, h: number, face: number, above: LandmarkSolid): void {
    const out = r + STAIR.pier;
    const st = this.stairRound(x, z, r, h, face, STAIR_WIDE, STAIR.pier, above) ?? makeStair(x + Math.sin(face) * out, z + Math.cos(face) * out, face, 0, h, STAIR_WIDE, STAIR.pier);
    this.reserve(x, z, r + 1.6);
    this.obstacles.push({ x, z, r: r + 1.1 });
    this.terraceSides(x, z, r, h, st.face, st.width / 2 + PIER_SIDE);
    this.layStair(st, this.stoneSteps());
  }

  /**
   * The stair round a raised round level at (x, z), radius r, h high: at the first bearing from `face` whose flight and landings
   * fit, its `pier` lengthened (up to PIER_GROW metres) only when no bearing clears the landmark `above`; null when none fits.
   */
  private stairRound(x: number, z: number, r: number, h: number, face: number, width: number, pier = 0, above: LandmarkSolid | null = null): Stair | null {
    for (let grow = 0; grow <= (pier ? PIER_GROW : 0); grow += 0.25) {
      for (const turn of STAIR_TURNS) {
        const out = r + pier + grow;
        const st = makeStair(x + Math.sin(face + turn) * out, z + Math.cos(face + turn) * out, face + turn, 0, h, width, pier && pier + grow);
        if (this.stairFits(st, above)) return st;
      }
    }
    return null;
  }

  /**
   * Whether a stair's flight, low landing and pier landing lie on open island ground: off plots (landings PLOT_CLEAR off),
   * earlier solids, raised levels, other stairs and the landmark `above`, the flight also off walks and their kerbs.
   */
  private stairFits(st: Stair, above: LandmarkSolid | null = null): boolean {
    const { flight, low, high } = stairBoxes(st);
    const landings = [...boxSamples(low, 0.7), ...(st.pier ? boxSamples(high, 0.7) : [])];
    if (landings.some((p) => this.onPlot(p.x, p.z, PLOT_CLEAR))) return false;
    const reach = st.run + st.width + 2 * STAIR.landing;
    const obstacles = this.obstacles.filter((o) => Math.hypot(o.x - st.x, o.z - st.z) < reach + o.r);
    const keep = this.keepIndex.hits(st.x, st.z, reach) ? this.stairKeep : [];
    if (boxSamples(flight, 0.7).some((p) => this.pathIndex.within(p.x, p.z, WALK_HALF + KERB.w + 0.1))) return false;
    return [...boxSamples(flight, 0.7), ...landings].every(
      (p) =>
        this.circles.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.radius - 1.2) &&
        !this.onPlot(p.x, p.z, 0.2) &&
        !(above && blocks(above, p.x, p.z, KID_RADIUS)) &&
        !this.near(p.x, p.z, KID_RADIUS) &&
        !obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + KID_RADIUS) &&
        !keep.some((b) => inBox(b, p.x, p.z, 0.3)),
    );
  }

  /** Lays a stair (and its landing pier) as solid terrain and keeps its flight and both landings clear of later solids. */
  private layStair(st: Stair, colours: StairColours): void {
    this.stairs.push(st);
    this.district.terrain.push({ geometry: stairFlight(st, colours), solid: true, detail: false });
    if (st.pier) this.district.terrain.push({ geometry: stairPier(st, colours), solid: true, detail: false });
    const boxes = stairBoxes(st);
    for (const b of [boxes.flight, boxes.low, boxes.high]) {
      this.stairKeep.push(b);
      this.keepIndex.add(b.x, b.z, Math.hypot(b.long, b.half));
    }
    for (const b of st.pier ? [boxes.flight, boxes.low, boxes.high] : [boxes.flight, boxes.low]) for (const p of boxSamples(b, 0.7)) this.reserve(p.x, p.z, 0.45);
  }

  private stoneSteps(): StairColours {
    return { tread: this.p.trim, riser: this.p.cliffHigh, side: this.p.cliffHigh };
  }

  /**
   * A raised lawn's body (art bible §3): grass top with an overhanging lip over the island cliff at terrace scale, open for a
   * stair `half` metres each side facing `face`; its foot rocks stay clear of the stair.
   */
  private terraceSides(x: number, z: number, r: number, h: number, face: number, half: number): void {
    this.levels.push({ y: h, holds: (px, pz, pr) => Math.hypot(px - x, pz - z) <= r - pr });
    this.terrain(new CylinderGeometry(r - 0.1, r - 0.1, h - TERRACE_LIP, 24), this.p.grass, x, (h - TERRACE_LIP) / 2, z, 0, true, false);
    this.terrain(new CylinderGeometry(r + 0.12, r + 0.06, TERRACE_LIP, 28), this.p.grass, x, h - TERRACE_LIP / 2, z, 0, true, false);
    const at = Math.atan2(Math.cos(face), Math.sin(face));
    const { wall, toes } = cliffWall(r, -0.05, h - 0.1, 0, this.p, this.random, TERRACE_CLIFF, { at, half: (half + 0.05) / r });
    this.district.terrain.push({ geometry: wall.translate(x, 0, z), solid: true, detail: false });
    for (const t of toes) {
      if (Math.abs(wrap(Math.atan2(t.z, t.x) - at)) < (half + t.r + 0.4) / r) t.geometry.dispose();
      else this.district.terrain.push({ geometry: t.geometry.translate(x, 0, z), solid: false, detail: true });
    }
  }

  private building(id: string, h: number, x: number, z: number, face: number, roofColour = this.theme.accent): void {
    const reach = this.reach(id, h);
    if (!this.free(x, z, reach * 2, 1, true)) return;
    const house = id.startsWith('suburb');
    const roof = house ? roofColour : undefined;
    const yaw = face + (house ? Math.PI : 0);
    if (!this.model(id, x, 0, z, yaw, h, { solid: true, ...(roof !== undefined ? { roof } : {}) }) || !house) return;
    const stack = chimney(id, FOOT[id]!.h, h, x, z, yaw, this.p);
    if (stack) for (const part of stack.parts) this.terrain(part.geometry, part.color, stack.x, stack.y + part.y, stack.z, yaw, false, false);
    if (this.random() < 0.4 && stack) this.smoke.push({ ...stack.smoke, kind: 'chimney' });
  }

  /** The island's designed cliff (`cliff-wall.ts`) under the grass lip, merged into the district; its toe rocks wait for `shore`. */
  private islandCliff(c: Circle): void {
    const { wall, toes } = cliffWall(c.radius, WATER_Y - 0.4, RIM_TOP, WATER_Y, this.p, seededRandom(Math.round(c.x * 73 + c.z * 131) ^ 0x5c1f), ISLAND_CLIFF);
    this.district.terrain.push({ geometry: wall.translate(c.x, 0, c.z), solid: false, detail: false });
    this.toes = toes;
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
    // The bridge is its own span (always built and drawn at full detail), not part of either island's district.
    const owner = this.district;
    const centre = (a + b) / 2;
    this.district = { island: { x: from.x + dx * centre, z: from.z + dz * centre, radius: (b - a) / 2 + 1 }, placements: [], terrain: [], glow: [], blockers: [] };
    this.bridgeParts.push(this.district);
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
        this.terrain(new CylinderGeometry(0.18, 0.22, -WATER_Y - 0.6, 7), this.p.woodDark, from.x + dx * t + ox, WATER_Y / 2 - 0.5, from.z + dz * t + oz, 0, false, false);
      }
    }
    this.district = owner;
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

  /** Garden room `n` of a district (district concept) on its widest free lawn, open towards its nearest walk; none when no lawn is wide enough. */
  private gardenRoom(n: number, sites: RoomSites): void {
    let best = null;
    let k = 0;
    for (; k < ROOMS.length && !best; k++) best = sites.find(ROOM_SAMPLES[k]!);
    if (!best) return;
    const size = ROOMS[k - 1]!;
    const { x, z: zz, face } = best;
    const c = Math.cos(face);
    const sn = Math.sin(face);
    const at = (dx: number, dz: number): [number, number] => [x + dx * c + dz * sn, zz - dx * sn + dz * c];
    const reading = (this.theme.id === 'library' || this.theme.id === 'arts') === (n % 2 === 0);
    const room = gardenRoom(reading ? 'reading' : 'parterre', size, this.p, this.theme.accent, this.roomRandom);
    for (const g of [room.hedges, room.inside]) this.district.terrain.push({ geometry: g.rotateY(face).translate(x, 0, zz), solid: true, detail: false });
    for (const w of room.walls) {
      const [wx, wz] = at(w.x, w.z);
      this.obstacles.push({ x: wx, z: wz, r: w.r });
    }
    const [tx, tz] = at(room.tree.x, room.tree.z);
    this.model(this.roomRandom() < 0.5 ? 'nature/tree_oak' : 'nature/tree_detailed', tx, 0, tz, this.roomRandom() * 6, 4.4, { sway: true, solid: true, ground: true, tint: LEAF_TINT });
    this.obstacles.push({ x: tx, z: tz, r: 0.5 });
    if (room.bench) {
      const [bx, bz] = at(room.bench.x, room.bench.z);
      this.model('town/stall-bench', bx, 0, bz, face + room.bench.yaw, 0.55, { solid: true, ground: true });
      this.obstacles.push({ x: bx, z: bz, r: 0.5 });
      this.hangouts.push({ kind: 'sit', x: bx, z: bz, face: face + Math.PI / 2, seat: 0.55 });
    }
    for (const s of room.seats) {
      const [sx, sz] = at(s.x, s.z);
      this.hangouts.push({ kind: 'sit', x: sx, z: sz, face: face + s.face });
    }
    this.reserve(x, zz, roomReach(size));
  }

  /**
   * Free spots on a district for its garden rooms, most open lawn round them first (ties nearest a walk); `find` gives the first where a
   * room's `samples` all fit on what is free now, its front towards the nearest walk or else the island centre.
   */
  private roomSites(z: Zone): RoomSites {
    const walks = this.paths.filter((s) => Math.hypot(s.bx - z.x, s.bz - z.z) <= z.radius);
    const bridges = [...this.landings, ...this.walks].filter((s) => segmentDistance(z.x, z.z, s) < z.radius + 4);
    // free(x, z, 0.3, 0.2) on this island alone, with only its own bridges: the search makes thousands of calls.
    const clear = (x: number, zz: number, r = 0) =>
      Math.hypot(x - z.x, zz - z.z) < z.radius - 1.65 - r && !this.onPlot(x, zz, 1.35 + r) && !this.pathIndex.within(x, zz, 1.45 + r) &&
      !this.near(x, zz, 0.15 + r) && bridges.every((s) => segmentDistance(x, zz, s) >= DECK_HALF + 1.55 + r);
    // Every room covers a disc this wide round its centre, so a site must be clear that far whatever way it faces.
    const inner = Math.min(...ROOMS.map((r) => Math.min(r.w, r.d) / 2 + HEDGE_THICK / 2));
    const sites: { x: number; z: number; room: number; walk: number; to: { x: number; z: number } }[] = [];
    for (let dx = -z.radius; dx <= z.radius; dx++) {
      for (let dz = -z.radius; dz <= z.radius; dz++) {
        const x = z.x + dx;
        const zz = z.z + dz;
        if (Math.hypot(dx, dz) > z.radius - 1.65 - inner || !clear(x, zz, inner)) continue;
        let [lo, hi] = [inner, 6.5];
        while (hi - lo > 0.5) {
          const mid = Math.round(lo + hi) / 2;
          if (this.near(x, zz, mid)) hi = mid;
          else lo = mid;
        }
        const to = nearestOn(walks, x, zz) ?? { x: z.x, z: z.z, d: 0 };
        sites.push({ x, z: zz, room: lo, walk: to.d, to });
      }
    }
    sites.sort((a, b) => b.room - a.room || a.walk - b.walk);
    return {
      find: (samples) => {
        for (const { x, z: zz, to } of sites.slice(0, ROOM_TRIES)) {
          const face = [Math.atan2(to.x - x, to.z - zz), Math.atan2(z.x - x, z.z - zz)].find((f) =>
            samples.every(([px, pz]) => clear(x + px * Math.cos(f) + pz * Math.sin(f), zz - px * Math.sin(f) + pz * Math.cos(f))),
          );
          if (face !== undefined) return { x, z: zz, face };
        }
        return null;
      },
    };
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
      for (let t = 2.5; t < len - 1; t += LAMP_STEP * 2) {
        for (const side of [-1.7, 1.7]) {
          const x = s.ax + ((s.bx - s.ax) * t) / len + nx * side;
          const zz = s.az + ((s.bz - s.az) * t) / len + nz * side;
          if (!this.onPlot(x, zz, 0.8)) this.lamp(x, zz, 2.6);
        }
      }
    }
  }

  private lamp(x: number, z: number, h: number): void {
    if (!this.model('town/lantern', x, 0, z, 0, h, { solid: true, detail: true, margin: 0.5 })) return;
    this.district.glow.push(paintPlace(new CylinderGeometry(0.17, 0.17, 0.27, 8), 0xffd890, x, h * 0.875, z, 0));
  }

  /** Wayside stops beside the island's walks wherever no stall, sign or fountain stands within WAYSIDE_SPACING, facing the walk; returns how many. */
  private waysides(c: Circle, walks: readonly Segment[], sights: readonly { x: number; z: number }[]): number {
    const own = this.district.placements.filter((p) => SIGHT_IDS.has(p.id));
    const first = Math.floor(this.wayRandom() * WAYSIDE.length);
    return wayStops(pathPoints(walks, 1.5), [...sights, ...own], WAYSIDE_SPACING, (p, n) => {
      const rec = recipe(WAYSIDE[(first + n) % WAYSIDE.length]!, this.wayRandom);
      for (const off of [0.6, 1.2, 1.9, 2.6]) {
        for (const side of n % 2 ? [1, -1] : [-1, 1]) {
          const x = p.x + p.nx * side * (rec.radius + off);
          const z = p.z + p.nz * side * (rec.radius + off);
          const face = Math.atan2(p.x - x, p.z - z);
          if (Math.hypot(x - c.x, z - c.z) > c.radius || !this.free(x, z, 2 * rec.radius - 1, 0.2) || !this.sightFits(rec, x, z, face)) continue;
          this.stamp(rec, x, 0, z, face, false);
          return { x, z };
        }
      }
      return null;
    }).length;
  }

  /** Curated clusters over an island (art bible section 6): raised lawns, tree clumps, beds, rock groups, nooks (one fewer per wayside stop); calm lawn between. */
  private fillIsland(c: Circle, inner: number, stops: number): void {
    const k = (c.radius * c.radius) / HUB_AREA;
    const landmark = this.landmarks.some((l) => Math.hypot(l.x - c.x, l.z - c.z) < c.radius) ? 1 : 0;
    this.lawnTerraces(c, inner, (k < 1.3 ? 2 : 3) - landmark - (this.shelves.has(c) ? 1 : 0));
    this.clusters(c, inner, 'treeClump', Math.max(2, Math.round(5 * k)));
    this.clusters(c, inner, 'gardenBed', Math.max(1, Math.round(3 * k)));
    this.clusters(c, inner, 'rockGroup', Math.max(1, Math.round(2.5 * k)));
    this.clusters(c, inner, 'readingNook', Math.max(0, Math.max(1, Math.round(1.5 * k)) - stops));
    this.fill(c, Math.max(inner, c.radius * 0.7), Math.round(5 * k), 3.2, 1.4, (x, z, s) => this.tree(x, z, s));
    this.pets(c);
  }

  /** Up to `count` clusters of one recipe on free lawn, each facing the island centre. */
  private clusters(c: Circle, inner: number, kind: RecipeKind, count: number): void {
    const outer = c.radius - 2.4;
    for (let i = 0, placed = 0; i < count * 15 && placed < count; i++) {
      const rec = recipe(kind, this.random);
      const a = this.random() * 2 * Math.PI;
      const r = Math.sqrt(inner * inner + this.random() * (outer * outer - inner * inner));
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (!this.free(x, z, 2 * rec.radius - 2, 0.2)) continue;
      this.stamp(rec, x, 0, z, Math.atan2(c.x - x, c.z - z), true);
      placed++;
    }
  }

  /** Stamps a recipe at (x, y, z) facing `face`: its grounding patch and items; the cluster claims one footprint, its solids trunk-sized obstacles. */
  /** Whether a ground-level recipe's sights (its sign or stall) would be laid at (x, z): a stop without its sight is no stop. */
  private sightFits(rec: Recipe, x: number, z: number, face: number): boolean {
    return rec.items.every((it) => {
      if (!SIGHT_IDS.has(it.id)) return true;
      const ix = x + it.dx * Math.cos(face) + it.dz * Math.sin(face);
      const iz = z - it.dx * Math.sin(face) + it.dz * Math.cos(face);
      const r = it.block ?? Math.min(0.5, this.reach(it.id, it.height));
      return !(it.solid && this.occ.hits(ix, iz, r)) && !this.clashes(it.id, ix, 0, iz, it.height, it) && this.supported(it.id, ix, 0, iz, it.height, it);
    });
  }

  private stamp(rec: Recipe, x: number, y: number, z: number, face: number, patch: boolean): void {
    const cs = Math.cos(face);
    const sn = Math.sin(face);
    // Patches share one height above their ground: one overlapping another would z-fight, so it is left out.
    if (patch && rec.patch && !this.patches.some((p) => p.y === y && Math.hypot(p.x - x, p.z - z) < (p.r + rec.patch!.r) * 1.25)) {
      this.patches.push({ x, y, z, r: rec.patch.r });
      const g = paintPlace(softBlob(rec.patch.r / 1.15, seededRandom(Math.round(x * 97 + z * 7919) >>> 0)).scale(1.25, 1, 1), this.p.grass, x, y + 0.016, z, face);
      const ground = (px: number, pz: number, out: Color): Color => (y < LEVEL_MIN ? lawnColour(this.p, px, pz, out) : out.set(this.p.grass));
      this.district.terrain.push({ geometry: fadeBlob(g, x, z, PATCH_SHADE, ground), solid: false, detail: true });
      for (let i = 0; i < 5; i++) {
        const a = this.random() * 2 * Math.PI;
        this.model(this.pick(TUFTS), x + Math.cos(a) * rec.patch.r * 1.1, y, z + Math.sin(a) * rec.patch.r * 1.1, this.random() * 6, 0.35 + this.random() * 0.2, { sway: true, detail: true, rich: true, tint: LEAF_TINT });
      }
    }
    this.group = ++this.groups;
    for (const it of rec.items) {
      const ix = x + it.dx * cs + it.dz * sn;
      const iz = z - it.dx * sn + it.dz * cs;
      if (!it.sway && this.clashes(it.id, ix, y, iz, it.height, it)) continue;
      if (it.solid && y < 1) {
        const r = it.block ?? Math.min(0.5, this.reach(it.id, it.height));
        if (this.occ.hits(ix, iz, r)) continue;
        this.occ.add(ix, iz, r);
        this.obstacles.push({ x: ix, z: iz, r });
      }
      this.model(it.id, ix, y, iz, it.yaw === undefined ? this.random() * 6 : face + it.yaw, it.height, { ...it, ground: true });
      if (it.light) this.district.glow.push(paintPlace(new CylinderGeometry(0.17, 0.17, 0.27, 8), 0xffd890, ix, y + it.height * 0.875, iz, 0));
    }
    this.group = 0;
    this.reserve(x, z, rec.radius);
  }

  /** Raised lawns 0.9-1.4 m high (art bible §3), each with stone steps towards the centre and a cluster on top; large sizes first. */
  private lawnTerraces(c: Circle, inner: number, count: number): void {
    const outer = c.radius - 2;
    let placed = 0;
    for (const size of LAWNS) {
      for (let i = 0; i < count * 100 && placed < count && outer > inner; i++) {
        const r = size.r[0] + this.random() * (size.r[1] - size.r[0]);
        const a = this.random() * 2 * Math.PI;
        const d = Math.sqrt(inner * inner + this.random() * (outer * outer - inner * inner));
        const x = c.x + Math.cos(a) * d;
        const z = c.z + Math.sin(a) * d;
        if (!this.free(x, z, 2 * r + size.clear, 0) || this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + LAWN_FOOT)) continue;
        const h = 0.9 + this.random() * 0.5;
        const face = this.raisedLawn(x, z, r, h, Math.atan2(c.x - x, c.z - z));
        if (face === null) continue;
        const kinds = r >= 2.7 ? (['readingNook', 'gardenBed'] as const) : (['readingNook'] as const);
        this.stamp(recipe(this.pick(kinds), this.random), x, h, z, face + Math.PI, false);
        placed++;
      }
    }
  }

  /** A lawn platform on the terrace cliff with a short stone stair facing `face` or the nearest clear bearing; returns the stair's bearing, or null (nothing built) when no stair fits. */
  private raisedLawn(x: number, z: number, r: number, h: number, face: number): number | null {
    const st = this.stairRound(x, z, r, h, face, 1.8);
    if (!st) return null;
    this.reserve(x, z, r + 1.4);
    this.obstacles.push({ x, z, r: r + LAWN_FOOT });
    this.terraceSides(x, z, r, h, st.face, st.width / 2 + PIER_SIDE);
    this.layStair(st, { tread: this.p.trim, riser: this.p.trimShade, side: this.p.trimShade });
    return st.face;
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

  private addPath(s: Segment): void {
    this.paths.push(s);
    this.pathIndex.add(s);
  }

  /** Free ground: off plots, bridges, plazas, paths (by `clearPath`) and earlier things (by `gap`), inside its island (centre only on the `rim`). */
  private free(x: number, z: number, gap: number, clearPath: number, rim = false): boolean {
    return (
      this.circles.some((c) => Math.hypot(x - c.x, z - c.z) < c.radius - (rim ? 1.4 : 1.5 + gap / 2)) &&
      !this.onPlot(x, z, 1.2 + gap / 2) &&
      !this.nearBridge(x, z, DECK_HALF + 1.4 + gap / 2) &&
      this.layout.hubs.every((h, i) => Math.hypot(x - h.x, z - h.z) > (i === 0 ? PLAZA : SMALL_PLAZA) + 0.6 + gap / 2) &&
      !this.pathIndex.within(x, z, clearPath + 1.1 + gap / 2) &&
      !this.near(x, z, gap / 2)
    );
  }

  private onPlot(x: number, z: number, margin: number): boolean {
    return this.plotIndex.hits(x, z, margin);
  }

  /** Whether (x, z) is within d of a bridge line, its landing included. */
  private nearBridge(x: number, z: number, d: number): boolean {
    return this.landings.some((s) => segmentDistance(x, z, s) < d) || this.walks.some((s) => segmentDistance(x, z, s) < d);
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
    if (y > -0.5 && o.wall === undefined && !DECK.test(id) && !this.supported(id, x, y, z, height, o)) return false;
    if (!o.sway && o.wall === undefined && !DECK.test(id) && this.clashes(id, x, y, z, height, o)) return false;
    if (solid && this.stairKeep.length) {
      const f = FOOT[id]!;
      const r = o.wall ?? (o.width ? (f.r * o.width) / f.w : (f.r * height) / f.h);
      if (this.keepIndex.hits(x, z, r + KID_RADIUS) && this.stairKeep.some((b) => y < b.y + 0.6 && inBox(b, x, z, r + KID_RADIUS))) return false;
    }
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
    if (!o.sway) this.props.push({ id, ...this.span(id, x, y, z, height, o), group: this.group });
    this.district.placements.push({
      id, x, y, z, yaw, height, solid, detail: o.detail === true,
      ...(o.width ? { width: o.width } : {}),
      ...(o.sway ? { sway: true } : {}),
      ...(o.tint !== undefined ? { tint: o.tint } : {}),
      ...(o.minor ? { minor: true } : {}),
      ...(o.rich ? { rich: true } : {}),
      ...(o.roof !== undefined ? { roof: o.roof } : {}),
      ...(o.bands ? { bands: o.bands } : {}),
    });
    return true;
  }

  /**
   * Whether a model stands wholly on ground of its height: a raised level (shelf, terrace, raised lawn) above LEVEL_MIN, else an
   * island's lawn; trees by their trunk, the rest by their reach.
   */
  private supported(id: string, x: number, y: number, z: number, height: number, o: ModelOptions): boolean {
    const reach = this.span(id, x, y, z, height, o).r;
    const r = /tree/.test(id) ? Math.min(reach, TRUNK) : reach;
    if (y > LEVEL_MIN) return this.levels.some((l) => Math.abs(l.y - y) < 0.05 && l.holds(x, z, r));
    return this.circles.some((c) => Math.hypot(x - c.x, z - c.z) <= c.radius - r);
  }

  /** A model's reach circle and height span: together they enclose it, so two disjoint spans cannot cut into each other. */
  private span(id: string, x: number, y: number, z: number, height: number, o: ModelOptions): { x: number; z: number; r: number; y0: number; y1: number } {
    const f = FOOT[id]!;
    const s = o.width ? o.width / f.w : height / f.h;
    return { x, z, r: f.r * s, y0: y, y1: y + f.h * s };
  }

  /** Whether an upright model here would cut into a prop placed earlier outside the current stamp group. */
  private clashes(id: string, x: number, y: number, z: number, height: number, o: ModelOptions): boolean {
    const a = this.span(id, x, y, z, height, o);
    return this.props.some((b) => (b.group === 0 || b.group !== this.group) && !attached(id, b.id) && b.y0 < a.y1 && a.y0 < b.y1 && Math.hypot(b.x - x, b.z - z) < a.r + b.r);
  }

  private placeLandmark(lm: Landmark, x: number, y: number, z: number, face: number, scale: number): void {
    this.landmarks.push({ theme: this.theme.id, x, z, y, reach: lm.reach * scale, top: y + lm.height * scale });
    const m = new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), face), new Vector3(scale, scale, scale));
    for (const g of lm.parts) this.district.terrain.push({ geometry: g.applyMatrix4(m), solid: true, detail: false });
    for (const g of lm.glow) this.district.glow.push(g.applyMatrix4(m));
    if (lm.flag) {
      const f = new Vector3(lm.flag.x, lm.flag.y, lm.flag.z).applyMatrix4(m);
      this.life.push({ kind: 'flag', id: 'pirate/flag-pennant', x: f.x, y: f.y, z: f.z, yaw: face, height: lm.flag.h * scale });
    }
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
  private themed(c: Circle, themes: readonly Corner[], count: number): void {
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

  private vignette(theme: Corner, x: number, z: number, face: number): boolean {
    const at = (dx: number, dz: number): [number, number] => [x + dx * Math.cos(face) + dz * Math.sin(face), z - dx * Math.sin(face) + dz * Math.cos(face)];
    const accent = this.theme.accent;
    if (theme === 'park') {
      const piece = playground(Math.floor(this.random() * 3), accent, this.p.trim, this.p.wood);
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
      let stools = 0;
      for (const dx of [-0.7, 0.7]) {
        const [sx, sz] = at(dx, -1.9);
        if (this.item('town/stall-stool', sx, sz, this.random() * 6, 0.45, { detail: true, minor: true })) stools++;
      }
      const [hx, hz] = at(0, stools === 2 ? -1.9 : -2.4);
      this.hangouts.push(stools === 2 ? { kind: 'sit', x: hx, z: hz, face: face + Math.PI, seat: 0.45 } : { kind: 'sit', x: hx, z: hz, face: face + Math.PI });
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
      if (this.patches.some((p) => p.y === 0.012 && Math.hypot(p.x - x, p.z - z) < p.r + 3.1)) return false;
      if (!this.item('town/fountain-round', x, z, this.random() * 6, 0.6, { solid: true })) return false;
      this.patches.push({ x, y: 0.012, z, r: 3.1 });
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
    const [fx, fz] = at(0, -2.3);
    if (this.clashes('nature/campfire_stones', fx, 0, fz, 0.22, {})) return false;
    if (!this.item('nature/tent_smallOpen', tx, tz, face + Math.PI, 1.5, { solid: true, detail: true })) return false;
    this.model('nature/campfire_stones', fx, 0, fz, 0, 0.22, { detail: true });
    this.reserve(fx, fz, 0.8);
    this.smoke.push({ x: fx, y: 0, z: fz, kind: 'campfire' });
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

  /** Shore dressing in groups (art bible section 6): rock groups and one sheltered reed-and-lily cove on a sand crescent; a duck and a buoy offshore. */
  private shore(c: Circle): void {
    const docks = this.district.placements.filter((p) => p.id === 'pirate/structure-platform-dock');
    for (const t of this.toes) {
      const x = c.x + t.x;
      const z = c.z + t.z;
      if (this.nearBridge(x, z, DECK_HALF + t.r + 0.6) || docks.some((d) => Math.hypot(d.x - x, d.z - z) < 2 + t.r)) continue;
      this.district.terrain.push({ geometry: t.geometry.translate(c.x, 0, c.z), solid: t.r * TOE_RISE - 0.1 > ANKLE, detail: false });
    }
    this.toes = [];
    const groups = 2 + Math.floor(this.random() * 3);
    const start = this.random() * 2 * Math.PI;
    for (let g = 0; g <= groups; g++) {
      const a = start + (g / (groups + 1)) * 2 * Math.PI + (this.random() - 0.5) * 0.4;
      const x = c.x + Math.cos(a) * (c.radius + 1);
      const z = c.z + Math.sin(a) * (c.radius + 1);
      if (this.nearBridge(x, z, DECK_HALF + (g === groups ? 6 : 3)) || this.occ.hits(x, z, 0.8)) continue;
      if (g === groups) this.cove(c, a);
      else this.shoreRocks(c, a);
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

  /** Three or four rocks in a short arc at the waterline, the biggest in the middle. */
  private shoreRocks(c: Circle, a: number): void {
    const n = 3 + Math.floor(this.random() * 2);
    for (let k = 0; k < n; k++) {
      const t = k - (n - 1) / 2;
      const aa = a + (t * 1.5) / c.radius;
      const out = c.radius + 0.5 + this.random() * 0.8;
      const big = Math.abs(t) < 0.6;
      this.model(this.pick(big ? ROCKS : SHORE_ROCKS), c.x + Math.cos(aa) * out, WATER_Y - 0.25, c.z + Math.sin(aa) * out, this.random() * 6, big ? 1.4 + this.random() * 0.4 : 0.6 + this.random() * 0.4, { solid: true, ground: true, detail: true, tint: ROCK_TINT });
    }
  }

  /** A sand crescent at the waterline with reeds along it and lily pads off it. */
  private cove(c: Circle, a: number): void {
    const half = 4 / c.radius;
    // CylinderGeometry measures theta from +z towards +x, so the arc round angle `a` (from +x) starts at pi/2 - a - half.
    // Open: its top would share the island beach's plane under the cliff (z-fight).
    const sand = new CylinderGeometry(c.radius + 0.9, c.radius + 3, 0.3, 14, 1, true, Math.PI / 2 - a - half, 2 * half);
    this.terrain(sand, this.p.sand, c.x, WATER_Y + 0.12, c.z, 0, false, false);
    for (let k = 0; k < 6; k++) {
      const aa = a + (k / 5 - 0.5) * half * 1.6;
      const out = c.radius + 1.6 + this.random() * 1.2;
      this.model('nature/grass_large', c.x + Math.cos(aa) * out, WATER_Y + 0.2, c.z + Math.sin(aa) * out, this.random() * 6, 0.7 + this.random() * 0.3, { sway: true, detail: true, minor: true, tint: 0x9bc46c });
    }
    for (let k = 0; k < 4; k++) {
      const aa = a + (this.random() - 0.5) * half * 1.4;
      const out = c.radius + 4.2 + this.random() * 1.2;
      this.model(k % 2 ? 'nature/lily_large' : 'nature/lily_small', c.x + Math.cos(aa) * out, WATER_Y + 0.03, c.z + Math.sin(aa) * out, this.random() * 6, 0, { width: 0.9, detail: true, minor: true });
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
  bands?: { readonly split: number; readonly hi: number; readonly lo: number };
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

/** Ranked garden room sites of one district (`Designer.roomSites`). */
interface RoomSites {
  find(samples: readonly (readonly [number, number])[]): { x: number; z: number; face: number } | null;
}

/** The point on `walks` nearest (x, z) and its distance, or null with no walks. */
function nearestOn(walks: readonly Segment[], x: number, z: number): { x: number; z: number; d: number } | null {
  let best: { x: number; z: number; d: number } | null = null;
  for (const s of walks) {
    const lx = s.bx - s.ax;
    const lz = s.bz - s.az;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * lx + (z - s.az) * lz) / (lx * lx + lz * lz || 1)));
    const px = s.ax + lx * t;
    const pz = s.az + lz * t;
    const d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { x: px, z: pz, d };
  }
  return best;
}

/** Sample points (room-local) over a garden room's ground, hedges included, at most 0.75 m apart, outermost first. */
function roomFootprint(size: RoomSize): readonly (readonly [number, number])[] {
  const hx = size.w / 2 + HEDGE_THICK / 2;
  const hz = size.d / 2 + HEDGE_THICK / 2;
  const nx = Math.ceil((2 * hx) / 0.75);
  const nz = Math.ceil((2 * hz) / 0.75);
  const out: [number, number][] = [];
  for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) out.push([-hx + (2 * hx * i) / nx, -hz + (2 * hz * k) / nz]);
  // Rims first: a site that does not fit mostly fails at its edge.
  return out.sort((a, b) => Math.hypot(b[0] / hx, b[1] / hz) - Math.hypot(a[0] / hx, a[1] / hz));
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

/** A placed landmark's parts the kid cannot step onto (over CLIMB high, below head height), as boxes in its own frame. */
interface LandmarkSolid {
  readonly toLocal: Matrix4;
  readonly scale: number;
  readonly boxes: readonly Box3[];
}

/** The solid parts of landmark `lm` placed at (x, y, z) facing `face`, scaled by `scale`. */
function landmarkSolid(lm: Landmark, x: number, y: number, z: number, face: number, scale: number): LandmarkSolid {
  const m = new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), face), new Vector3(scale, scale, scale));
  const boxes = lm.parts.map((g) => {
    g.computeBoundingBox();
    return g.boundingBox!.clone();
  });
  return { toLocal: m.invert(), scale, boxes: boxes.filter((b) => b.max.y * scale > CLIMB && b.min.y * scale < KID_HEIGHT) };
}

/** Whether a kid `r` wide standing at (x, z) on the landmark's level touches its solid parts. */
function blocks(f: LandmarkSolid, x: number, z: number, r: number): boolean {
  const p = new Vector3(x, 0, z).applyMatrix4(f.toLocal);
  const pad = r / f.scale;
  return f.boxes.some((b) => p.x > b.min.x - pad && p.x < b.max.x + pad && p.z > b.min.z - pad && p.z < b.max.z + pad);
}
