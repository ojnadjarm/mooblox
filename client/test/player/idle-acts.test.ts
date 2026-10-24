import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Session } from 'node:inspector/promises';
import { AnimationClip, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { focus } from '../../src/player/attention';
import { Avatar } from '../../src/player/avatar';
import { actClips, jumpClip } from '../../src/player/clips';
import { A, ACTS, actState, IDLE_ACTS, KEEP, pickAct, STOP, stepActs, WAVE } from '../../src/player/idle-acts';

const all = (): boolean => true;

/** Steps `a` at 60 Hz for `seconds`; returns [time, result] of every non-KEEP result. */
function run(a: Float64Array, seed: number, idle: boolean, attend: number, seconds: number, t0 = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < seconds * 60; i++) {
    a[A.attend] = attend;
    const r = stepActs(a, seed, idle, 1 / 60, all);
    if (r !== KEEP) out.push([t0 + i / 60, r]);
    if (r >= 0) a[A.left] = 1;
  }
  return out;
}

/** The Kenney rig's nodes with idle, walk, sprint, jump, the pack's two emotes and our acts. */
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
  const torso = bone('torso', r, 0.7);
  bone('arm-left', torso, 1.1);
  bone('arm-right', torso, 1.1);
  bone('head', torso, 1.2);
  const q = (a: number) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), a).toArray();
  const loop = (name: string, d: number) => new AnimationClip(name, d, [new QuaternionKeyframeTrack('arm-left.quaternion', [0, d], [...q(0.1), ...q(0.1)])]);
  return { root, clips: [loop('idle', 1.33), loop('walk', 0.67), loop('sprint', 0.5), jumpClip(), loop('emote-yes', 0.67), loop('emote-no', 0.67), ...actClips()] };
}

describe('idle acts (pure)', () => {
  it('every act gets picked, about as often as its weight', () => {
    const counts = IDLE_ACTS.map(() => 0);
    for (let s = 0; s < 40; s++) for (let n = 0; n < 20; n++) counts[pickAct(s, n)]!++;
    const total = IDLE_ACTS.reduce((t, a) => t + a.weight, 0);
    IDLE_ACTS.forEach((a, i) => expect(counts[i]! / 800).toBeCloseTo(a.weight / total, 1));
    expect(pickAct(3, 4)).toBe(pickAct(3, 4));
  });

  it('a standing kid acts after its own gap, never sooner, and again after a new gap', () => {
    const a = actState(7);
    const gap = a[A.gap]!;
    expect(gap).toBeGreaterThanOrEqual(ACTS.gap);
    expect(gap).toBeLessThanOrEqual(ACTS.gap + ACTS.gapSpread);
    const events = run(a, 7, true, 0, 30);
    expect(events[0]![1]).toBeGreaterThanOrEqual(0);
    expect(events[0]![0]).toBeCloseTo(gap, 1);
    expect(events[1]![1]).toBe(STOP);
    expect(events[1]![0] - events[0]![0]).toBeCloseTo(1, 1);
    expect(events.filter(([, r]) => r >= 0).length).toBeGreaterThanOrEqual(2);
  });

  it('a crowd of 20 does not act in step', () => {
    const firsts = Array.from({ length: 20 }, (_, s) => run(actState(s), s, true, 0, 12)[0]?.[0].toFixed(1));
    expect(new Set(firsts).size).toBeGreaterThan(12);
  });

  it('walking off stops the act and restarts the wait', () => {
    const a = actState(2);
    run(a, 2, true, 0, a[A.gap]! + 0.1);
    expect(a[A.playing]!).toBeGreaterThanOrEqual(0);
    expect(stepActs(a, 2, false, 1 / 60, all)).toBe(STOP);
    expect(run(a, 2, false, 0, 20)).toEqual([]);
    expect(a[A.still]).toBe(0);
  });

  it('noticing the player starts a wave at once, not again within the wait, again after it', () => {
    const a = actState(4);
    run(a, 4, true, 0, 1);
    const first = run(a, 4, true, 1, 0.1);
    expect(first[0]![1]).toBe(WAVE);
    run(a, 4, true, 1, 3);
    run(a, 4, true, 0, 2);
    expect(run(a, 4, true, 1, 0.1).some(([, r]) => r === WAVE)).toBe(false);
    run(a, 4, true, 0, ACTS.waveAgain);
    expect(run(a, 4, true, 1, 0.1).some(([, r]) => r === WAVE)).toBe(true);
  });

  it('skips acts the rig has no clip for', () => {
    const a = actState(1);
    const none = (): boolean => false;
    for (let i = 0; i < 60 * 30; i++) {
      a[A.attend] = i % 300 < 150 ? 1 : 0;
      expect(stepActs(a, 1, true, 1 / 60, none)).toBe(KEEP);
    }
  });
});

