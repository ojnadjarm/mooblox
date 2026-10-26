import { BufferAttribute, Color, Matrix4, Quaternion, Vector3, type BufferGeometry, type InterleavedBufferAttribute } from 'three';
import type { Placement, TerrainPart } from './dressing';
import type { BakedModel } from './model-library';
import { hangingCloth } from './flag-cloth';
import { bakeAo } from './landmarks/shapes';
import { aimRipples } from './water-motion';
import { tagSurface } from './surfaces';
import { MeshMerge, SolidsMerge, solidsTree, transferables, type MeshArrays, type PartArrays, type SolidsTree } from './district-merge';
import { weldChunks, type WeldedMesh } from './chunk-weld';

/** Where placed models come from: the page's `ModelLibrary`, or its copy in the build worker. */
export interface ModelSource {
  get(id: string): BakedModel;
}

/** What one district's dressing is prepared from (pure data: the same on the main thread and in the build worker). */
export interface PrepInput {
  readonly terrain: readonly TerrainPart[];
  readonly placements: readonly Placement[];
  readonly blockers: readonly BufferGeometry[];
  /** Keep the minor dressing (all tiers but low). */
  readonly minor: boolean;
  /** Keep the rich dressing and tag surfaces (xhigh). */
  readonly rich: boolean;
  /** Gather the solids and build their collision BVH (false for a far-view capture). */
  readonly solids: boolean;
  /** Keep the detail dressing (false for a far-view capture: too small to read in its tile). */
  readonly detail: boolean;
}

/** A district's merged meshes (big shapes, detail, minor; welded per chunk), each chunk's bounding sphere and the collision tree. */
export interface Prepped {
  readonly meshes: readonly (WeldedMesh | null)[];
  /** Per mesh: x, y, z, radius of each CHUNK_VERTICES chunk. */
  readonly spheres: readonly Float32Array[];
  readonly tree: SolidsTree | null;
}

/** Vertices per district mesh chunk: about 1 MB of vertex data, one short upload. */
export const CHUNK_VERTICES = 3 * 8192;

/**
 * Places, colours and merges a district's dressing and builds its collision BVH: one yield per placed part, so the main
 * thread can run it in frame slices; the build worker runs it straight through.
 */
export function* prepDistrict(input: PrepInput, lib: ModelSource): Generator<void, Prepped> {
  const tag = (g: BufferGeometry, id: string) => (input.rich && !g.getAttribute('surface') ? tagSurface(g, id) : g);
  // Each part is appended to its mesh as it is placed: no merge pass, nothing big left for one slice.
  const meshes = [new MeshMerge(), new MeshMerge(), new MeshMerge()];
  const solid = new SolidsMerge();
  const add = (g: BufferGeometry, mesh: number, isSolid: boolean) => {
    const p = partArrays(g);
    meshes[mesh]!.add(p);
    if (isSolid && input.solids) solid.add(p.position);
  };
  const detail = input.detail;
  for (const t of input.terrain) {
    if (t.detail && !detail) continue;
    add(tag(withSway(t.geometry, false, 1), ''), t.detail ? 1 : 0, t.solid);
    yield;
  }
  for (const p of input.placements) {
    if ((p.minor && !input.minor) || (p.rich && !input.rich) || (p.detail && !detail)) continue;
    add(tag(placeModel(p, lib), p.id), p.minor || p.rich ? 2 : p.detail ? 1 : 0, p.solid);
    yield;
  }
  if (input.solids) for (const b of input.blockers) solid.add(floats((b.index ? b.toNonIndexed() : b).getAttribute('position')));
  const position = solid.finish();
  if (position) yield;
  const merged = meshes.map((m) => m.finish());
  yield;
  const spheres = merged.map(chunkSpheres);
  const welded: (WeldedMesh | null)[] = [];
  for (const m of merged) welded.push(m ? yield* weldChunks(m, CHUNK_VERTICES) : null);
  return { meshes: welded, spheres, tree: position ? solidsTree(position) : null };
}

