import { describe, expect, it } from 'vitest';
import { Dwell, WARP_IN, WARP_OUT, warpIn, warpOut } from '../../src/hub/warp';

const run = (d: Dwell, inside: boolean, seconds: number, grounded = true) => {
  let fired = 0;
  for (let t = 0; t < seconds; t += 1 / 60) if (d.step(inside, grounded, 1 / 60)) fired++;
  return fired;
};

describe('Dwell', () => {
  it('fires once after standing still on the spot', () => {
    const d = new Dwell(0.25);
    expect(run(d, true, 0.2)).toBe(0);
    expect(run(d, true, 2)).toBe(1);
  });

  it('needs the kid on the ground and resets when they step off', () => {
    const d = new Dwell(0.25);
    expect(run(d, true, 1, false)).toBe(0);
    run(d, true, 0.2);
    run(d, false, 0.1);
    expect(run(d, true, 0.2)).toBe(0);
  });

  it('does not fire for a kid who arrives on the spot until they leave it once', () => {
    const d = new Dwell(0.25, true);
    expect(run(d, true, 2)).toBe(0);
    run(d, false, 0.1);
    expect(run(d, true, 0.5)).toBe(1);
  });
});

describe('warp poses', () => {
  it('whites out fully by the end of the warp out, with the kid lifted and shrunk', () => {
    expect(warpOut(0).flash).toBe(0);
    const end = warpOut(WARP_OUT);
    expect(end.flash).toBeCloseTo(1);
    expect(end.lift).toBeGreaterThan(2);
    expect(end.shrink).toBeLessThan(0.2);
    expect(warpOut(WARP_OUT * 0.3).beam).toBeGreaterThan(5);
  });

  it('clears the white-out on arrival', () => {
    expect(warpIn(0).flash).toBe(1);
    expect(warpIn(WARP_IN).flash).toBe(0);
    expect(warpIn(WARP_IN).beam).toBe(0);
  });
});
