import { BufferAttribute, BufferGeometry, Color, Group, LOD, Matrix4, Mesh, Quaternion, Vector3, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { District, Dressing, Placement } from './dressing';
import type { ModelLibrary } from './model-library';
import { tagSurface } from './surfaces';

/** Distance past which a district drops its detail (flowers, bushes, hedges, lamps, small props) per tier. */
export const DETAIL_DISTANCE = { low: 45, medium: 70, high: 90, xhigh: 130 } as const;

/** Built dressing: one LOD per district (near = everything, far = the big shapes), one glow mesh, and the solid triangles. */
export interface SceneryBuild {
  readonly group: Group;
  /** World-space positions of everything solid (bridge decks and rails, buildings, trees, hedges, lamps, terraces). */
  readonly collision: BufferGeometry;
}

/** Turns the designer's dressing into merged, vertex-coloured meshes over one shared material. */
/** Which optional dressing a tier shows: `minor` (all but low) and `rich` (xhigh only). */
export interface DressingLevel {
  readonly minor: boolean;
  readonly rich: boolean;
}

export function buildScenery(dressing: Dressing, lib: ModelLibrary, solid: Material, glow: Material, detailDistance: number, level: DressingLevel = { minor: true, rich: false }): SceneryBuild {
  const group = new Group();
  group.name = 'scenery';
  const collision: BufferGeometry[] = [];
  for (const d of dressing.districts) {
    const parts = placed(d, lib, level);
    const near = merge(parts.filter((p) => !p.small).map((p) => p.g));
    const small = merge(parts.filter((p) => p.small).map((p) => p.g));
    const far = merge(parts.filter((p) => !p.detail).map((p) => p.g));
    for (const p of parts) if (p.solid) collision.push(positionsOnly(p.g));
    for (const b of d.blockers) collision.push(positionsOnly(b.index ? b.toNonIndexed() : b));
    if (!near) continue;
    const lod = new LOD();
    lod.name = 'district';
    const close = new Group();
    close.add(mesh(near, solid));
    if (small) {
      // Minor and rich dressing is too small to need a shadow: one shadowless mesh.
      const m = mesh(small, solid);
      m.castShadow = false;
      close.add(m);
    }
    lod.addLevel(close, 0);
    if (far) lod.addLevel(mesh(far, solid), detailDistance + d.island.radius);
    lod.position.set(d.island.x, 0, d.island.z);
    lod.updateMatrix();
    lod.matrixAutoUpdate = false;
    for (const level of lod.levels) level.object.position.set(-d.island.x, 0, -d.island.z);
    group.add(lod);
  }
  const glows = dressing.districts.flatMap((d) => d.glow.map((g) => withSway(g, false, 1)));
  const lamps = glows.length ? mergeGeometries(glows, false) : null;
  if (lamps) {
    const m = new Mesh(lamps, glow);
    m.name = 'glow';
    m.matrixAutoUpdate = false;
    group.add(m);
  }
  const merged = mergeGeometries(collision, false);
  if (!merged) throw new Error('mooblox: no solid scenery');
  return { group, collision: merged };
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

function placed(d: District, lib: ModelLibrary, level: DressingLevel): Part[] {
  const parts: Part[] = d.terrain.map((t) => ({ g: tagSurface(withSway(t.geometry, false, 1), ''), solid: t.solid, detail: t.detail, small: false }));
  for (const p of d.placements) {
    if ((p.minor && !level.minor) || (p.rich && !level.rich)) continue;
    parts.push({ g: tagSurface(placeModel(p, lib), p.id), solid: p.solid, detail: p.detail, small: p.minor === true || p.rich === true });
  }
  return parts;
}

function placeModel(p: Placement, lib: ModelLibrary): BufferGeometry {
  const m = lib.get(p.id);
  const s = p.width ? p.width / m.width : p.height / m.height;
  const g = m.geometry.clone();
  if (p.tint !== undefined) tint(g, p.tint);
  if (p.roof !== undefined) repaintRoof(g, p.roof);
  g.applyMatrix4(new Matrix4().compose(new Vector3(p.x, p.y, p.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw), new Vector3(s, s, s)));
  return withSway(g, p.sway === true, p.height, p.y);
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

function tint(g: BufferGeometry, hex: number): void {
  const c = new Color(hex);
  const col = g.getAttribute('color');
  for (let i = 0; i < col.count; i++) {
    col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
  }
}
