import type { Placement } from './dressing';
import type { BakedModel } from './model-library';
import type { ModelSource, PrepInput, Prepped } from './district-prep';
import { packGeometry, type PackedGeometry } from './geometry-pack';

/** Prepares district dressing (placement, colours, merge, collision BVH) somewhere other than the main thread. */
export interface DistrictPrepper {
  /** The district's merged meshes and solids tree; models it uses are read from `lib`. */
  prep(input: PrepInput, lib: ModelSource): Promise<Prepped>;
  /** `prep` posted in parts of about PART_BYTES, yielding between them: a big district costs no long frame to send. */
  prepParts(input: PrepInput, lib: ModelSource): Generator<void, Promise<Prepped>>;
  /** Sends models ahead (at boot): a job posted mid-play then carries only its own district. */
  share(ids: readonly string[], lib: ModelSource): void;
}

/** Messages to the build worker: the models a job needs (each sent once), then the job itself. */
export type WorkerRequest =
  | { readonly kind: 'models'; readonly models: readonly { readonly id: string; readonly width: number; readonly height: number; readonly geometry: PackedGeometry }[] }
  | { readonly kind: 'part'; readonly id: number; readonly part: PackedPart }
  | { readonly kind: 'prep'; readonly id: number; readonly input: PackedInput };

/** A slice of a job's terrain, placements and blockers, sent ahead of the job (the job appends its own). */
export interface PackedPart {
  readonly terrain: PackedInput['terrain'];
  readonly placements: readonly Placement[];
  readonly blockers: readonly PackedGeometry[];
}

/** Bytes of geometry (or PART_PLACEMENTS placements) per posted part: about 1 ms of structured clone on a slow laptop core. */
export const PART_BYTES = 128 * 1024;
export const PART_PLACEMENTS = 200;

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
    const parts = this.prepParts(input, lib);
    for (;;) {
      const r = parts.next();
      if (r.done) return r.value;
    }
  }

  *prepParts(input: PrepInput, lib: ModelSource): Generator<void, Promise<Prepped>> {
    if (!this.ok) return Promise.reject(new Error('mooblox: build worker failed'));
    this.share(input.placements.map((p) => p.id), lib);
    const id = this.next++;
    let part: { terrain: PackedInput['terrain'][number][]; placements: Placement[]; blockers: PackedGeometry[] } = { terrain: [], placements: [], blockers: [] };
    let bytes = 0;
    const full = () => bytes >= PART_BYTES || part.placements.length >= PART_PLACEMENTS;
    // Every full part goes now and the next one waits for a later slice; the job carries the remainder.
    const flush = () => {
      this.post({ kind: 'part', id, part });
      part = { terrain: [], placements: [], blockers: [] };
      bytes = 0;
    };
    for (const t of input.terrain) {
      const geometry = packGeometry(t.geometry);
      part.terrain.push({ geometry, solid: t.solid, detail: t.detail });
      bytes += packedBytes(geometry);
      if (full()) {
        flush();
        yield;
      }
    }
    for (const p of input.placements) {
      part.placements.push(p);
      if (full()) {
        flush();
        yield;
      }
    }
    for (const b of input.blockers) {
      const geometry = packGeometry(b);
      part.blockers.push(geometry);
      bytes += packedBytes(geometry);
      if (full()) {
        flush();
        yield;
      }
    }
    if (!this.ok) return Promise.reject(new Error('mooblox: build worker failed'));
    const packed: PackedInput = { ...part, minor: input.minor, rich: input.rich, solids: input.solids, detail: input.detail };
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

function packedBytes(g: PackedGeometry): number {
  let n = g.index?.byteLength ?? 0;
  for (const a of Object.values(g.attributes)) n += a.array.byteLength;
  return n;
}

let shared: WorkerPrep | null | undefined;

/** The page's build worker, or null where workers do not exist or failed (districts are then prepared inline). */
export function sharedPrep(): DistrictPrepper | null {
  if (shared === undefined) shared = typeof Worker === 'undefined' ? null : new WorkerPrep();
  return shared?.ok ? shared : null;
}