/** The bounding sphere (centre of the box, farthest vertex) of each CHUNK_VERTICES chunk of a merged mesh. */
function chunkSpheres(m: MeshArrays | null): Float32Array {
  if (!m) return new Float32Array(0);
  const p = m.position;
  const n = p.length / 3;
  const out = new Float32Array(Math.ceil(n / CHUNK_VERTICES) * 4);
  for (let a = 0, k = 0; a < n; a += CHUNK_VERTICES, k += 4) {
    const b = Math.min(n, a + CHUNK_VERTICES);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = a * 3; i < b * 3; i += 3) {
      x0 = Math.min(x0, p[i]!);
      x1 = Math.max(x1, p[i]!);
      y0 = Math.min(y0, p[i + 1]!);
      y1 = Math.max(y1, p[i + 1]!);
      z0 = Math.min(z0, p[i + 2]!);
      z1 = Math.max(z1, p[i + 2]!);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    let r2 = 0;
    for (let i = a * 3; i < b * 3; i += 3) r2 = Math.max(r2, (p[i]! - cx) ** 2 + (p[i + 1]! - cy) ** 2 + (p[i + 2]! - cz) ** 2);
    out.set([cx, cy, cz, Math.sqrt(r2)], k);
  }
  return out;
}

/** Runs a prep to the end (the build worker, or a build that must finish now). */
export function runPrep(work: Generator<void, Prepped>): Prepped {
  for (;;) {
    const r = work.next();
    if (r.done) return r.value;
  }
}

/** Every buffer of a prep result, for a zero-copy transfer. */
export function preppedTransferables(p: Prepped): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>(p.tree ? transferables(p.tree) : []);
  for (const a of p.spheres) out.add(a.buffer as ArrayBuffer);
  for (const m of p.meshes) {
    if (!m) continue;
    for (const a of [m.position, m.normal, m.color, m.sway, m.surface, m.index, m.chunks]) if (a) out.add(a.buffer as ArrayBuffer);
  }
  return [...out];
}

/** Keeps position, normal, colour and a builder's surface ids only, plus a `sway` weight that grows with height above the base (else a builder's own `sway` codes, `water-motion.ts`). */
export function withSway(g: BufferGeometry, sway: boolean, height: number, baseY = 0): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  const own = !sway && flat.getAttribute('sway');
  for (const name of Object.keys(flat.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color' && name !== 'surface' && !(own && name === 'sway')) flat.deleteAttribute(name);
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
  if (own) return flat;
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

/** A placed part as plain arrays for its mesh merge. */
function partArrays(g: BufferGeometry): PartArrays {
  const color = g.getAttribute('color');
  const surface = g.getAttribute('surface');
  return {
    position: floats(g.getAttribute('position')),
    normal: floats(g.getAttribute('normal')),
    color: floats(color),
    colorSize: color.itemSize,
    sway: floats(g.getAttribute('sway')),
    surface: surface ? floats(surface) : null,
  };
}

/** An attribute's values as a Float32Array (as is when it already is one; converted when normalized, interleaved or not float). */
export function floats(a: BufferAttribute | InterleavedBufferAttribute): Float32Array {
  const arr = (a as BufferAttribute).array;
  if (!(a as InterleavedBufferAttribute).isInterleavedBufferAttribute && arr instanceof Float32Array && !a.normalized && arr.length === a.count * a.itemSize) return arr;
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
  return out;
}

function placeModel(p: Placement, lib: ModelSource): BufferGeometry {
  const m = lib.get(p.id);
  const s = p.width ? p.width / m.width : p.height / m.height;
  const g = m.geometry.clone();
  if (p.tint !== undefined) tint(g, p.tint);
  if (p.roof !== undefined) repaintRoof(g, p.roof);
  g.applyMatrix4(new Matrix4().compose(new Vector3(p.x, p.y, p.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw), new Vector3(s, s, s)));
  if (p.bands) repaintBands(g, p.bands);
  const out = withSway(g, p.sway === true, p.height, p.y);
  if (/fountain/.test(p.id)) aimRipples(out, p.x, p.z, 1);
  else if (/banner/.test(p.id)) hangingCloth(out);
  return p.solid && p.y > -1 ? bakeAo(out, p.y, p.height > 0 ? Math.min(1.2, Math.max(0.3, p.height * 0.5)) : 0.6, 0.24) : out;
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
