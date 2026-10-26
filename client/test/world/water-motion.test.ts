import { BufferAttribute, BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { RIPPLE, RIPPLE_REACH, SPLASH, STREAM, WATER_CODE, aimRipples, kitPools, rippleCode, splashCode, streamCode } from '../../src/world/water-motion';

function tris(points: readonly number[], colour = 0.5): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(points.length).fill(colour), 3));
  return g;
}

const sway = (g: BufferGeometry) => Array.from(g.getAttribute('sway').array as Float32Array);

describe('water codes', () => {
  it('sit past the wind and cloth weights, in ranges that do not overlap', () => {
    expect(WATER_CODE).toBeGreaterThan(1.5);
    expect(RIPPLE).toBeGreaterThan(WATER_CODE);
    expect(RIPPLE + RIPPLE_REACH).toBeLessThan(STREAM - 0.5);
    expect(STREAM + 1).toBeLessThan(SPLASH - 0.5);
  });

  it('ripples by distance from the ring where they start, capped', () => {
    const g = rippleCode(tris([0, 0, 0, 1, 0, 0, 0, 0, 3, 20, 0, 0, 0, 0, 0, 0, 0, 0]), 0, 0, 1);
    const w = sway(g);
    expect(w[0]).toBeCloseTo(RIPPLE + 1);
    expect(w[1]).toBeCloseTo(RIPPLE);
    expect(w[2]).toBeCloseTo(RIPPLE + 2);
    expect(w[3]).toBeCloseTo(RIPPLE + RIPPLE_REACH);
  });

  it('streams and splashes run 0 to 1 along their height, either way', () => {
    const fall = streamCode(tris([0, 2, 0, 0, 1, 0, 0, 0, 0]), 2, 0);
    expect(sway(fall)).toEqual([STREAM, STREAM + 0.5, STREAM + 1]);
    const jet = streamCode(tris([0, 2, 0, 0, 1, 0, 0, 0, 0]), 0, 2);
    expect(sway(jet)).toEqual([STREAM + 1, STREAM + 0.5, STREAM]);
    expect(sway(splashCode(tris([0, 0, 0, 0, 0.1, 0, 0, 0.2, 0]), 0, 0.1))).toEqual([SPLASH, SPLASH + 1, SPLASH + 1]);
  });
});

describe('kitPools', () => {
  // A strip-triangulated water square at y 0.3 (the way the kit cuts it) beside one stone triangle.
  const water = [-1, 0.3, -1, 1, 0.3, -1, 1, 0.3, 1, -1, 0.3, -1, 1, 0.3, 1, -1, 0.3, 1];
  const stone = [2, 0, 0, 3, 0, 0, 2, 1, 0];

  it('rebuilds the water as a radial fan coded from the axis and keeps the rest uncoded', () => {
    const g = kitPools(tris([...stone, ...water]), (i) => i >= 3, 12);
    const pos = g.getAttribute('position');
    expect(pos.count).toBe(3 + 12 * 3);
    expect(sway(g).slice(0, 3)).toEqual([0, 0, 0]);
    for (let i = 3; i < pos.count; i++) {
      expect(pos.getY(i)).toBeCloseTo(0.3);
      expect(sway(g)[i]).toBeCloseTo(RIPPLE + Math.hypot(pos.getX(i), pos.getZ(i)), 5);
    }
    expect(Math.max(...sway(g))).toBeCloseTo(RIPPLE + Math.SQRT2, 5);
    expect(g.getAttribute('color').getX(5)).toBe(0.5);
  });

  it('leaves a model without water as it is', () => {
    const g = tris(stone);
    expect(kitPools(g, () => false)).toBe(g);
  });

  it('re-aims placed ripples on the model centre, starting a set distance out', () => {
    const g = kitPools(tris([...stone, ...water]), (i) => i >= 3, 12);
    g.translate(10, 0, 5);
    aimRipples(g, 10, 5, 1);
    const pos = g.getAttribute('position');
    expect(sway(g).slice(0, 3)).toEqual([0, 0, 0]);
    for (let i = 3; i < pos.count; i++) expect(sway(g)[i]).toBeCloseTo(RIPPLE + 1 + Math.hypot(pos.getX(i) - 10, pos.getZ(i) - 5), 5);
  });
});
