import { Fog } from 'three';
import { describe, expect, it } from 'vitest';
import { DistrictStreamer, type StreamUnit } from '../../src/world/district-streamer';
import { islandGraph, IslandStreamer } from '../../src/world/island-streamer';
import { Haze } from '../../src/world/haze';
import { farMode } from '../../src/world/far-view';
import { IslandLayout } from '../../src/world/island-layout';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';

// Hub 0 at the origin (r 20), zone 1 east (r 10, rim 10 m off the hub), zone 2 west, plaza 3 north linked to the hub.
const islands = [
  { x: 0, z: 0, radius: 20 },
  { x: 40, z: 0, radius: 10 },
  { x: -40, z: 0, radius: 10 },
  { x: 0, z: 50, radius: 13 },
];
const bridges = [
  { a: 0, b: 1 },
  { a: 0, b: 2 },
  { a: 0, b: 3 },
];
const policy = { show: 2.5, shore: 2, neighbours: false };

class Unit implements StreamUnit {
  done = false;
  unloads = 0;
  constructor(readonly x: number, readonly z: number, readonly radius: number) {}
  get isBuilt(): boolean {
    return this.done;
  }
  step(): boolean {
    this.done = true;
    return true;
  }
  finish(): void {
    this.done = true;
  }
  unload(): void {
    this.done = false;
    this.unloads++;
  }
}

describe('IslandStreamer', () => {
  it('keeps one island live in the middle of it', () => {
    const s = new IslandStreamer(islands, bridges, policy);
    s.update(0, 0);
    expect(s.current).toBe(0);
    expect([0, 1, 2, 3].filter((i) => s.live(i))).toEqual([0]);
    expect(s.metric(null as never, 0, 0, 0)).toBe(0);
  });

  it('wants every bridge neighbour from landing, nearest deck first, and draws only the one whose deck the player is on', () => {
    const s = new IslandStreamer(islands, bridges, policy);
    s.update(12, 0);
    const m = [0, 1, 2, 3].map((i) => s.metric(null as never, i, 0, 0));
    expect(m[0]).toBe(0);
    expect(m.slice(1).every((d) => d < Infinity)).toBe(true);
    expect(m[1]).toBeLessThan(m[2]!);
    expect(s.live(1)).toBe(false);
    s.update(25, 0);
    expect(s.current).toBe(0);
    expect(s.live(1)).toBe(true);
    expect(s.crossing(25, 0)).toEqual({ across: 1, t: 0.5 });
    expect(s.update(31, 0)).toBe(true);
    expect(s.current).toBe(1);
    // The hub behind is a neighbour: it stays resident (not drawn); the hub's other neighbours are freed.
    s.update(48, 0);
    expect(s.metric(null as never, 0, 0, 0)).toBeLessThan(Infinity);
    expect(s.live(0)).toBe(false);
    expect([2, 3].map((i) => s.metric(null as never, i, 0, 0))).toEqual([Infinity, Infinity]);
  });

  it('keeps the last island while in the water', () => {
    const s = new IslandStreamer(islands, bridges, policy);
    s.update(30, 0);
    s.update(0, -30);
    expect(s.current).toBe(1);
  });

  it('draws every bridge neighbour in the full ring', () => {
    const s = new IslandStreamer(islands, bridges, { ...policy, neighbours: true });
    s.update(0, 0);
    expect([0, 1, 2, 3].filter((i) => s.live(i))).toEqual([0, 1, 2, 3]);
  });

  it('drives the district streamer: builds the neighbours on landing, frees islands two bridges away', () => {
    const s = new IslandStreamer(islands, bridges, policy);
    const units = islands.map((c) => new Unit(c.x, c.z, c.radius));
    const streamer = new DistrictStreamer(units, { sliceMs: 100, keep: 1e6, drop: 1e6 }, () => 0, s.metric);
    s.update(0, 0);
    streamer.finishWanted(0, 0);
    expect(units.map((u) => u.isBuilt)).toEqual([true, false, false, false]);
    streamer.pump(0, 0);
    expect(units.map((u) => u.isBuilt)).toEqual([true, true, true, true]);
    s.update(45, 0);
    streamer.pump(45, 0);
    expect(units.map((u) => u.isBuilt)).toEqual([true, true, false, false]);
    expect(units[0]!.unloads).toBe(0);
  });

  it('links every island of a big course into one graph', () => {
    const layout = new IslandLayout().layout(shapeWorld(1073, parseShape('20x30')));
    const g = islandGraph(layout);
    expect(g.islands.length).toBe(layout.hubs.length + layout.zones.length);
    expect(g.bridges.length).toBe(layout.zones.length + layout.links.length);
    const seen = new Set([0]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const b of g.bridges) {
        if (seen.has(b.a) !== seen.has(b.b)) {
          seen.add(b.a).add(b.b);
          grew = true;
        }
      }
    }
    expect(seen.size).toBe(g.islands.length);
  });
});

describe('Haze', () => {
  it('glides to its target and snaps when asked', () => {
    const fog = new Fog(0xffffff, 0, 1);
    const haze = new Haze(fog, { near: 1, far: 9 });
    haze.target(0, 0, 20, true);
    haze.update(0);
    expect([fog.near, fog.far, haze.hidden]).toEqual([21, 29, 29]);
    haze.target(40, 0, 10);
    haze.update(0.1);
    expect(haze.x).toBeGreaterThan(0);
    expect(haze.x).toBeLessThan(20);
    for (let i = 0; i < 60; i++) haze.update(1 / 15);
    expect(haze.x).toBeCloseTo(40, 1);
    expect(haze.update(1 / 60)).toBe(false);
  });
});

describe('farMode', () => {
  it('defaults to real builds on high and xhigh, cards below, silhouettes on software GL, and lets ?far= win', () => {
    expect(farMode(null)).toBe('impostor');
    expect(farMode(null, false, 'low')).toBe('impostor');
    expect(farMode(null, false, 'high')).toBe('real');
    expect(farMode(null, false, 'xhigh')).toBe('real');
    expect(farMode(null, true, 'xhigh')).toBe('silhouette');
    expect(farMode('real', false, 'low')).toBe('real');
    expect(farMode(null, true)).toBe('silhouette');
    expect(farMode('impostor', true)).toBe('impostor');
    expect(farMode('bogus')).toBe('impostor');
  });
});
