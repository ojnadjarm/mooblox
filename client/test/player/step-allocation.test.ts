import { Session } from 'node:inspector/promises';
import { BoxGeometry, Mesh, PlaneGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BvhCollider } from '../../src/player/collider';
import { Physics, stepBody, type Body, type MoveInput } from '../../src/player/controller';
import { FencedCollider } from '../../src/player/fenced-collider';
import { CombinedInput, type InputSource, type InputState } from '../../src/player/input';
import { AccessFence } from '../../src/world/access-fence';
import type { WorldLayout } from '../../src/world/layout';

interface SampleNode {
  callFrame: { functionName: string; url: string };
  selfSize: number;
  children: SampleNode[];
}

/** Bytes the heap-sampling profiler saw allocated under the frame named `root` by functions whose file matches `own`. */
async function sampledBytes(root: string, own: RegExp, work: () => void): Promise<number> {
  const session = new Session();
  session.connect();
  await session.post('HeapProfiler.enable');
  await session.post('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
  work();
  const { profile } = (await session.post('HeapProfiler.stopSampling')) as unknown as { profile: { head: SampleNode } };
  session.disconnect();
  let bytes = 0;
  const walk = (n: SampleNode, inside: boolean): void => {
    const now = inside || n.callFrame.functionName === root;
    if (now && own.test(n.callFrame.url)) bytes += n.selfSize;
    for (const c of n.children) walk(c, now);
  };
  walk(profile.head, false);
  return bytes;
}

const layout: WorldLayout = {
  hub: { x: 0, z: 0, radius: 12 },
  hubs: [{ x: 0, z: 0, radius: 12 }],
  links: [],
  spawn: { x: 0, z: 0 },
  zones: [{ x: 30, z: 0, radius: 8, sectionId: 2, angle: 0, anchor: { x: 0, z: 0, radius: 12 }, plots: [] }],
  extent: 40,
};

class Stick implements InputSource {
  private readonly state = { x: 0.6, z: 0.8, run: true, jump: false };
  read(): InputState {
    return this.state;
  }
}

describe('hot path allocations', () => {
  it('a physics step through the fenced BVH collider and the combined input allocates nothing in our code', async () => {
    const world = new Mesh(new PlaneGeometry(200, 200, 20, 20).rotateX(-Math.PI / 2));
    const walls = [-1, 1].map((s) => new Mesh(new BoxGeometry(1, 3, 40).translate(s * 6, 1.5, 0)));
    const fence = new AccessFence(layout);
    fence.setClosed(new Set([2]));
    const collider = new FencedCollider(BvhCollider.fromMeshes([world, ...walls]), fence);
    const input = new CombinedInput([new Stick(), new Stick()]);
    const body: Body = { position: new Vector3(0, 0, 0), velocity: new Vector3(), onGround: false };
    const move = { x: 0, z: 0, run: false, jump: false };
    function walkSteps(n: number): void {
      for (let i = 0; i < n; i++) {
        const raw = input.read();
        const a = i * 0.01;
        move.x = raw.x * Math.cos(a) - raw.z * Math.sin(a);
        move.z = raw.x * Math.sin(a) + raw.z * Math.cos(a);
        move.run = raw.run;
        move.jump = i % 90 === 0;
        stepBody(body, move as MoveInput, Physics.step, collider);
        if (body.position.lengthSq() > 900) body.position.set(0, 0, 0);
      }
    }
    walkSteps(60000);
    // Our code (src/) must allocate nothing; three-mesh-bvh's shapecast still makes 3 typed-array views per call (library).
    // Short sampled rounds (sampling is ~7x slower) and up to 8 of them: under parallel workers the optimiser finishes late.
    let bytes = Infinity;
    for (let round = 0; round < 8 && bytes > 0; round++) {
      bytes = Math.min(bytes, await sampledBytes('walkSteps', /\/client\/src\//, () => walkSteps(5000)));
    }
    expect(bytes).toBe(0);
  }, 30000);

  it('the sampler sees an allocating step (control)', async () => {
    const keep: Vector3[] = [];
    function leakySteps(n: number): void {
      for (let i = 0; i < n; i++) keep[i % 8] = new Vector3(i, 0, 0);
    }
    leakySteps(20000);
    expect(await sampledBytes('leakySteps', /step-allocation/, () => leakySteps(20000))).toBeGreaterThan(100000);
  });
});
