import { Session } from 'node:inspector/promises';
import { describe, expect, it } from 'vitest';
import { C, CRITTERS, critterState, keepClear, pace, reactStep, rise, type CritterKind } from '../../src/world/critter-react';

const DT = 1 / 60;

/** Runs critter 0 of `kind` at home (0, 0) for `seconds` with the player at (px, pz) moving `pv` m/s; returns its state. */
function run(kind: CritterKind, seconds: number, px: number, pz: number, pv = 0, s = critterState(1)): Float64Array {
  for (let f = 0; f < seconds * 60; f++) reactStep(s, 0, CRITTERS[kind], 0, 0, 0, 0, 0, 6, Number.isFinite(px), px, pz, pv, DT);
  return s;
}

const away = (s: Float64Array, px: number, pz: number) => Math.hypot(s[C.ox]! - px, s[C.oz]! - pz);

describe('critter reactions', () => {
  it('a duck paddles away from the player and back to its wander once the player leaves', () => {
    const s = run('duck', 2, 2, 0);
    expect(away(s, 2, 0)).toBeGreaterThan(4);
    expect(Math.hypot(s[C.ox]!, s[C.oz]!)).toBeLessThanOrEqual(CRITTERS.duck.leash + 1e-9);
    run('duck', 12, NaN, NaN, 0, s);
    expect(Math.hypot(s[C.ox]!, s[C.oz]!)).toBeLessThan(0.1);
  });

  it('a cat stops its wander and turns to watch a walking player, and darts off when run at', () => {
    const s = run('cat', 1.5, 0, 4, 1.5);
    expect(pace(s, 0, CRITTERS.cat)).toBeLessThan(0.05);
    expect(Math.hypot(s[C.ox]!, s[C.oz]!)).toBeLessThan(0.05);
    expect(Math.abs(s[C.yaw]!)).toBeLessThan(0.05);
    run('cat', 0.6, 0, 1.5, 6, s);
    expect(away(s, 0, 1.5)).toBeGreaterThan(3);
    expect(Math.abs(Math.abs(s[C.yaw]!) - Math.PI)).toBeLessThan(0.3);
  });

  it('a dog trots over, stands its keep from the player facing it and hops; it stays on its leash', () => {
    const s = run('dog', 3, 4, 0);
    expect(away(s, 4, 0)).toBeCloseTo(CRITTERS.dog.keep, 1);
    expect(Math.abs(s[C.yaw]! - Math.PI / 2)).toBeLessThan(0.1);
    let top = 0;
    for (let f = 0; f < 60; f++) {
      run('dog', DT, 4, 0, 0, s);
      top = Math.max(top, rise(s, 0, CRITTERS.dog));
    }
    expect(top).toBeGreaterThan(0.1);
    const far = run('dog', 3, 8.5, 0, 0, run('dog', 2, 4, 0));
    expect(Math.hypot(far[C.ox]!, far[C.oz]!)).toBeLessThanOrEqual(CRITTERS.dog.leash + 1e-9);
  });

  it('butterflies scatter up and out, inside their roam, and settle when the player is gone', () => {
    const s = run('butterfly', 1.5, 0.5, 0);
    expect(away(s, 0.5, 0)).toBeGreaterThan(2);
    expect(rise(s, 0, CRITTERS.butterfly)).toBeGreaterThan(0.8);
    run('butterfly', 10, NaN, NaN, 0, s);
    expect(rise(s, 0, CRITTERS.butterfly)).toBeLessThan(0.05);
  });

  it('a critter never leaves its roam round home', () => {
    const s = critterState(1);
    for (let f = 0; f < 300; f++) reactStep(s, 0, CRITTERS.duck, 2, 0, 0, 0, 0, 2.5, true, 0.5, 0, 0, DT);
    expect(Math.hypot(2 + s[C.ox]!, s[C.oz]!)).toBeLessThanOrEqual(2.5 + 1e-9);
  });

  it('a dog stays its body clear of a hedge between it and the player, and inside its island', () => {
    const area = [0, 0, 20];
    for (let z = -6; z <= 6; z += 1.5) area.push(2, z, 0.7);
    const walls = new Float64Array(area);
    const s = critterState(1);
    let nearest = Infinity;
    for (let f = 0; f < 240; f++) {
      reactStep(s, 0, CRITTERS.dog, 0, 0, 0, 0, 0, 6, true, 4, 0, 0, DT);
      keepClear(s, 0, 0, 0, walls, 0, walls.length, 0.3);
      for (let w = 3; w < walls.length; w += 3) nearest = Math.min(nearest, Math.hypot(s[C.ox]! - walls[w]!, s[C.oz]! - walls[w + 1]!) - walls[w + 2]!);
    }
    expect(nearest).toBeGreaterThanOrEqual(0.3 - 1e-6);
    expect(s[C.ox]!).toBeLessThan(2 - 0.7);
    const land = new Float64Array([0, 0, 3]);
    const t = critterState(1);
    for (let f = 0; f < 240; f++) {
      reactStep(t, 0, CRITTERS.dog, 0, 0, 0, 0, 0, 6, true, 5.5, 0, 0, DT);
      keepClear(t, 0, 0, 0, land, 0, 3, 0.3);
      expect(Math.hypot(t[C.ox]!, t[C.oz]!)).toBeLessThanOrEqual(3 + 1e-9);
    }
    expect(t[C.ox]!).toBeGreaterThan(2.9);
  });

  it('a step allocates nothing', async () => {
    const s = critterState(64);
    const walls = new Float64Array([0, 0, 80, 2, 1, 0.7, 5, 1, 0.7]);
    const steps = () => {
      for (let f = 0; f < 2000; f++) {
        for (let i = 0; i < 64; i++) {
          reactStep(s, i, CRITTERS.dog, i, 0, 0, i, 0, 6, true, 3, 1, 2, DT);
          keepClear(s, i, i, 0, walls, 0, walls.length, 0.3);
        }
      }
    };
    steps();
    const session = new Session();
    session.connect();
    await session.post('HeapProfiler.enable');
    await session.post('HeapProfiler.startSampling', { samplingInterval: 64 });
    steps();
    const { profile } = (await session.post('HeapProfiler.stopSampling')) as unknown as { profile: { head: Node } };
    session.disconnect();
    interface Node { callFrame: { url: string }; selfSize: number; children: Node[] }
    const own = (n: Node): number => (/src\/world\/critter-react/.test(n.callFrame.url) ? n.selfSize : 0) + n.children.reduce((a, c) => a + own(c), 0);
    expect(own(profile.head)).toBe(0);
  });
});
