import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from 'three';
import { WorkerPrep, sharedPrep, type WorkerRequest } from '../../src/world/build-worker';
import { prepDistrict, runPrep, type ModelSource, type PrepInput } from '../../src/world/district-prep';
import { unpackGeometry } from '../../src/world/geometry-pack';
import type { Placement } from '../../src/world/dressing';

/** A worker that answers on demand: `reply()` runs each posted job like build.worker.ts, `fail()` fires onerror. */
class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  readonly posted: WorkerRequest[] = [];
  private readonly models = new Map<string, { geometry: ReturnType<typeof unpackGeometry>; width: number; height: number }>();
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: WorkerRequest): void {
    this.posted.push(m);
    if (m.kind === 'models') for (const k of m.models) this.models.set(k.id, { geometry: unpackGeometry(k.geometry), width: k.width, height: k.height });
  }
  get jobs() {
    return this.posted.filter((m) => m.kind === 'prep');
  }
  reply(order: number[]): void {
    const lib: ModelSource = { get: (id) => this.models.get(id)! };
    for (const k of order) {
      const m = this.jobs[k]!;
      const i = m.input;
      const input: PrepInput = { terrain: [], placements: i.placements, blockers: i.blockers.map(unpackGeometry), minor: i.minor, rich: i.rich, solids: i.solids, detail: i.detail };
      this.onmessage?.({ data: { id: m.id, prepped: runPrep(prepDistrict(input, lib)) } });
    }
  }
  fail(): void {
    this.onerror?.({ message: 'boom' });
  }
}

const lib: ModelSource = { get: () => ({ geometry: new BoxGeometry(1, 1, 1).toNonIndexed(), width: 1, height: 1 }) };
const placement = (x: number, solid = true): Placement => ({ id: 'kit/box', x, y: 0, z: 0, yaw: 0, height: 1, solid, detail: false });
const input = (n: number): PrepInput => ({ terrain: [], placements: Array.from({ length: n }, (_, i) => placement(i * 2)), blockers: [], minor: true, rich: false, solids: true, detail: true });

afterEach(() => vi.unstubAllGlobals());

describe('build worker', () => {
  it('has no shared prepper where workers do not exist (districts prepare inline)', () => {
    expect(sharedPrep()).toBeNull();
  });

  it('sends each model once and settles each job with its own district, whatever order replies come in', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const m = new WorkerPrep();
    const a = m.prep(input(1), lib);
    const b = m.prep(input(2), lib);
    const w = FakeWorker.last!;
    expect(w.posted.filter((p) => p.kind === 'models').length).toBe(1);
    w.reply([1, 0]);
    expect((await a).meshes[0]!.index.length).toBe(36);
    expect((await b).meshes[0]!.index.length).toBe(2 * 36);
    expect((await b).tree!.position.length).toBe(2 * 36 * 3);
  });

  it('sends models shared ahead only once: a later job carries just its district', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const m = new WorkerPrep();
    m.share(['kit/box'], lib);
    void m.prep(input(2), lib);
    expect(FakeWorker.last!.posted.map((p) => p.kind)).toEqual(['models', 'prep']);
  });

    it('prepares the same district in the worker as inline', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const m = new WorkerPrep();
    const a = m.prep(input(3), lib);
    FakeWorker.last!.reply([0]);
    const inline = runPrep(prepDistrict(input(3), lib));
    const r = await a;
    expect(Array.from(r.meshes[0]!.position)).toEqual(Array.from(inline.meshes[0]!.position));
    expect(Array.from(r.meshes[0]!.color)).toEqual(Array.from(inline.meshes[0]!.color));
  });

  it('leaves out the solids, their tree and the detail for a far-view capture', () => {
    const parts = [placement(0), { ...placement(2), detail: true }];
    const full = runPrep(prepDistrict({ ...input(0), placements: parts }, lib));
    expect(full.meshes[1]!.index.length).toBe(36);
    const r = runPrep(prepDistrict({ ...input(0), placements: parts, solids: false, detail: false }, lib));
    expect(r.tree).toBeNull();
    expect(r.meshes[0]!.index.length).toBe(36);
    expect(r.meshes[1]).toBeNull();
  });

  it('rejects waiting jobs and turns itself off when the worker fails', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const m = new WorkerPrep();
    const a = m.prep(input(1), lib);
    FakeWorker.last!.fail();
    await expect(a).rejects.toThrow(/build worker failed/);
    expect(m.ok).toBe(false);
    await expect(m.prep(input(1), lib)).rejects.toThrow(/build worker failed/);
  });
});