describe('idle acts on the avatar', () => {
  it('our act clips only target nodes the Kenney rig has', () => {
    const b = readFileSync(join(__dirname, '../../public/assets/kenney-blocky.glb'));
    const glb = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { nodes: { name?: string }[]; animations: { name: string }[] };
    const nodes = glb.nodes.map((n) => n.name);
    const names = [...glb.animations.map((x) => x.name), ...actClips().map((c) => c.name)];
    for (const c of actClips()) for (const t of c.tracks) expect(nodes).toContain(t.name.split('.')[0]);
    for (const { clip } of IDLE_ACTS) expect(names).toContain(clip);
  });

  it('a standing kid plays an act, then goes back to its idle loop; walking cuts it short', () => {
    const { root, clips } = rig();
    const a = new Avatar(root, clips, 5);
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 40; i++) {
      a.update(1 / 60);
      if (a.acting) seen.add(a.acting);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
    while (!a.acting) a.update(1 / 60);
    const act = a.mixer.existingAction(clips.find((c) => c.name === a.acting)!)!;
    a.play('walk');
    expect(a.acting).toBeNull();
    for (let i = 0; i < 30; i++) a.update(1 / 60);
    expect(act.getEffectiveWeight()).toBe(0);
    expect(a.mixer.existingAction(clips[1]!)!.getEffectiveWeight()).toBeCloseTo(1, 5);
  });

  it('a kid that notices the player waves', () => {
    const space = new Object3D();
    const { root, clips } = rig();
    space.add(root);
    const a = new Avatar(root, clips, 9);
    for (let i = 0; i < 30; i++) a.update(1 / 60);
    Object.assign(focus, { owner: null, space, x: 0, y: 0, z: 3 });
    try {
      let waved = false;
      for (let i = 0; i < 60 && !waved; i++) {
        a.update(1 / 60);
        waved = a.acting === 'wave';
      }
      expect(waved).toBe(true);
    } finally {
      Object.assign(focus, { owner: null, space: null });
    }
  });

  it('20 standing kids with acts allocate nothing per frame in our code', async () => {
    const kids = Array.from({ length: 20 }, (_, i) => {
      const { root, clips } = rig();
      return new Avatar(root, clips, i);
    });
    function actFrames(n: number): void {
      for (let f = 0; f < n; f++) for (const a of kids) a.update(1 / 60);
    }
    actFrames(3000);
    let bytes = Infinity;
    for (let round = 0; round < 8 && bytes > 0; round++) {
      const session = new Session();
      session.connect();
      await session.post('HeapProfiler.enable');
      await session.post('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
      actFrames(1200);
      const { profile } = (await session.post('HeapProfiler.stopSampling')) as unknown as { profile: { head: Node } };
      session.disconnect();
      interface Node { callFrame: { functionName: string; url: string }; selfSize: number; children: Node[] }
      let sum = 0;
      const walk = (n: Node, inside: boolean): void => {
        const now = inside || n.callFrame.functionName === 'actFrames';
        if (now && /\/client\/src\//.test(n.callFrame.url)) sum += n.selfSize;
        for (const c of n.children) walk(c, now);
      };
      walk(profile.head, false);
      bytes = Math.min(bytes, sum);
    }
    expect(bytes).toBeLessThan(12000);
  });
});
