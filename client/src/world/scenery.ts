import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, Sphere, Vector3, type Material, type Object3D } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { District, Dressing } from './dressing';
import type { ModelLibrary } from './model-library';
import { sharedPrep, type DistrictPrepper } from './build-worker';
import type { WeldedMesh } from './chunk-weld';
import { prepDistrict, withSway, type PrepInput, type Prepped } from './district-prep';

/** Distance past which a district drops its detail (flowers, bushes, hedges, lamps, small props) per tier. */
export const DETAIL_DISTANCE = { low: 20, medium: 70, high: 90, xhigh: 130 } as const;
/** Distance past which a district drops its minor dressing (grass tufts, pebbles, rich extras) per tier. */
export const MINOR_DISTANCE = { low: 0, medium: 25, high: 40, xhigh: 70 } as const;

/** Which optional dressing a tier shows: `minor` (all but low) and `rich` (xhigh only); `detailShadows` lets detail cast shadows. */
export interface DressingLevel {
  readonly minor: boolean;
  readonly rich: boolean;
  readonly detailShadows?: boolean;
  /** Keep the detail dressing at all (default true; a far-view capture leaves it out). */
  readonly detail?: boolean;
  /** Edge distance (metres) within which the minor dressing shows. */
  readonly minorDistance?: number;
}

/**
 * One district's dressing, built in slices (`step`) and freed again (`unload`): a group with the big shapes, a detail
 * group and a minor group over the shared scenery material, plus the world-space solid triangles for collision. Placement,
 * merge and the collision BVH run in the build worker (`district-prep.ts`); inline, one model per slice, where there is no
 * worker or on `finish`.
 */
export class DistrictBuild<C = unknown> {
  /** Always in the scene; empty until built. */
  readonly group = new Group();
  /** `collide` over the positions of everything solid (bridge decks and rails, buildings, trees, hedges, lamps, terraces). */
  collider: C | null = null;
  /** World box of the solids; empty until built. */
  readonly bounds = new Box3();
  private work: Generator<void, void> | null = null;
  private built = false;
  private inline = false;
  private waiting = false;
  private job = 0;

  constructor(
    readonly district: District,
    private readonly lib: ModelLibrary,
    private readonly material: Material,
    detailDistance: number,
    private readonly level: DressingLevel,
    /** Turns the solid triangles into a collider; the geometry carries a ready `boundsTree`. Null: no solids (a far-view capture). */
    private readonly collide: ((solids: BufferGeometry) => C) | null,
    private readonly worker: DistrictPrepper | null = sharedPrep(),
  ) {
    const d = district.island;
    this.group.name = 'district';
    this.group.userData = { x: d.x, z: d.z, radius: d.radius, detail: detailDistance, minor: level.minorDistance ?? detailDistance };
  }

  get isBuilt(): boolean {
    return this.built;
  }

  /** True while the build worker prepares the district. */
  get busy(): boolean {
    return this.waiting;
  }

  /** Runs the next slice; true once the district is complete. */
  step(): boolean {
    if (this.built) return true;
    this.work ??= this.slices();
    this.built = this.work.next().done === true;
    if (this.built) {
      this.work = null;
      this.inline = false;
    }
    return this.built;
  }

  /** Builds every remaining slice now, inline: a build waiting on the worker builds its tree itself (the reply cannot arrive meanwhile). */
  finish(): void {
    if (this.built) return;
    this.inline = true;
    this.waiting = false;
    this.job++;
    while (!this.step());
  }

  /** Frees the meshes and solids; the district can be built again later. */
  unload(): void {
    this.work = null;
    this.built = false;
    this.waiting = false;
    this.job++;
    for (const child of [...this.group.children]) {
      child.traverse((o) => (o as Mesh).geometry?.dispose());
      child.removeFromParent();
    }
    this.collider = null;
    this.bounds.makeEmpty();
  }

  private *slices(): Generator<void, void> {
    const d = this.district;
    const level = this.level;
    const input: PrepInput = { terrain: d.terrain, placements: d.placements, blockers: d.blockers, minor: level.minor, rich: level.rich, solids: this.collide !== null, detail: level.detail !== false };
    let prepped: Prepped | null = null;
    if (this.worker && !this.inline) {
      // Placement, merge and the collision BVH run in the build worker; the slices wait for it without blocking a frame.
      // A failed worker or a `finish` meanwhile prepares it here.
      let failed = false;
      const job = ++this.job;
      this.waiting = true;
      const settle = () => {
        if (this.job === job) this.waiting = false;
      };
      this.worker.prep(input, this.lib).then(
        (r) => {
          if (this.job !== job) return;
          prepped = r;
          settle();
        },
        () => {
          failed = true;
          settle();
        },
      );
      while (!prepped && !failed && !this.inline) yield;
    }
    prepped ??= yield* prepDistrict(input, this.lib);
    const { meshes: merged, spheres, tree } = prepped as Prepped;
    // Meshes come in chunks of at most CHUNK_VERTICES: each is one short GPU upload with its culling sphere from the prep;
    // the group takes them all at once, so `cullDistricts` never sees a half-built district.
    const parts: Mesh[][] = [[], [], []];
    for (let k = 0; k < 3; k++) {
      const sphere = spheres[k]!;
      chunks(merged[k] ?? null).forEach((g, c) => {
        const m = mesh(g, this.material);
        if (k === 1) m.castShadow = level.detailShadows !== false;
        // Minor and rich dressing is too small to need a shadow.
        if (k === 2) m.castShadow = false;
        g.boundingSphere = new Sphere(new Vector3(sphere[c * 4], sphere[c * 4 + 1], sphere[c * 4 + 2]), sphere[c * 4 + 3]);
        parts[k]!.push(m);
      });
    }
    // The big shapes always, the detail group only within `detailDistance`, the minor one within its range (see `cullDistricts`).
    const near = new Group();
    near.name = 'detail';
    if (parts[1]!.length) near.add(...parts[1]!);
    const minor = new Group();
    minor.name = 'minor';
    if (parts[2]!.length) minor.add(...parts[2]!);
    if (parts[0]!.length) this.group.add(...parts[0]!);
    this.group.add(near, minor);
    this.group.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
    this.group.userData['tris'] = merged.map((m) => (m ? m.index.length / 3 : 0));
    if (tree && this.collide) {
      const t = tree;
      const solids = new BufferGeometry();
      solids.setAttribute('position', new BufferAttribute(t.position, 3));
      const bvh = MeshBVH.deserialize(t.bvh, solids, { setIndex: true });
      solids.boundsTree = bvh;
      bvh.getBoundingBox(this.bounds);
      this.collider = this.collide(solids);
    }
  }
}

