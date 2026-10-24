import type { WorkerRequest } from './build-worker';
import { prepDistrict, preppedTransferables, runPrep, type ModelSource, type Prepped } from './district-prep';
import type { BakedModel } from './model-library';
import { unpackGeometry } from './geometry-pack';

/** Build worker: places, merges and builds the collision BVH of a district's dressing off the main thread. */
const models = new Map<string, BakedModel>();
const lib: ModelSource = {
  get(id) {
    const m = models.get(id);
    if (!m) throw new Error(`mooblox: build worker has no model ${id}`);
    return m;
  },
};

/** The result with every mesh array copied to its own exact-size buffer (the merges grow theirs by doubling). */
function trimmed(p: Prepped): Prepped {
  const fit = (a: Float32Array) => (a.byteLength === a.buffer.byteLength ? a : a.slice());
  const meshes = p.meshes.map((m) => m && { ...m, position: fit(m.position), normal: fit(m.normal), color: fit(m.color), sway: fit(m.sway), surface: m.surface && fit(m.surface) });
  return { ...p, meshes, tree: p.tree && { ...p.tree, position: fit(p.tree.position) } };
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  if (m.kind === 'models') {
    for (const k of m.models) models.set(k.id, { geometry: unpackGeometry(k.geometry), width: k.width, height: k.height });
    return;
  }
  const i = m.input;
  const prepped = runPrep(
    prepDistrict(
      {
        terrain: i.terrain.map((t) => ({ geometry: unpackGeometry(t.geometry), solid: t.solid, detail: t.detail })),
        placements: i.placements,
        blockers: i.blockers.map(unpackGeometry),
        minor: i.minor,
        rich: i.rich,
        solids: i.solids,
        detail: i.detail,
      },
      lib,
    ),
  );
  const exact = trimmed(prepped);
  (self as unknown as Worker).postMessage({ id: m.id, prepped: exact }, preppedTransferables(exact));
};
