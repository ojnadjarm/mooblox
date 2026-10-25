import { Color } from 'three';
import { familyOf, fits, type Family } from './kit-materials';
import type { Placement } from './dressing';
import { prepDistrict, runPrep, type ModelSource } from './district-prep';
import type { BakedModel } from './model-library';
import { drawnLayer, type SurfaceId } from './surfaces';

/** Mesh arrays as the GPU gets them (a baked model, or a prepped district mesh); `index` null = non-indexed. */
export interface AuditMesh {
  readonly color: ArrayLike<number>;
  readonly colorSize?: number;
  readonly normal: ArrayLike<number>;
  readonly surface: ArrayLike<number> | null;
  readonly index: ArrayLike<number> | null;
}

/** Triangles of one model that share a source material, a family and the atlas layer they draw with. */
export interface AuditPart {
  readonly material: string;
  readonly family: Family | null;
  readonly layer: SurfaceId;
  readonly tris: number;
  /** A drawn colour of the part (sRGB hex). */
  readonly colour: string;
  /** The layer is one the family may show (false also for a part no kind covers). */
  readonly ok: boolean;
}

/** Per triangle of a baked kit model: its family and source material, read at the provoking (last) vertex as the flat layer is. */
export function triangleFamilies(id: string, model: BakedModel, materials: readonly string[]): { family: Family | null; material: string }[] {
  const col = model.geometry.getAttribute('color');
  const out: { family: Family | null; material: string }[] = [];
  for (let v = 2; v < col.count; v += 3) out.push({ family: familyOf(id, materials[v] ?? '', col.getX(v), col.getY(v), col.getZ(v)), material: materials[v] ?? '' });
  return out;
}

const hex = new Color();

/** The parts of one drawn mesh whose triangles follow `families` in order: the layer each triangle draws with, grouped. */
export function auditMesh(families: readonly { family: Family | null; material: string }[], mesh: AuditMesh): AuditPart[] {
  const cs = mesh.colorSize ?? 3;
  const parts = new Map<string, { material: string; family: Family | null; layer: SurfaceId; tris: number; colour: string }>();
  const tris = (mesh.index ? mesh.index.length : mesh.normal.length / 3) / 3;
  if (tris !== families.length) throw new Error(`mooblox: audit expects ${families.length} triangles, the mesh has ${tris}`);
  for (let t = 0; t < tris; t++) {
    const v = mesh.index ? mesh.index[t * 3 + 2]! : t * 3 + 2;
    const r = mesh.color[v * cs]!, g = mesh.color[v * cs + 1]!, b = mesh.color[v * cs + 2]!;
    const layer = drawnLayer(mesh.surface ? mesh.surface[v]! : 0, r, g, b, mesh.normal[v * 3 + 1]!);
    const { family, material } = families[t]!;
    const key = `${material}|${family}|${layer}`;
    const p = parts.get(key);
    if (p) p.tris++;
    else parts.set(key, { material, family, layer, tris: 1, colour: `#${hex.setRGB(r, g, b).getHexString()}` });
  }
  return [...parts.values()].map((p) => ({ ...p, ok: p.family !== null && fits(p.family, p.layer) }));
}

/** A baked kit model as an audit mesh (no placement: as the kit ships it). */
export function modelMesh(model: BakedModel): AuditMesh {
  const g = model.geometry;
  return { color: g.getAttribute('color').array, normal: g.getAttribute('normal').array, surface: g.getAttribute('surface')?.array ?? null, index: null };
}

/** One placement of each look a model is placed with (model, tint, roof and bands colours), in first-seen order. */
export function placementVariants(placements: readonly Placement[]): Placement[] {
  const seen = new Map<string, Placement>();
  for (const p of placements) {
    const key = `${p.id}|${p.tint}|${p.roof}|${p.bands?.hi}|${p.bands?.lo}`;
    if (!seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()];
}

/** A placement prepped alone as a district is (tint, roof, bands, AO, rich-tier tags, weld), audited per drawn triangle. */
export function auditPlacement(p: Placement, lib: ModelSource, families: readonly { family: Family | null; material: string }[], rich: boolean): AuditPart[] {
  const prepped = runPrep(prepDistrict({ terrain: [], placements: [p], blockers: [], minor: true, rich, solids: false, detail: true }, lib));
  const mesh = prepped.meshes.find((m) => m !== null);
  if (!mesh) return [];
  if (mesh.chunks.length !== 4) throw new Error(`mooblox: ${p.id} spans ${mesh.chunks.length / 4} chunks`);
  return auditMesh(families, mesh);
}
