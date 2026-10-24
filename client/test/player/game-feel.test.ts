import { describe, expect, it } from 'vitest';
import { accelerate, damp, Feel, JumpGate, landing, puffScale, squash, stepPuffs, stretch, zoom, type Puff } from '../../src/player/game-feel';

const dt = 1 / 60;

describe('accelerate', () => {
  it('reaches walk speed in about 0.13 s on the ground and stops in a short slide', () => {
    const v = { x: 0, z: 0 };
    let t = 0;
    while (v.z < 6 - 1e-9) {
      accelerate(v, 0, 6, true, dt);
      t += dt;
    }
    expect(t).toBeGreaterThan(0.1);
    expect(t).toBeLessThan(0.16);
    let stop = 0;
    while (v.z > 0) {
      accelerate(v, 0, 0, true, dt);
      stop += dt;
    }
    expect(stop).toBeLessThan(0.12);
  });

  it('steers less in the air and never overshoots', () => {
    const ground = accelerate({ x: 0, z: 0 }, 6, 0, true, dt);
    const air = accelerate({ x: 0, z: 0 }, 6, 0, false, dt);
    expect(air.x).toBeLessThan(ground.x);
    expect(accelerate({ x: 5.9, z: 0 }, 6, 0, true, dt).x).toBe(6);
  });
});

describe('JumpGate', () => {
  it('jumps on a press while grounded, once', () => {
    const g = new JumpGate();
    g.press();
    expect(g.step(dt, true)).toBe(true);
    expect(g.step(dt, true)).toBe(false);
  });

  it('coyote time: a press just after walking off an edge still jumps, a late one does not', () => {
    const g = new JumpGate();
    g.step(dt, true);
    for (let i = 0; i < 4; i++) g.step(dt, false);
    g.press();
    expect(g.step(dt, false)).toBe(true);
    const late = new JumpGate();
    late.step(dt, true);
    for (let i = 0; i < 10; i++) late.step(dt, false);
    late.press();
    expect(late.step(dt, false)).toBe(false);
  });

  it('buffering: a press just before landing jumps on touch-down, an early one does not', () => {
    const g = new JumpGate();
    g.press();
    for (let i = 0; i < 5; i++) expect(g.step(dt, false)).toBe(false);
    expect(g.step(dt, true)).toBe(true);
    const early = new JumpGate();
    early.press();
    for (let i = 0; i < 12; i++) early.step(dt, false);
    expect(early.step(dt, true)).toBe(false);
  });

  it('no double jump: the coyote window closes once it jumped', () => {
    const g = new JumpGate();
    g.press();
    expect(g.step(dt, true)).toBe(true);
    g.press();
    expect(g.step(dt, false)).toBe(false);
  });
});

describe('squash and landing', () => {
  it('soft landings do nothing; hard ones squash, keep volume and spring back', () => {
    expect(landing(3)).toBe(0);
    expect(landing(30)).toBe(1);
    const mid = squash(Feel.squashTime / 2, 1);
    expect(mid.y).toBeCloseTo(1 - Feel.squashDepth, 5);
    expect(mid.xz * mid.xz * mid.y).toBeCloseTo(1, 5);
    expect(squash(Feel.squashTime, 1)).toEqual({ xz: 1, y: 1 });
    expect(squash(0.05, 0)).toEqual({ xz: 1, y: 1 });
  });
});

describe('dust puffs', () => {
  it('drift, rise, pop up then shrink, and are dropped when old', () => {
    const puffs: Puff[] = [
      { x: 0, y: 0, z: 0, vx: 1, vz: 0, age: 0, size: 1 },
      { x: 0, y: 0, z: 0, vx: 0, vz: 0, age: Feel.puffLife - 0.01, size: 1 },
    ];
    expect(stepPuffs(puffs, 0.05)).toBe(1);
    const p = puffs[0]!;
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeGreaterThan(0);
    const early = puffScale({ ...p, age: 0.02 });
    const peak = puffScale({ ...p, age: Feel.puffLife / 6 });
    const late = puffScale({ ...p, age: Feel.puffLife * 0.9 });
    expect(peak).toBeGreaterThan(early);
    expect(peak).toBeGreaterThan(late);
    expect(puffScale({ ...p, age: Feel.puffLife })).toBe(0);
  });
});

describe('camera helpers', () => {
  it('zoom stays between its limits', () => {
    expect(zoom(10, 1e5)).toBe(Feel.zoomMax);
    expect(zoom(10, -1e5)).toBe(Feel.zoomMin);
    expect(zoom(10, 100)).toBeGreaterThan(10);
  });

  it('damp is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 1, 5, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('take-off stretch', () => {
  it('starts tall and thin, keeps volume and eases back to rest', () => {
    const start = stretch(0);
    expect(start.y).toBeCloseTo(1 + Feel.stretchHeight, 5);
    expect(start.xz * start.xz * start.y).toBeCloseTo(1, 5);
    expect(stretch(Feel.stretchTime / 2).y).toBeLessThan(start.y);
    expect(stretch(Feel.stretchTime)).toEqual({ xz: 1, y: 1 });
  });
});
