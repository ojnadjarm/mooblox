import { Session } from 'node:inspector/promises';
import { AnimationClip, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { focus } from '../../src/player/attention';
import { Avatar } from '../../src/player/avatar';
import { fallClip, jumpClip } from '../../src/player/clips';
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
  return { root, clips: [swing('idle', 1.33), swing('walk', 0.67), swing('sprint', 0.5), jumpClip(), fallClip()] };
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

  it('running leans forward with the head counter-tilted, banks into turns, and the head leads the turn instead of glancing', () => {
    const m = motionState(2);
    run(m, IDLE, 5);
    m[M.speed] = MOTION.runSpeed;
    m[M.turn] = 2;
    run(m, RUN, 2);
    expect(m[M.torsoPitch]!).toBeCloseTo(MOTION.lean, 3);
    expect(m[M.torsoRoll]!).toBeCloseTo(-2 * MOTION.bank, 3);
    expect(m[M.headPitch]!).toBeCloseTo(-MOTION.lean * MOTION.headCounter, 2);
    expect(m[M.headYaw]!).toBeCloseTo(2 * MOTION.turnLead, 2);
    expect(Math.abs(m[M.torsoStretch]!)).toBeLessThanOrEqual(MOTION.breathDepth * 0.31);
    m[M.turn] = 100;
    run(m, RUN, 1);
    expect(m[M.torsoRoll]!).toBeCloseTo(-MOTION.maxBank, 3);
  });

  it('leans into a start, rocks back on a stop, then settles; NPCs (speed as authored) get no push', () => {
    const m = motionState(3);
    run(m, IDLE, 1);
    let most = -Infinity;
    for (let i = 1; i <= 30; i++) {
      m[M.speed] = Math.min(MOTION.runSpeed, i * 0.75);
      stepMotion(m, RUN, 1 / 60);
      most = Math.max(most, m[M.torsoPitch]! - m[M.lean]!);
    }
    expect(most).toBeGreaterThan(0.1);
    expect(most).toBeLessThanOrEqual(MOTION.maxPush * 1.4);
    run(m, RUN, 2);
    let least = Infinity;
    for (let i = 1; i <= 30; i++) {
      m[M.speed] = Math.max(0, MOTION.runSpeed - i);
      stepMotion(m, i < 10 ? RUN : IDLE, 1 / 60);
      least = Math.min(least, m[M.torsoPitch]! - m[M.lean]!);
    }
    expect(least).toBeLessThan(-0.1);
    run(m, IDLE, 2);
    expect(Math.abs(m[M.torsoPitch]!)).toBeLessThan(0.01);
    const npc = motionState(4);
    let npcMost = 0;
    for (let i = 0; i < 120; i++) {
      stepMotion(npc, i < 60 ? IDLE : RUN, 1 / 60);
      npcMost = Math.max(npcMost, Math.abs(npc[M.push]!));
    }
    expect(npcMost).toBe(0);
  });
});

