import { Box3, BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, Quaternion, Vector3, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { District, Dressing, Placement } from './dressing';
import type { ModelLibrary } from './model-library';
import { bakeAo } from './landmarks/shapes';
import { tagSurface } from './surfaces';

/** Distance past which a district drops its detail (flowers, bushes, hedges, lamps, small props) per tier. */
export const DETAIL_DISTANCE = { low: 20, medium: 70, high: 90, xhigh: 130 } as const;
/** Distance past which a district drops its minor dressing (grass tufts, pebbles, rich extras) per tier. */
export const MINOR_DISTANCE = { low: 0, medium: 25, high: 40, xhigh: 70 } as const;

/** Which optional dressing a tier shows: `minor` (all but low) and `rich` (xhigh only); `detailShadows` lets detail cast shadows. */
export interface DressingLevel {
  readonly minor: boolean;
  readonly rich: boolean;
  readonly detailShadows?: boolean;
  /** Edge distance (metres) within which the minor dressing shows. */
  readonly minorDistance?: number;
}

/** Placements turned into geometry per build slice (keeps one slice to a few milliseconds on slow CPUs). */
const PARTS_PER_SLICE = 24;

/**
 * One district's dressing, built in slices (`step`) and freed again (`unload`): a group with the big shapes, a detail
 * group and a minor group over the shared scenery material, plus the world-space solid triangles for collision.
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

  constructor(
    readonly district: District,
    private readonly lib: ModelLibrary,
    private readonly material: Material,
    detailDistance: number,
    private readonly level: DressingLevel,
    /** Turns the solid triangles into a collider (its own build slice). */
    private readonly collide: (solids: BufferGeometry) => C,
  ) {
    const d = district.island;
    this.group.name = 'district';
    this.group.userData = { x: d.x, z: d.z, radius: d.radius, detail: detailDistance, minor: level.minorDistance ?? detailDistance };
  }

  get isBuilt(): boolean {
    return this.built;
  }

  /** Runs the next slice; true once the district is complete. */
  step(): boolean {
    if (this.built) return true;
    this.work ??= this.slices();
    this.built = this.work.next().done === true;
    if (this.built) this.work = null;
    return this.built;
  }

  /** Builds every remaining slice now. */
  finish(): void {
    while (!this.step());
  }

  /** Frees the meshes and solids; the district can be built again later. */
  unload(): void {
    this.work = null;
    this.built = false;
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
    const tag = (g: BufferGeometry, id: string) => (level.rich ? tagSurface(g, id) : g);
    const parts: Part[] = d.terrain.map((t) => ({ g: tag(withSway(t.geometry, false, 1), ''), solid: t.solid, detail: t.detail, small: false }));
    let n = 0;
    for (const p of d.placements) {
      if ((p.minor && !level.minor) || (p.rich && !level.rich)) continue;
      parts.push({ g: tag(placeModel(p, this.lib), p.id), solid: p.solid, detail: p.detail, small: p.minor === true || p.rich === true });
      if (++n % PARTS_PER_SLICE === 0) yield;
    }
    const base = merge(parts.filter((p) => !p.small && !p.detail).map((p) => p.g));
    yield;
    const detail = merge(parts.filter((p) => !p.small && p.detail).map((p) => p.g));
    const small = merge(parts.filter((p) => p.small).map((p) => p.g));
    yield;
    const solid = parts.filter((p) => p.solid).map((p) => positionsOnly(p.g));
    for (const b of d.blockers) solid.push(positionsOnly(b.index ? b.toNonIndexed() : b));
    const solids = solid.length ? mergeGeometries(solid, false) : null;
    // The big shapes always, the detail group only within `detailDistance`, the minor one within its range (see `cullDistricts`).
    if (base) this.group.add(mesh(base, this.material));
    const near = new Group();
    near.name = 'detail';
    if (detail) {
      const m = mesh(detail, this.material);
      m.castShadow = level.detailShadows !== false;
      near.add(m);
    }
    this.group.add(near);
    const minor = new Group();
    minor.name = 'minor';
    if (small) {
      // Minor and rich dressing is too small to need a shadow: one shadowless mesh.
      const m = mesh(small, this.material);
      m.castShadow = false;
      minor.add(m);
    }
    this.group.add(minor);
    this.group.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
    this.group.userData['tris'] = [triangles(base), triangles(detail), triangles(small)];
    if (solids) {
      yield;
      solids.computeBoundingBox();
      this.bounds.copy(solids.boundingBox!);
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

interface Part {
  readonly g: BufferGeometry;
  readonly solid: boolean;
  readonly detail: boolean;
  readonly small: boolean;
}

function placeModel(p: Placement, lib: ModelLibrary): BufferGeometry {
  const m = lib.get(p.id);
  const s = p.width ? p.width / m.width : p.height / m.height;
  const g = m.geometry.clone();
  if (p.tint !== undefined) tint(g, p.tint);
  if (p.roof !== undefined) repaintRoof(g, p.roof);
  g.applyMatrix4(new Matrix4().compose(new Vector3(p.x, p.y, p.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw), new Vector3(s, s, s)));
  if (p.bands) repaintBands(g, p.bands);
  const out = withSway(g, p.sway === true, p.height, p.y);
  return p.solid && p.y > -1 ? bakeAo(out, p.y, p.height > 0 ? Math.min(1.2, Math.max(0.3, p.height * 0.5)) : 0.6, 0.24) : out;
}

function triangles(g: BufferGeometry | null): number {
  return g ? (g.index ? g.index.count : g.getAttribute('position').count) / 3 : 0;
}

function merge(parts: BufferGeometry[]): BufferGeometry | null {
  return parts.length ? mergeGeometries(parts, false) : null;
}

function mesh(g: BufferGeometry, material: Material): Mesh {
  const m = new Mesh(g, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function positionsOnly(g: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry();
  out.setAttribute('position', g.getAttribute('position'));
  return out;
}

/** Keeps position, normal and colour only, plus a `sway` weight that grows with height above the base. */
function withSway(g: BufferGeometry, sway: boolean, height: number, baseY = 0): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(flat.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color') flat.deleteAttribute(name);
  }
  if (!flat.getAttribute('normal')) flat.computeVertexNormals();
  const nrm = flat.getAttribute('normal');
  for (let i = 0; i < nrm.count; i++) {
    // Degenerate triangles get zero normals, which shade as NaN and bloom over the whole frame.
    if (nrm.getX(i) === 0 && nrm.getY(i) === 0 && nrm.getZ(i) === 0) nrm.setXYZ(i, 0, 1, 0);
  }
  const pos = flat.getAttribute('position');
  if (!flat.getAttribute('color')) {
    flat.setAttribute('color', new BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
  }
  const w = new Float32Array(pos.count);
  if (sway) {
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, (pos.getY(i) - baseY) / height);
      w[i] = t * t * Math.min(1.5, height / 3);
    }
  }
  flat.setAttribute('sway', new BufferAttribute(w, 1));
  return flat;
}

/** Recolours the strongly green faces (the kit's roofs) keeping their shading. */
function repaintRoof(g: BufferGeometry, hex: number): void {
  const c = new Color(hex);
  const col = g.getAttribute('color');
  for (let i = 0; i < col.count; i++) {
    const r = col.getX(i);
    const gr = col.getY(i);
    const b = col.getZ(i);
    if (gr > r * 1.25 && gr > b * 1.1) {
      const l = gr / 0.55;
      col.setXYZ(i, c.r * l, c.g * l, c.b * l);
    }
  }
}

const bandColour = new Color();

/** Two horizontal colour bands split at world y, keeping each vertex's shading (its brightness against the model's). */
function repaintBands(g: BufferGeometry, b: NonNullable<Placement['bands']>): void {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  if (!col) return;
  for (let i = 0; i < col.count; i++) {
    const lum = Math.min(1.15, Math.max(0.7, (col.getX(i) + col.getY(i) + col.getZ(i)) / 3 / 0.62));
    bandColour.set(pos.getY(i) > b.split ? b.hi : b.lo);
    col.setXYZ(i, bandColour.r * lum, bandColour.g * lum, bandColour.b * lum);
  }
}

function tint(g: BufferGeometry, hex: number): void {
  const c = new Color(hex);
  const col = g.getAttribute('color');
  for (let i = 0; i < col.count; i++) {
    col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
  }
}
