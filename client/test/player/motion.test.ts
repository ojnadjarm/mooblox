import { Session } from 'node:inspector/promises';
import { AnimationClip, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { Avatar } from '../../src/player/avatar';
import { jumpClip } from '../../src/player/clips';
import { hash01, IDLE, JUMP, M, MOTION, motionState, RUN, stepMotion, WALK, type MotionCode } from '../../src/player/motion';

/** The Kenney rig's node tree (root, legs, torso with arms and head) with idle, walk and sprint loops. */
function rig(): { root: Object3D; clips: AnimationClip[] } {
  const root = new Object3D();
  const bone = (name: string, parent: Object3D, y: number): Object3D => {
    const o = new Object3D();
    o.name = name;
    o.position.y = y;
    parent.add(o);
    return o;
  };
  const r = bone('root', root, 0);
  bone('leg-left', r, 1);
  bone('leg-right', r, 1);
  const torso = bone('torso', r, 0.7);
  bone('arm-left', torso, 1.1);
  bone('arm-right', torso, 1.1);
  bone('head', torso, 1.2);
  const swing = (name: string, d: number) => {
    const q = (a: number) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), a).toArray();
    return new AnimationClip(name, d, [
      new QuaternionKeyframeTrack('leg-left.quaternion', [0, d / 2, d], [...q(0.5), ...q(-0.5), ...q(0.5)]),
      new QuaternionKeyframeTrack('arm-right.quaternion', [0, d / 2, d], [...q(0.5), ...q(-0.5), ...q(0.5)]),
      new VectorKeyframeTrack('root.position', [0, d / 2, d], [0, 0, 0, 0, 0.1, 0, 0, 0, 0]),
    ]);
  };
  return { root, clips: [swing('idle', 1.33), swing('walk', 0.67), swing('sprint', 0.5), jumpClip()] };
}

/** Runs `m` for `seconds` at 60 Hz in `code`. */
function run(m: Float64Array, code: MotionCode, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) stepMotion(m, code, 1 / 60);
}

describe('motion kernel (pure)', () => {
  it('hashes are stable and spread over 0..1', () => {
    expect(hash01(3, 4)).toBe(hash01(3, 4));
    const v = Array.from({ length: 200 }, (_, i) => hash01(i, 1));
    expect(Math.min(...v)).toBeLessThan(0.05);
    expect(Math.max(...v)).toBeGreaterThan(0.95);
  });

  it('a crowd of 20 gets 20 different phases and idle rates within the spread', () => {
    const kids = Array.from({ length: 20 }, (_, i) => motionState(i));
    expect(new Set(kids.map((m) => m[M.phase]!.toFixed(3))).size).toBe(20);
    for (const m of kids) {
      stepMotion(m, IDLE, 1 / 60);
      expect(Math.abs(m[M.rate]! - 1)).toBeLessThanOrEqual(MOTION.rateSpread);
    }
  });

  it('stride rate follows ground speed within limits; NaN plays as authored, jumps at 1', () => {
    const m = motionState(0);
    const base = m[M.baseRate]!;
    const rate = (code: MotionCode, speed: number) => {
      m[M.speed] = speed;
      stepMotion(m, code, 1 / 60);
      return m[M.rate]! / base;
    };
    expect(rate(WALK, 3)).toBeCloseTo(0.55);
    expect(rate(WALK, 4.5)).toBeCloseTo(0.75);
    expect(rate(RUN, 20)).toBeCloseTo(MOTION.maxRate);
    expect(rate(WALK, NaN)).toBeCloseTo(1);
    expect(rate(JUMP, 3) * base).toBe(1);
  });

  it('idle glances stay in range, hold still between turns and move smoothly', () => {
    const m = motionState(5);
    let prev = 0;
    let held = 0;
    for (let i = 0; i < 6000; i++) {
      stepMotion(m, IDLE, 1 / 100);
      const yaw = m[M.headYaw]!;
      expect(Math.abs(yaw)).toBeLessThanOrEqual(MOTION.glanceYaw);
      expect(m[M.headPitch]!).toBeGreaterThanOrEqual(-MOTION.glancePitchUp);
      expect(m[M.headPitch]!).toBeLessThanOrEqual(MOTION.glancePitchDown);
      if (i > 0) expect(Math.abs(yaw - prev)).toBeLessThan(0.05);
      if (yaw === prev) held++;
      prev = yaw;
    }
    expect(held).toBeGreaterThan(3000);
  });

  it('running leans forward with the head counter-tilted, banks into turns, and the glance fades out', () => {
    const m = motionState(2);
    run(m, IDLE, 5);
    m[M.speed] = MOTION.runSpeed;
    m[M.turn] = 2;
    run(m, RUN, 2);
    expect(m[M.torsoPitch]!).toBeCloseTo(MOTION.lean, 3);
    expect(m[M.torsoRoll]!).toBeCloseTo(-2 * MOTION.bank, 3);
    expect(m[M.headPitch]!).toBeCloseTo(-MOTION.lean * MOTION.headCounter, 2);
    expect(Math.abs(m[M.headYaw]!)).toBeLessThan(0.01);
    expect(Math.abs(m[M.torsoStretch]!)).toBeLessThanOrEqual(MOTION.breathDepth * 0.31);
    m[M.turn] = 100;
    run(m, RUN, 1);
    expect(m[M.torsoRoll]!).toBeCloseTo(-MOTION.maxBank, 3);
  });
});

