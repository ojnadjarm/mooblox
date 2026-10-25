import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CLIFF, cliffColumns, cliffWall, TERRACE_CLIFF } from '../../src/world/cliff-wall';
import { CAMPUS } from '../../src/world/look';
import { seededRandom } from '../../src/world/random';
import { Surface } from '../../src/world/surfaces';

const R = 22;
const BASE = -3.4;
const TOP = -0.42;

describe('cliff columns', () => {
  const cols = cliffColumns(R, BASE, TOP, seededRandom(7));

  it('fill the rim exactly, each within the width range', () => {
    const sweep = cols.reduce((s, c) => s + c.a1 - c.a0, 0);
    expect(sweep).toBeCloseTo(Math.PI * 2, 9);
    for (let i = 1; i < cols.length; i++) expect(cols[i]!.a0).toBeCloseTo(cols[i - 1]!.a1, 12);
    const scale = (Math.PI * 2 * R) / cols.reduce((s, c) => s + (c.a1 - c.a0) * R, 0);
    for (const c of cols) {
      const w = (c.a1 - c.a0) * R * scale;
      expect(w).toBeGreaterThan(CLIFF.width[0] * 0.9);
      expect(w).toBeLessThan(CLIFF.width[1] * 1.1);
    }
  });

  it('stack from the base to the top, upper band first, stepping out towards the water', () => {
    for (const c of cols) {
      const s = c.slabs;
      expect(s[0]!.upper).toBe(true);
      expect(s[0]!.y1).toBeLessThanOrEqual(TOP);
      expect(s[s.length - 1]!.y0).toBe(BASE);
      for (let k = 1; k < s.length; k++) {
        expect(s[k]!.upper).toBe(false);
        expect(s[k]!.y1).toBe(s[k - 1]!.y0);
        expect(s[k]!.out).toBeGreaterThan(s[k - 1]!.out);
      }
    }
  });

  it('vary: notches, strata splits, moss and toe rocks all occur, and the same seed repeats', () => {
    expect(cols.some((c) => c.slabs[0]!.y1 < TOP)).toBe(true);
    expect(cols.some((c) => c.slabs.length === 3)).toBe(true);
    expect(cols.some((c) => c.moss)).toBe(true);
    expect(cols.some((c) => c.toe?.bush)).toBe(true);
    expect(cliffColumns(R, BASE, TOP, seededRandom(7))).toEqual(cols);
  });
});

describe('cliff wall', () => {
  const { wall, toes } = cliffWall(R, BASE, TOP, -3, CAMPUS.palette, seededRandom(11));
  const pos = wall.getAttribute('position');

  it('is one coloured mesh in a ring round the rim, under the lip, at most 60 triangles per metre of rim', () => {
    expect(wall.getAttribute('color').count).toBe(pos.count);
    expect(wall.getAttribute('normal').count).toBe(pos.count);
    const layers = new Set(wall.getAttribute('surface').array);
    expect([...layers].sort()).toEqual([Surface.plain, Surface.rock].sort());
    expect(pos.count / 3 / (2 * Math.PI * R)).toBeLessThan(60);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      expect(r).toBeGreaterThan(R - CLIFF.depth - 0.2);
      expect(r).toBeLessThan(R + 1.5);
      expect(pos.getY(i)).toBeGreaterThanOrEqual(BASE - 1e-6);
      expect(pos.getY(i)).toBeLessThan(0);
    }
  });

  it('faces the water: the stone faces point away from the island centre', () => {
    const nrm = wall.getAttribute('normal');
    let outward = 0;
    let inward = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const n = new Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      const radial = new Vector3(pos.getX(i), 0, pos.getZ(i)).normalize();
      if (n.dot(radial) > 0.9) outward++;
      if (n.dot(radial) < -0.5) inward++;
    }
    expect(outward).toBeGreaterThan(100);
    expect(inward).toBe(0);
  });

  it('puts toe rocks at the waterline just off the wall', () => {
    expect(toes.length).toBeGreaterThan(10);
    for (const t of toes) {
      const d = Math.hypot(t.x, t.z);
      expect(d).toBeGreaterThan(R);
      expect(d).toBeLessThan(R + 2.2);
      expect(t.geometry.getAttribute('color').count).toBe(t.geometry.getAttribute('position').count);
    }
  });
});

describe('terrace cliff', () => {
  const r = 2.4;
  const h = 0.85;
  const gap = { at: 1, half: 0.95 / r };
  const cols = cliffColumns(r, -0.05, h, seededRandom(3), TERRACE_CLIFF, gap);

  it('fills the rim but the stair opening, each column keeping a lower stratum under its upper block', () => {
    const sweep = cols.reduce((s, c) => s + c.a1 - c.a0, 0);
    expect(sweep).toBeCloseTo(Math.PI * 2 - 2 * gap.half, 9);
    expect(cols[0]!.a0).toBeCloseTo(gap.at + gap.half, 12);
    for (const c of cols) {
      expect(c.slabs.length).toBeGreaterThan(1);
      expect(c.slabs[0]!.y0).toBeGreaterThan(-0.05);
      expect(c.slabs[c.slabs.length - 1]!.y0).toBe(-0.05);
    }
  });

  it('stays at terrace scale: no stone more than a metre out from the rim', () => {
    const { wall } = cliffWall(r, -0.05, h, 0, CAMPUS.palette, seededRandom(3), TERRACE_CLIFF, gap);
    const pos = wall.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeLessThan(r + 1);
      expect(pos.getY(i)).toBeLessThanOrEqual(h + 0.1);
    }
  });
});
