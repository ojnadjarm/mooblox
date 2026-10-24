import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerTrees, sharedTrees } from '../../src/world/build-worker';
import { solidsTree } from '../../src/world/district-merge';

/** A worker that answers on demand: `reply()` builds the tree for each posted job, `fail()` fires onerror. */
class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  readonly posted: { id: number; position: Float32Array }[] = [];
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: { id: number; position: Float32Array }): void {
    this.posted.push(m);
  }
  reply(order: number[]): void {
    for (const k of order) {
      const m = this.posted[k]!;
      this.onmessage?.({ data: { id: m.id, tree: solidsTree(m.position) } });
    }
  }
  fail(): void {
    this.onerror?.({ message: 'boom' });
  }
}

/** n triangles of solids. */
const solids = (n: number) => new Float32Array(9 * n).map((_, i) => i % 7);

afterEach(() => vi.unstubAllGlobals());

describe('build worker', () => {
  it('has no shared tree builder where workers do not exist (trees build inline)', () => {
    expect(sharedTrees()).toBeNull();
  });

  it('settles each job with its own tree, whatever order replies come in', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const m = new WorkerTrees();
    const a = m.tree(solids(1));
    const b = m.tree(solids(2));
    FakeWorker.last!.reply([1, 0]);
    expect((await a).position.length).toBe(9);
    expect((await b).position.length).toBe(18);
  });

  it('rejects waiting jobs and turns itself off when the worker fails', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const m = new WorkerTrees();
    const a = m.tree(solids(1));
    FakeWorker.last!.fail();
    await expect(a).rejects.toThrow(/build worker failed/);
    expect(m.ok).toBe(false);
    await expect(m.tree(solids(1))).rejects.toThrow(/build worker failed/);
  });
});
