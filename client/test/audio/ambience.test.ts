import { describe, expect, it } from 'vitest';
import { Ambience, CALLERS, onIsland, rimPoint, SHORE_HEAR, shoreLevel, toRim, type Caller } from '../../src/audio/ambience';
import type { AudioEngine } from '../../src/audio/engine';
import { SFX } from '../../src/audio/sounds';

const island = { x: 0, z: 0, radius: 30 };

/** An engine double that records spatial calls (no context: beds stay silent). */
function fakeEngine() {
  const calls: { id: string; x: number; z: number; hear: number }[] = [];
  const engine = { context: null, playAt: (id: string, at: { x: number; z: number }, hear: number) => calls.push({ id, x: at.x, z: at.z, hear }) };
  return { engine: engine as unknown as AudioEngine, calls };
}

describe('shore geometry', () => {
  it('measures in to the rim and finds the rim point', () => {
    expect(toRim(island, 0, 10)).toBe(20);
    expect(toRim(island, 0, 35)).toBe(-5);
    expect(rimPoint(island, 0, 10)).toEqual({ x: 0, z: 30 });
    expect(rimPoint(island, 10, 0, 5)).toEqual({ x: 35, z: 0 });
  });
  it('fades the sea from full at the rim to nothing inland', () => {
    expect(shoreLevel(0)).toBe(1);
    expect(shoreLevel(-3)).toBe(1);
    expect(shoreLevel(SHORE_HEAR / 2)).toBeCloseTo(0.25);
    expect(shoreLevel(SHORE_HEAR + 1)).toBe(0);
  });
  it('keeps only the critters of the current island', () => {
    const list: Caller[] = [
      { kind: 'dog', x: 5, y: 0, z: 0 },
      { kind: 'duck', x: 31, y: 0, z: 0 },
      { kind: 'cat', x: 80, y: 0, z: 0 },
    ];
    expect(onIsland(list, island).map((c) => c.kind)).toEqual(['dog', 'duck']);
  });
});

describe('Ambience', () => {
  it('lets a near dog bark now and then, with pauses in its range', () => {
    const { engine, calls } = fakeEngine();
    const a = new Ambience(engine, () => 0.5);
    a.setCallers([{ kind: 'dog', x: 0, y: 0, z: 0 }], 0);
    for (let t = 0; t <= 120; t += 0.25) a.update(island, 3, 0, t);
    const barks = calls.filter((c) => c.id === 'bark');
    const pause = (CALLERS.dog.every[0] + CALLERS.dog.every[1]) / 2;
    expect(barks.length).toBeGreaterThanOrEqual(Math.floor(120 / pause) - 1);
    expect(barks.length).toBeLessThanOrEqual(Math.ceil(120 / pause) + 1);
  });
  it('stays quiet for callers past their hearing and keeps gulls and waves off inland', () => {
    const { engine, calls } = fakeEngine();
    const a = new Ambience(engine, () => 0.5);
    a.setCallers([{ kind: 'cat', x: 0, y: 0, z: 0 }], 0);
    for (let t = 0; t <= 120; t += 0.25) a.update({ x: 0, z: 0, radius: 200 }, 60, 0, t);
    expect(calls).toEqual([]);
  });
  it('brings gulls over the water and waves at the rim near the shore', () => {
    const { engine, calls } = fakeEngine();
    const a = new Ambience(engine, () => 0.5);
    a.setCallers([], 0);
    for (let t = 0; t <= 60; t += 0.25) a.update(island, 0, 27, t);
    const gulls = calls.filter((c) => c.id === 'gull');
    const waves = calls.filter((c) => c.id === 'wave');
    expect(gulls.length).toBeGreaterThan(1);
    expect(waves.length).toBeGreaterThan(3);
    for (const g of gulls) expect(Math.hypot(g.x, g.z)).toBeGreaterThan(island.radius);
  });
  it('only calls with shipped sounds that vary in pitch', () => {
    for (const tune of Object.values(CALLERS)) {
      expect(SFX[tune.call].files.length).toBeGreaterThan(1);
      expect(SFX[tune.call].vary).toBeGreaterThan(0);
    }
  });
});
