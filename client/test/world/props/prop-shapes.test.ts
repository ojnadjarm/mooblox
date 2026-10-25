import { Texture, type Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/get_world_demo.json';
import { toWorld } from '../../../src/domain/mapper';
import { IslandLayout } from '../../../src/world/island-layout';
import { MaterialKit } from '../../../src/world/material-kit';
import { createPropRegistry } from '../../../src/world/props/catalog';
import type { PropContext } from '../../../src/world/props/prop';
import { awning, voussoirs } from '../../../src/world/props/prop-shapes';

const world = toWorld(fixture);
const layout = new IslandLayout().layout(world);
const plot = layout.zones[1]!.plots[0]!;
const ctx: PropContext = { kit: new MaterialKit('low'), signs: { paint: () => new Texture(), want: () => undefined, release: () => undefined, forget: () => undefined } };
const tris = (m: Mesh) => (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;

describe('activity props in the bible shape language', () => {
  const activities = world.sections.flatMap((s) => s.activities);
  const kinds = [...activities, { ...activities[1]!, id: 99, modname: 'assign' }];

  it('builds each kind as one body mesh within 1.3k triangles, inside its plot pad', () => {
    const registry = createPropRegistry();
    const seen = new Set<string>();
    for (const a of kinds) {
      const prop = registry.resolve(a).create(a, plot, ctx);
      seen.add(prop.key);
      const bodies = prop.root.children.filter((o) => o.name === 'prop-body') as Mesh[];
      expect(bodies).toHaveLength(1);
      expect(tris(bodies[0]!)).toBeLessThanOrEqual(1300);
      bodies[0]!.geometry.computeBoundingBox();
      const box = bodies[0]!.geometry.boundingBox!;
      expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThanOrEqual(plot.radius);
    }
    expect([...seen].sort()).toEqual(['arena-gate', 'book-stand', 'cinema', 'door', 'signpost']);
  });

  it('cuts an arch into seamed blocks with the keystone last, on top', () => {
    const blocks = voussoirs(1, 1.5, 0.5, 9);
    expect(blocks).toHaveLength(9);
    const key = blocks.at(-1)!;
    key.computeBoundingBox();
    expect(key.boundingBox!.max.y).toBeGreaterThan(1.45);
    expect(Math.abs(key.boundingBox!.min.x + key.boundingBox!.max.x)).toBeLessThan(1e-6);
  });

  it('bends an awning from its back edge down to the front edge', () => {
    const { even, odd } = awning(3, 1.6, 0.07, 7, Math.PI / 3);
    even.computeBoundingBox();
    odd.computeBoundingBox();
    const b = even.boundingBox!.union(odd.boundingBox!);
    expect(b.max.x - b.min.x).toBeCloseTo(3, 5);
    expect(b.max.z).toBeCloseTo(1.6 * Math.sin(Math.PI / 3), 2);
    expect(b.min.y).toBeCloseTo(-1.6 * (1 - Math.cos(Math.PI / 3)), 3);
  });
});
