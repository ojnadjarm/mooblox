import { Session } from 'node:inspector/promises';
import { AnimationClip, AnimationMixer, Group, Object3D, Quaternion, QuaternionKeyframeTrack, SkinnedMesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { P, PET_MOTION, petMotionState, stepPetMotion } from '../../src/player/pet-motion';
import { PetModel } from '../../src/player/pets';

const DT = 1 / 60;

/** Steps `m` for `seconds` with speed, yaw and height given per time. */
function drive(m: Float64Array, seconds: number, at: (t: number) => { speed: number; yaw: number; y: number; owner?: number }, each?: (m: Float64Array) => void): void {
  const t0 = m[P.time]!;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const s = at(t0 + i * DT);
    m[P.speed] = s.speed;
    m[P.yaw] = s.yaw;
    m[P.y] = s.y;
    m[P.toOwner] = s.owner ?? 0.9;
    m[P.dt] = DT;
    stepPetMotion(m);
    each?.(m);
  }
}

const range = (m: Float64Array, seconds: number, slot: number, at: Parameters<typeof drive>[2]): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  drive(m, seconds, at, (s) => {
    lo = Math.min(lo, s[slot]!);
    hi = Math.max(hi, s[slot]!);
  });
  return [lo, hi];
};

describe('pet motion kernel (pure)', () => {
  it('a stop from a run tips the body forward, then it settles', () => {
    const m = petMotionState(1);
    drive(m, 2, () => ({ speed: 9, yaw: 0, y: 0 }));
    expect(m[P.pitch]).toBeCloseTo(PET_MOTION.lean, 2);
    const [, peak] = range(m, 0.5, P.pitch, () => ({ speed: 0, yaw: 0, y: 0 }));
    expect(peak).toBeGreaterThan(PET_MOTION.lean + 0.05);
    drive(m, 2, () => ({ speed: 0, yaw: 0, y: 0 }));
    expect(Math.abs(m[P.pitch]!)).toBeLessThan(0.01);
  });

  it('banks into turns both ways, capped', () => {
    for (const dir of [1, -1]) {
      const m = petMotionState(2);
      const [lo, hi] = range(m, 2, P.body + 2, (t) => ({ speed: 9, yaw: dir * 2 * t, y: 0 }));
      expect(dir > 0 ? lo : -hi).toBeLessThan(-0.1);
      expect(Math.max(-lo, hi)).toBeLessThanOrEqual(PET_MOTION.maxBank * 1.5);
    }
  });

  it('turning through the yaw wrap gives no spike', () => {
    const m = petMotionState(3);
    const [lo, hi] = range(m, 3, P.body + 2, (t) => ({ speed: 9, yaw: Math.atan2(Math.sin(t), Math.cos(t)), y: 0 }));
    expect(Math.max(-lo, hi)).toBeLessThan(PET_MOTION.maxBank);
  });

  it('stretches in the air and squashes on landing', () => {
    const m = petMotionState(4);
    drive(m, 0.5, () => ({ speed: 0, yaw: 0, y: 1 }));
    const [, up] = range(m, 0.25, P.bodyStretch, (t) => ({ speed: 0, yaw: 0, y: 1 - 6 * (t - 0.5) }));
    const [squash] = range(m, 0.4, P.bodyStretch, () => ({ speed: 0, yaw: 0, y: -0.5 }));
    expect(up).toBeGreaterThan(0.05);
    expect(squash).toBeLessThan(-0.05);
    drive(m, 2, () => ({ speed: 0, yaw: 0, y: -0.5 }));
    expect(Math.abs(m[P.bodyStretch]!)).toBeLessThan(0.005);
  });

  it('idle: wags the tail, looks up at the owner and sniffs; moving: tail streams back, wings flap harder, looks fade', () => {
    const m = petMotionState(5);
    const [wagLo, wagHi] = range(m, 1, P.tailOut + 1, () => ({ speed: 0, yaw: 0, y: 0 }));
    expect(wagHi - wagLo).toBeGreaterThan(PET_MOTION.wagIdle * 1.5);
    const [, flapIdle] = range(m, 1, P.wingLeft + 2, () => ({ speed: 0, yaw: 0, y: 0 }));
    const [yawLo, yawHi] = range(m, 20, P.body + 1, () => ({ speed: 0, yaw: 0, y: 0, owner: 2 }));
    expect(yawHi).toBeCloseTo(PET_MOTION.ownerYaw, 3);
    expect(yawLo).toBeLessThan(0.05);
    const [pitchLo, pitchHi] = range(m, 20, P.body, () => ({ speed: 0, yaw: 0, y: 0 }));
    expect(pitchLo).toBeLessThan(PET_MOTION.ownerPitch * 0.9);
    expect(pitchHi).toBeGreaterThan(PET_MOTION.sniffPitch * 0.9);
    const [, flapRun] = range(m, 2, P.wingLeft + 2, () => ({ speed: 9, yaw: 0, y: 0 }));
    expect(m[P.tailOut]).toBeCloseTo(PET_MOTION.tailLift, 2);
    expect(flapRun).toBeGreaterThan(flapIdle * 3);
    expect(m[P.wingRight + 2]).toBeCloseTo(-m[P.wingLeft + 2]!, 9);
    expect(Math.abs(m[P.body + 1]!)).toBeLessThan(0.01);
  });

  it('a 0.5 s hitch stays bounded', () => {
    const m = petMotionState(6);
    drive(m, 1, () => ({ speed: 9, yaw: 0, y: 0 }));
    m[P.speed] = 0;
    m[P.yaw] = 2;
    m[P.dt] = 0.5;
    stepPetMotion(m);
    for (const slot of [P.body, P.body + 1, P.body + 2, P.bodyStretch, P.tailOut + 1]) expect(Math.abs(m[slot]!)).toBeLessThan(1);
  });
});