/** Each district's lamp glow as one small mesh (built up front, island order; empty groups where a district has none). */
export function buildGlow(dressing: Dressing, glow: Material): Group {
  const group = new Group();
  group.name = 'glow';
  for (const d of dressing.districts) {
    const glows = d.glow.map((g) => withSway(g, false, 1));
    const lamps = glows.length ? mergeGeometries(glows, false) : null;
    const holder = new Group();
    if (lamps) {
      const m = new Mesh(lamps, glow);
      m.name = 'glow';
      m.matrixAutoUpdate = false;
      holder.add(m);
    }
    group.add(holder);
  }
  return group;
}

let edges = new Float64Array(64);

/**
 * Shows districts within `distance` of (x, z), their detail and minor dressing within each one's ranges; every district when
 * `all`. Nearest first, a district only shows while the scenery stays within `budget` triangles (its base alone when the
 * detail does not fit): big courses drop their farthest districts instead of the frame rate.
 */
export function cullDistricts(districts: readonly Object3D[], x: number, z: number, distance: number, all: boolean, budget = Infinity): void {
  if (edges.length < districts.length) edges = new Float64Array(districts.length * 2);
  for (let i = 0; i < districts.length; i++) {
    const d = districts[i]!;
    const u = d.userData as { x: number; z: number; radius: number };
    const dx = u.x - x;
    const dz = u.z - z;
    edges[i] = d.children.length < 2 ? Infinity : Math.sqrt(dx * dx + dz * dz) - u.radius;
  }
  let used = 0;
  for (let k = 0; k < districts.length; k++) {
    let i = -1;
    for (let j = 0; j < districts.length; j++) if (edges[j]! < Infinity && (i < 0 || edges[j]! < edges[i]!)) i = j;
    if (i < 0) break;
    const edge = edges[i]!;
    edges[i] = Infinity;
    const d = districts[i]!;
    const u = d.userData as { detail: number; minor: number; tris: readonly number[] };
    const n = d.children.length;
    const near = edge < u.detail;
    const close = edge < u.minor;
    const full = u.tris[0]! + (near ? u.tris[1]! : 0) + (close ? u.tris[2]! : 0);
    const fits = all || used + full <= budget;
    const baseFits = fits || used + u.tris[0]! <= budget;
    d.visible = all || (edge < distance && baseFits);
    d.children[n - 2]!.visible = near && fits;
    d.children[n - 1]!.visible = close && fits;
    if (d.visible) used += fits ? full : u.tris[0]!;
  }
}

/** Own-built coloured geometry prepared for the scenery material (things that move). */
export function sceneryGeometry(g: BufferGeometry): BufferGeometry {
  return withSway(g, false, 1);
}

/** A model as its own mesh (for things that move), scaled and coloured like the static ones. */
export function singleModel(lib: ModelLibrary, id: string, height: number): BufferGeometry {
  const m = lib.get(id);
  const g = m.geometry.clone();
  g.scale(height / m.height, height / m.height, height / m.height);
  return withSway(g, false, 1);
}



function dropArray(this: BufferAttribute): void {
  (this as { array: unknown }).array = null;
}

/** A welded mesh as one indexed geometry per chunk (views into the merged arrays, no copies). */
function chunks(m: WeldedMesh | null): BufferGeometry[] {
  if (!m) return [];
  const out: BufferGeometry[] = [];
  for (let c = 0; c < m.chunks.length; c += 4) {
    const a = m.chunks[c]!;
    const b = a + m.chunks[c + 1]!;
    const i = m.chunks[c + 2]!;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(m.position.subarray(a * 3, b * 3), 3));
    g.setAttribute('normal', new BufferAttribute(m.normal.subarray(a * 3, b * 3), 3));
    g.setAttribute('color', new BufferAttribute(m.color.subarray(a * m.colorSize, b * m.colorSize), m.colorSize));
    g.setAttribute('sway', new BufferAttribute(m.sway.subarray(a, b), 1));
    if (m.surface) g.setAttribute('surface', new BufferAttribute(m.surface.subarray(a, b), 1));
    g.setIndex(new BufferAttribute(m.index.subarray(i, i + m.chunks[c + 3]!), 1));
    // Once on the GPU the chunk's vertex arrays are not read again (culling uses the prep's sphere): the heap lets them go.
    // The index (2 bytes per drawn vertex) stays: it uploads at the first draw and tools read its size.
    for (const attr of Object.values(g.attributes)) (attr as BufferAttribute).onUpload(dropArray);
    out.push(g);
  }
  return out;
}


function mesh(g: BufferGeometry, material: Material): Mesh {
  const m = new Mesh(g, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}





