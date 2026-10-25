import { describe, expect, it } from 'vitest';
import { easeFade, SEE, seeThrough } from '../../src/player/fade';

/** Camera 8 m behind the player (on -z), 3.8 m up, looking at its chest. */
const at = (x: number, z: number, y = 0): number => seeThrough(x, y, z, 0, 3.8, -8, 0, 1.4, 0);

describe('seeThrough', () => {
  it('fades a character standing in the sight line, nearer than the player', () => {
    expect(at(0, -4)).toBe(SEE.max);
    expect(at(0.3, -2.5)).toBe(SEE.max);
  });

  it('ramps across the edge of the line and leaves characters beside it solid', () => {
    const edge = SEE.body + SEE.player;
    expect(at(edge - SEE.edge / 2, -4)).toBeCloseTo(SEE.max / 2, 6);
    expect(at(edge + 0.01, -4)).toBe(0);
    expect(at(3, -4)).toBe(0);
  });

  it('leaves characters behind the player or behind the camera solid', () => {
    expect(at(0, 3)).toBe(0);
    expect(at(0, -12)).toBe(0);
  });

  it('fades a character at the lens whatever the player does', () => {
    expect(seeThrough(0.8, 0, -8.6, 0, 3.8, -8, 6, 1.4, 0)).toBe(SEE.max);
  });

  it('leaves a character on a terrace under the sight line solid', () => {
    expect(at(0, -4, -4)).toBe(0);
  });
});

describe('easeFade', () => {
  it('eases in and settles exactly on the target', () => {
    let f = 0;
    f = easeFade(f, SEE.max, 1 / 60);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(SEE.max);
    for (let i = 0; i < 60; i++) f = easeFade(f, SEE.max, 1 / 60);
    expect(f).toBe(SEE.max);
    for (let i = 0; i < 60; i++) f = easeFade(f, 0, 1 / 60);
    expect(f).toBe(0);
  });
});