/** A cube-pet node rig (root, body, tail, legs) with a body-bob idle clip. */
function pet(): { model: PetModel; body: Object3D; tail: Object3D } {
  const animal = new Object3D();
  const node = (name: string, parent: Object3D): Object3D => {
    const o = new Object3D();
    o.name = name;
    parent.add(o);
    return o;
  };
  const root = node('root', animal);
  const body = node('body', root);
  const tail = node('tail', body);
  node('leg-front-left', root);
  const q = (a: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), a).toArray();
  const clip = new AnimationClip('idle', 1, [new QuaternionKeyframeTrack('body.quaternion', [0, 0.5, 1], [...q(0), ...q(0.1), ...q(0)])]);
  const group = new Group();
  group.add(animal);
  const model = new PetModel(group, new AnimationMixer(animal), new Map([['idle', clip]]), new SkinnedMesh(), animal);
  model.play('idle');
  return { model, body, tail };
}

describe('PetModel motion layer', () => {
  it('never accumulates on the nodes it moves', () => {
    const { model, body, tail } = pet();
    const frames = (n: number) => {
      for (let i = 0; i < n; i++) {
        model.setMotion(9, 0, 0, 0);
        model.update(DT);
      }
    };
    frames(600);
    const lean1 = new Vector3(0, 1, 0).applyQuaternion(body.quaternion).z;
    const tail1 = tail.quaternion.clone();
    frames(600);
    expect(new Vector3(0, 1, 0).applyQuaternion(body.quaternion).z).toBeCloseTo(lean1, 3);
    expect(lean1).toBeGreaterThan(0.05);
    expect(Math.abs(tail.quaternion.x)).toBeCloseTo(Math.abs(tail1.x), 3);
    expect(body.scale.y).toBeGreaterThan(0.9);
  });

  it('a pet update allocates nothing per frame in our code', async () => {
    const { model } = pet();
    function petFrames(n: number): void {
      for (let i = 0; i < n; i++) {
        model.setMotion(i % 120 < 60 ? 9 : 0, i * 0.01, 0, 0.5);
        model.update(DT);
      }
    }
    petFrames(30000);
    interface Node { callFrame: { functionName: string; url: string }; selfSize: number; children: Node[] }
    let bytes = Infinity;
    for (let round = 0; round < 12 && bytes > 0; round++) {
      const session = new Session();
      session.connect();
      await session.post('HeapProfiler.enable');
      await session.post('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
      petFrames(3000);
      const { profile } = (await session.post('HeapProfiler.stopSampling')) as unknown as { profile: { head: Node } };
      session.disconnect();
      let sum = 0;
      const walk = (n: Node, inside: boolean): void => {
        const now = inside || n.callFrame.functionName === 'petFrames';
        if (now && /\/client\/src\//.test(n.callFrame.url)) sum += n.selfSize;
        for (const c of n.children) walk(c, now);
      };
      walk(profile.head, false);
      bytes = Math.min(bytes, sum);
    }
    // Under 1 B per update: one 16 B number per update would be 48 KB; under a loaded CPU V8 adds a few hundred bytes on top.
    expect(bytes).toBeLessThan(3000);
  });
});
