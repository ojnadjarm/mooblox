import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { toWorld } from '../../src/domain/mapper';
import { IslandBuilder } from '../../src/world/island-builder';
import { IslandLayout } from '../../src/world/island-layout';
import { CAMPUS } from '../../src/world/look';
import { MaterialKit } from '../../src/world/material-kit';
import { ATLAS_LAYERS, Surface } from '../../src/world/surfaces';
import type { Mesh } from 'three';

describe('surface atlas', () => {
  it('has one layer per surface id, each tile at least 1 m', () => {
    expect(ATLAS_LAYERS.length).toBe(Math.max(...Object.values(Surface)) + 1);
    for (const l of ATLAS_LAYERS) expect(l.metres).toBeGreaterThanOrEqual(1);
  });

  it('tags the island land: lawn grass, cliff bands, sand ring, plaza paving and brick, and ground decals', () => {
    const world = toWorld(fixture as never);
    const group = new IslandBuilder(new MaterialKit('standard'), CAMPUS).build(world, new IslandLayout(CAMPUS.size).layout(world));
    const land = group.getObjectByName('land') as Mesh;
    const tags = new Set(Array.from(land.geometry.getAttribute('surface').array));
    for (const s of [Surface.grass, Surface.cliff, Surface.sand, Surface.paving, Surface.brick, Surface.meadow, Surface.ground]) expect(tags.has(s)).toBe(true);
  });
});
