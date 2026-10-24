import { describe, expect, it } from 'vitest';
import { hop, walkerAt } from '../../src/world/npc-schedule';

describe('walkerAt', () => {
  it('walks there, stands, walks back, stands, and repeats', () => {
    expect(walkerAt(0, 13, 1.3, 2)).toEqual({ k: 0, back: false, walking: true });
    expect(walkerAt(5, 13, 1.3, 2).k).toBeCloseTo(0.5, 6);
    expect(walkerAt(11, 13, 1.3, 2)).toEqual({ k: 1, back: false, walking: false });
    const back = walkerAt(17, 13, 1.3, 2);
    expect(back.back && back.walking).toBe(true);
    expect(back.k).toBeCloseTo(0.5, 6);
    expect(walkerAt(23, 13, 1.3, 2)).toEqual({ k: 0, back: true, walking: false });
    expect(walkerAt(24 + 5, 13, 1.3, 2).k).toBeCloseTo(0.5, 6);
  });
});

describe('hop', () => {
  it('a short arc peaking at 0.9 m, then on the ground until the next period', () => {
    expect(hop(0, 4)).toBe(0);
    expect(hop(0.225, 4)).toBeCloseTo(0.9, 6);
    expect(hop(1, 4)).toBe(0);
    expect(hop(4.225, 4)).toBeCloseTo(0.9, 6);
  });
});