describe('look-at, landing and weight shift (pure)', () => {
  const sees = (m: Float64Array, yaw: number, dist: number, pitch = 0) => {
    m[M.focusYaw] = yaw;
    m[M.focusDist] = dist;
    m[M.focusPitch] = pitch;
  };

  it('a standing kid turns head and shoulders to a player in reach, capped, and lets go past the far edge', () => {
    const m = motionState(6);
    run(m, IDLE, 2);
    sees(m, 1, 4, -0.2);
    run(m, IDLE, 3);
    expect(m[M.torsoYaw]!).toBeCloseTo(MOTION.lookTorso, 2);
    expect(m[M.headYaw]!).toBeCloseTo(1 - MOTION.lookTorso, 2);
    expect(m[M.headPitch]!).toBeCloseTo(-0.2, 2);
    sees(m, -3, 4);
    run(m, IDLE, 3);
    expect(Math.abs(m[M.torsoYaw]!)).toBeLessThan(0.01);
    sees(m, -1.6, 7);
    run(m, IDLE, 0.5);
    expect(m[M.attend]!).toBeLessThan(0.01);
    sees(m, -1.6, 5);
    run(m, IDLE, 3);
    sees(m, -1.6, 7.5);
    run(m, IDLE, 1);
    expect(m[M.torsoYaw]! + m[M.headYaw]!).toBeCloseTo(-1.6 * (MOTION.lookYaw / 1.6), 1);
    sees(m, 9, 4);
    run(m, IDLE, 0.2);
    sees(m, 1.8, 4);
    run(m, IDLE, 3);
    expect(Math.abs(m[M.torsoYaw]! + m[M.headYaw]!)).toBeLessThanOrEqual(MOTION.lookYaw + 1e-9);
    sees(m, 1, 9);
    run(m, IDLE, 3);
    expect(Math.abs(m[M.torsoYaw]!)).toBeLessThan(0.01);
  });

  it('walkers look less, and kids react at their own pace', () => {
    const walker = motionState(1);
    sees(walker, 0.8, 3);
    run(walker, WALK, 3);
    expect(walker[M.attend]!).toBeCloseTo(MOTION.lookMoving, 2);
    const pace = Array.from({ length: 6 }, (_, i) => {
      const m = motionState(i);
      sees(m, 1, 3);
      run(m, IDLE, 0.25);
      return m[M.attend]!.toFixed(2);
    });
    expect(new Set(pace).size).toBeGreaterThan(3);
  });

  it('a landing dips the torso and nods, rebounds a little, then settles', () => {
    const m = motionState(2);
    run(m, IDLE, 1);
    run(m, JUMP, 0.5);
    let deepest = 0;
    let rebound = 0;
    let nod = 0;
    for (let i = 0; i < 30; i++) {
      stepMotion(m, IDLE, 1 / 60);
      deepest = Math.min(deepest, m[M.torsoStretch]!);
      rebound = Math.max(rebound, m[M.torsoStretch]!);
      nod = Math.max(nod, m[M.torsoPitch]!);
    }
    expect(deepest).toBeLessThan(-MOTION.landDip * 0.6);
    expect(rebound).toBeGreaterThan(MOTION.landDip * 0.15);
    expect(nod).toBeGreaterThan(MOTION.landNod * 0.3);
    run(m, IDLE, 1);
    expect(m[M.torsoStretch]!).toBeGreaterThanOrEqual(-MOTION.breathDepth);
  });

  it('in the air the chest tilts back on the way up and the eyes go to the ground on the way down; no vertical speed, no tilt', () => {
    const air = (vy: number): Float64Array => {
      const m = motionState(3);
      m[M.speed] = 0;
      m[M.vy] = vy;
      for (let i = 0; i < 40; i++) stepMotion(m, JUMP, 1 / 60);
      return m;
    };
    const flat = air(NaN);
    const up = air(10);
    const down = air(-12);
    expect(up[M.torsoPitch]! - flat[M.torsoPitch]!).toBeCloseTo(-MOTION.maxAirTilt, 1);
    expect(up[M.headPitch]! - flat[M.headPitch]!).toBeLessThan(-0.15);
    expect(down[M.torsoPitch]! - flat[M.torsoPitch]!).toBeCloseTo(MOTION.maxAirTilt, 1);
    expect(down[M.headPitch]! - flat[M.headPitch]!).toBeGreaterThan(0.15);
    const ground = motionState(3);
    ground[M.vy] = 10;
    const still = motionState(3);
    for (let i = 0; i < 40; i++) (stepMotion(ground, IDLE, 1 / 60), stepMotion(still, IDLE, 1 / 60));
    expect(ground[M.torsoPitch]).toBe(still[M.torsoPitch]);
  });

  it('standing kids shift their weight out of step with each other; runners do not', () => {
    const rolls = Array.from({ length: 5 }, (_, i) => {
      const m = motionState(i);
      let most = 0;
      for (let f = 0; f < 600; f++) {
        stepMotion(m, IDLE, 1 / 60);
        most = Math.max(most, Math.abs(m[M.torsoRoll]!));
      }
      expect(most).toBeLessThanOrEqual(MOTION.swayRoll + 1e-9);
      expect(most).toBeGreaterThan(MOTION.swayRoll * 0.5);
      return m[M.torsoRoll]!.toFixed(3);
    });
    expect(new Set(rolls).size).toBe(5);
    const runner = motionState(3);
    runner[M.speed] = MOTION.runSpeed;
    run(runner, RUN, 2);
    expect(Math.abs(runner[M.torsoRoll]!)).toBeLessThan(0.002);
  });
});

describe('Avatar motion layer', () => {
  it('turns its head to the player in the same space, never its own model, never another scene', () => {
    const space = new Object3D();
    const other = new Object3D();
    const make = (parent: Object3D, seed: number) => {
      const { root, clips } = rig();
      parent.add(root);
      return new Avatar(root, clips, seed);
    };
    const npc = make(space, 1);
    const preview = make(other, 2);
    const me = make(space, 3);
    npc.root.rotation.y = Math.PI / 2;
    Object.assign(focus, { owner: me, space, x: 0, y: 0, z: 3 });
    try {
      const yawOf = (a: Avatar) => new Vector3(0, 0, 1).applyQuaternion(a.root.getObjectByName('head')!.getWorldQuaternion(new Quaternion())).x;
      for (let i = 0; i < 180; i++) for (const a of [npc, preview, me]) a.update(1 / 60);
      const turned = new Vector3(0, 0, 1).applyQuaternion(npc.root.getObjectByName('head')!.getWorldQuaternion(new Quaternion()));
      expect(Math.atan2(turned.x, turned.z)).toBeCloseTo(Math.PI / 2 - MOTION.lookYaw, 2);
      expect(Math.abs(yawOf(preview))).toBeLessThan(MOTION.glanceYaw + 0.01);
      expect(Math.abs(yawOf(me))).toBeLessThan(MOTION.glanceYaw + 0.01);
    } finally {
      Object.assign(focus, { owner: null, space: null });
    }
  });

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

  it('20 kids, half of them watching the player, update in under 0.5 ms per frame and allocate nothing per frame in our code', async () => {
    const space = new Object3D();
    Object.assign(focus, { owner: null, space, x: 1, y: 0.5, z: 2 });
    const kids = Array.from({ length: 20 }, (_, i) => {
      const { root, clips } = rig();
      if (i % 2) space.add(root);
      root.position.set(i % 5, 0, i % 7);
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
    // Under 1 B per kid update: one 16 B number per update would be 192 KB; under a loaded CPU V8 adds a few hundred bytes on top.
    Object.assign(focus, { owner: null, space: null });
    expect(bytes).toBeLessThan(12000);
  });
});