describe('Avatar motion layer', () => {
  it('kids built together start their loops at different phases', () => {
    const times = [0, 1, 2].map((seed) => {
      const { root, clips } = rig();
      const a = new Avatar(root, clips, seed);
      a.play('walk');
      return a.mixer.existingAction(clips[1]!)!.time;
    });
    expect(new Set(times.map((t) => t.toFixed(4))).size).toBe(3);
  });

  it('never accumulates on bones the clip does not animate', () => {
    const { root, clips } = rig();
    const a = new Avatar(root, clips, 4);
    a.play('run');
    a.setMotion(10, 0);
    const torso = root.getObjectByName('torso')!;
    for (let i = 0; i < 600; i++) a.update(1 / 60);
    const lean1 = new Vector3(0, 1, 0).applyQuaternion(torso.quaternion).z;
    for (let i = 0; i < 600; i++) a.update(1 / 60);
    const lean2 = new Vector3(0, 1, 0).applyQuaternion(torso.quaternion).z;
    expect(lean1).toBeCloseTo(Math.sin(MOTION.lean), 2);
    expect(lean2).toBeCloseTo(lean1, 3);
    a.play('idle');
    for (let i = 0; i < 600; i++) a.update(1 / 60);
    expect(Math.abs(new Vector3(0, 1, 0).applyQuaternion(torso.quaternion).z)).toBeLessThan(0.01);
  });

  it('the stride plays slower at a slow walk than at walk speed', () => {
    const { root, clips } = rig();
    const a = new Avatar(root, clips, 0);
    a.play('walk');
    const walk = a.mixer.existingAction(clips[1]!)!;
    a.setMotion(MOTION.walkSpeed, 0);
    a.update(0.01);
    const full = walk.timeScale;
    a.setMotion(MOTION.walkSpeed / 2, 0);
    a.update(0.01);
    expect(walk.timeScale).toBeCloseTo(full * 0.55, 5);
  });

  it('20 kids update in under 0.5 ms per frame and allocate nothing in our code', async () => {
    const kids = Array.from({ length: 20 }, (_, i) => {
      const { root, clips } = rig();
      const a = new Avatar(root, clips, i);
      a.play((['idle', 'walk', 'run'] as const)[i % 3]!);
      a.setMotion(i % 3 === 0 ? 0 : 7, 0.5);
      return a;
    });
    function crowdFrames(n: number): void {
      for (let f = 0; f < n; f++) for (const a of kids) a.update(1 / 60);
    }
    crowdFrames(5000);
    const t0 = performance.now();
    crowdFrames(600);
    const perFrame = (performance.now() - t0) / 600;
    expect(perFrame).toBeLessThan(0.5);
    let bytes = Infinity;
    for (let round = 0; round < 8 && bytes > 0; round++) {
      const session = new Session();
      session.connect();
      await session.post('HeapProfiler.enable');
      await session.post('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
      crowdFrames(600);
      const { profile } = (await session.post('HeapProfiler.stopSampling')) as unknown as { profile: { head: Node } };
      session.disconnect();
      interface Node { callFrame: { functionName: string; url: string }; selfSize: number; children: Node[] }
      let sum = 0;
      const walk = (n: Node, inside: boolean): void => {
        const now = inside || n.callFrame.functionName === 'crowdFrames';
        if (now && /\/client\/src\//.test(n.callFrame.url)) sum += n.selfSize;
        for (const c of n.children) walk(c, now);
      };
      walk(profile.head, false);
      bytes = Math.min(bytes, sum);
    }
    expect(bytes).toBe(0);
  });
});
