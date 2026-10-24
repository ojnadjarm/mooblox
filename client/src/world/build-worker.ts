import type { SolidsTree } from './district-merge';

/** Builds district collision trees somewhere other than the main thread. */
export interface TreeBuilder {
  /** The BVH over `position` (its buffer is transferred and comes back in the tree). */
  tree(position: Float32Array): Promise<SolidsTree>;
}

/** The build worker behind a promise per job (one worker, jobs in order). */
export class WorkerTrees implements TreeBuilder {
  private readonly worker: Worker;
  private readonly waiting = new Map<number, { resolve: (r: SolidsTree) => void; reject: (e: Error) => void }>();
  private next = 0;
  /** False once the worker failed (blocked or crashed): callers build inline from then on. */
  ok = true;

  constructor() {
    this.worker = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<{ id: number; tree: SolidsTree }>) => {
      const done = this.waiting.get(e.data.id);
      this.waiting.delete(e.data.id);
      done?.resolve(e.data.tree);
    };
    this.worker.onerror = (e) => {
      this.ok = false;
      for (const w of this.waiting.values()) w.reject(new Error(`mooblox: build worker failed: ${e.message}`));
      this.waiting.clear();
    };
  }

  tree(position: Float32Array): Promise<SolidsTree> {
    if (!this.ok) return Promise.reject(new Error('mooblox: build worker failed'));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ id, position }, [position.buffer]);
    });
  }
}

let shared: WorkerTrees | null | undefined;

/** The page's build worker, or null where workers do not exist or failed (trees are then built inline). */
export function sharedTrees(): TreeBuilder | null {
  if (shared === undefined) shared = typeof Worker === 'undefined' ? null : new WorkerTrees();
  return shared?.ok ? shared : null;
}
