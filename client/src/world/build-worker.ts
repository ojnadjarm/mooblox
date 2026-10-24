import type { Placement } from './dressing';
import type { BakedModel } from './model-library';
import type { ModelSource, PrepInput, Prepped } from './district-prep';
import { packGeometry, type PackedGeometry } from './geometry-pack';

/** Prepares district dressing (placement, colours, merge, collision BVH) somewhere other than the main thread. */
export interface DistrictPrepper {
  /** The district's merged meshes and solids tree; models it uses are read from `lib`. */
  prep(input: PrepInput, lib: ModelSource): Promise<Prepped>;
  /** Sends models ahead (at boot): a job posted mid-play then carries only its own district. */
  share(ids: readonly string[], lib: ModelSource): void;
}

/** Messages to the build worker: the models a job needs (each sent once), then the job itself. */
export type WorkerRequest =
  | { readonly kind: 'models'; readonly models: readonly { readonly id: string; readonly width: number; readonly height: number; readonly geometry: PackedGeometry }[] }
  | { readonly kind: 'prep'; readonly id: number; readonly input: PackedInput };

/** A prep input with its geometries packed. */
export interface PackedInput {
  readonly terrain: readonly { readonly geometry: PackedGeometry; readonly solid: boolean; readonly detail: boolean }[];
  readonly placements: readonly Placement[];
  readonly blockers: readonly PackedGeometry[];
  readonly minor: boolean;
  readonly rich: boolean;
  readonly solids: boolean;
  readonly detail: boolean;
}

/** The build worker behind a promise per job (one worker, jobs in order). */
export class WorkerPrep implements DistrictPrepper {
  private readonly worker: Worker;
  private readonly waiting = new Map<number, { resolve: (r: Prepped) => void; reject: (e: Error) => void }>();
  private readonly sent = new Set<string>();
  private next = 0;
  /** False once the worker failed (blocked or crashed): callers build inline from then on. */
  ok = true;

  constructor() {
    this.worker = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<{ id: number; prepped: Prepped }>) => {
      const done = this.waiting.get(e.data.id);
      this.waiting.delete(e.data.id);
      done?.resolve(e.data.prepped);
    };
    this.worker.onerror = (e) => {
      this.ok = false;
      for (const w of this.waiting.values()) w.reject(new Error(`mooblox: build worker failed: ${e.message}`));
      this.waiting.clear();
    };
  }

  prep(input: PrepInput, lib: ModelSource): Promise<Prepped> {
    if (!this.ok) return Promise.reject(new Error('mooblox: build worker failed'));
    this.share(input.placements.map((p) => p.id), lib);
    const id = this.next++;
    const packed: PackedInput = {
      terrain: input.terrain.map((t) => ({ geometry: packGeometry(t.geometry), solid: t.solid, detail: t.detail })),
      placements: input.placements,
      blockers: input.blockers.map(packGeometry),
      minor: input.minor,
      rich: input.rich,
      solids: input.solids,
      detail: input.detail,
    };
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.post({ kind: 'prep', id, input: packed });
    });
  }

  share(ids: readonly string[], lib: ModelSource): void {
    const models: { id: string; width: number; height: number; geometry: PackedGeometry }[] = [];
    for (const id of ids) {
      if (this.sent.has(id)) continue;
      this.sent.add(id);
      const m: BakedModel = lib.get(id);
      models.push({ id, width: m.width, height: m.height, geometry: packGeometry(m.geometry) });
    }
    if (models.length) this.post({ kind: 'models', models });
  }

  private post(m: WorkerRequest): void {
    this.worker.postMessage(m);
  }
}

let shared: WorkerPrep | null | undefined;

/** The page's build worker, or null where workers do not exist or failed (districts are then prepared inline). */
export function sharedPrep(): DistrictPrepper | null {
  if (shared === undefined) shared = typeof Worker === 'undefined' ? null : new WorkerPrep();
  return shared?.ok ? shared : null;
}
