import { BoxGeometry, Mesh, PlaneGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { toWorld } from '../../src/domain/mapper';
import type { WorldData } from '../../src/domain/types';
import { BvhCollider } from '../../src/player/collider';
import { Physics, stepBody, type Body, type MoveInput } from '../../src/player/controller';
import { FencedCollider } from '../../src/player/fenced-collider';
import { AccessFence, closedSections, gateSpot, ZONE_SHORE } from '../../src/world/access-fence';
import { IslandLayout } from '../../src/world/island-layout';
import type { Zone } from '../../src/world/layout';
import { shiftFor, structureKey } from '../../src/world/rebuild';

const demo = toWorld(fixture);
const locked = (world: WorldData, id: number): WorldData => ({
  ...world,
  sections: world.sections.map((s) => (s.id === id ? { ...s, available: false, lock: 'Finish How volcanoes work first', activities: [] } : s)),
});
const closedWorld = locked(demo, 35);
const layout = new IslandLayout().layout(closedWorld);
const zone = layout.zones.find((z) => z.sectionId === 35)!;
const g = gateSpot(zone);
const fence = new AccessFence(layout);
fence.setClosed(closedSections(closedWorld));

const at = (t: number, side = 0) => ({ x: g.dx * t - g.dz * side, z: g.dz * t + g.dx * side });
const dist = (p: { x: number; z: number }, c: Zone) => Math.hypot(p.x - c.x, p.z - c.z);

describe('AccessFence', () => {
  it('closes only the sections the user cannot enter', () => {
    expect([...closedSections(closedWorld)]).toEqual([35]);
    expect(fence.isClosed(35)).toBe(true);
    expect(fence.isClosed(34)).toBe(false);
  });

  it('stops a body on the bridge in front of the gate', () => {
    const p = at(g.t + 0.3);
    const push = fence.push(p.x, p.z, 0.5);
    const t = (p.x + push.x) * g.dx + (p.z + push.z) * g.dz;
    expect(t).toBeCloseTo(g.t - 0.5, 5);
  });

  it('leaves the open part of the bridge and other zones alone', () => {
    const p = at(g.t - 1);
    expect(fence.push(p.x, p.z, 0.5)).toEqual({ x: 0, z: 0 });
    const other = layout.zones.find((z) => z.sectionId === 34)!;
    expect(fence.push(other.x, other.z, 0.5)).toEqual({ x: 0, z: 0 });
  });

  it('pushes a body off the island and its shore from any side', () => {
    for (let a = 0; a < 8; a++) {
      const x = zone.x + Math.cos(a) * (zone.radius + 1);
      const z = zone.z + Math.sin(a) * (zone.radius + 1);
      const push = fence.push(x, z, 0.5);
      expect(dist({ x: x + push.x, z: z + push.z }, zone)).toBeGreaterThanOrEqual(zone.radius + ZONE_SHORE + 0.5 - 1e-6);
    }
  });

  it('opens when the section opens', () => {
    const open = new AccessFence(layout);
    open.setClosed(new Set());
    const p = at(g.t + 1);
    expect(open.push(p.x, p.z, 0.5)).toEqual({ x: 0, z: 0 });
  });
});

describe('FencedCollider', () => {
  const ground = BvhCollider.fromMeshes([new Mesh(new PlaneGeometry(600, 600).rotateX(-Math.PI / 2))]);
  const collider = new FencedCollider(ground, fence);
  const toward: MoveInput = { x: g.dx, z: g.dz, run: true, jump: true };
  const body = (t: number, y = 0): Body => {
    const p = at(t);
    return { position: new Vector3(p.x, y, p.z), velocity: new Vector3(), onGround: false };
  };
  const reach = (b: Body) => b.position.x * g.dx + b.position.z * g.dz;

  it('running and jumping at the gate never gets past it', () => {
    const b = body(g.t - 4);
    for (let i = 0; i < 600; i++) {
      stepBody(b, toward, Physics.step, collider);
    }
    expect(reach(b)).toBeLessThanOrEqual(g.t - Physics.radius + 1e-3);
  });

  it('falling from the sky onto a closed zone lands outside it', () => {
    const b: Body = { position: new Vector3(zone.x, 40, zone.z), velocity: new Vector3(), onGround: false };
    for (let i = 0; i < 300; i++) {
      stepBody(b, { x: 0, z: 0, run: false, jump: false }, Physics.step, collider);
    }
    expect(dist(b.position, zone)).toBeGreaterThanOrEqual(zone.radius + ZONE_SHORE + Physics.radius - 1e-3);
  });

  it('keeps solid geometry working under the fence', () => {
    const wall = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(1, 4, 40).translate(3, 2, 0))]);
    const c = new FencedCollider(wall, new AccessFence({ ...layout, zones: [] }));
    const push = c.resolve(new Vector3(2.2, 1, 0), new Vector3(2.2, 2, 0), 0.5);
    expect(push.x).toBeLessThan(0);
  });
});

describe('rebuild', () => {
  it('changes the structure key only when sections or activities come or go', () => {
    expect(structureKey(closedWorld)).not.toBe(structureKey(demo));
    expect(structureKey({ ...demo, nextChange: 99 })).toBe(structureKey(demo));
  });

  it('moves a body with its zone when the layout changes', () => {
    const after = new IslandLayout().layout(demo);
    const home = layout.zones.find((z) => z.sectionId === 34)!;
    const moved = after.zones.find((z) => z.sectionId === 34)!;
    expect(shiftFor(layout, after, home.x, home.z)).toEqual({ x: moved.x - home.x, z: moved.z - home.z });
    expect(shiftFor(layout, after, 0, 0)).toEqual({ x: 0, z: 0 });
  });
});
