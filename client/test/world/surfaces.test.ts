import { BufferAttribute, BufferGeometry, Color } from 'three';
import { describe, expect, it } from 'vitest';
import { Surface, surfaceOf, tagSurface, TAGGED_MODELS } from '../../src/world/surfaces';

const lin = (hex: number): [number, number, number] => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};

describe('surfaces', () => {
  it('classes building colours as roof, plaster, wood and window metal', () => {
    expect(surfaceOf('suburb/building-type-a', ...lin(0x5fb36a))).toBe(Surface.roof);
    expect(surfaceOf('suburb/building-type-a', ...lin(0xf1ece0))).toBe(Surface.plaster);
    expect(surfaceOf('suburb/building-type-a', ...lin(0x6b4a2e))).toBe(Surface.wood);
    expect(surfaceOf('suburb/building-type-a', ...lin(0x1a1c22))).toBe(Surface.metal);
  });

  it('classes trees, rocks, bridges and terrain', () => {
    expect(surfaceOf('nature/tree_oak', ...lin(0x4caf50))).toBe(Surface.foliage);
    expect(surfaceOf('nature/tree_oak', ...lin(0x8d5a34))).toBe(Surface.bark);
    expect(surfaceOf('nature/tree_oak', ...lin(0x4a3b30))).toBe(Surface.bark);
    expect(surfaceOf('nature/tree_oak', ...lin(0xf6b4c8))).toBe(Surface.foliage);
    expect(surfaceOf('town/hedge-large', ...lin(0x4caf50))).toBe(Surface.hedge);
    expect(surfaceOf('town/hedge-large', ...lin(0x7d829c))).toBe(Surface.rock);
    expect(surfaceOf('nature/plant_bush', ...lin(0x8d5a34))).toBe(Surface.wood);
    expect(surfaceOf('nature/rock_largeA', ...lin(0x9e9e9e))).toBe(Surface.rock);
    expect(surfaceOf('nature/bridge_center_wood', ...lin(0xa0703f))).toBe(Surface.wood);
    expect(surfaceOf('', ...lin(0x7cc35a))).toBe(Surface.grass);
    expect(surfaceOf('', ...lin(0xc9765a))).toBe(Surface.brick);
    expect(surfaceOf('', ...lin(0x9a9a9a))).toBe(Surface.rock);
  });

  it('tags trees, palms and hedges at bake, not planks or bushes', () => {
    for (const id of ['nature/tree_oak', 'suburb/tree-large', 'town/hedge-large', 'nature/tree_palm']) expect(TAGGED_MODELS.test(id)).toBe(true);
    for (const id of ['town/stall-bench', 'nature/plant_bush', 'nature/log', 'suburb/building-type-a']) expect(TAGGED_MODELS.test(id)).toBe(false);
  });

  it('writes one surface value per vertex', () => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array([...lin(0x7cc35a), ...lin(0x7cc35a), ...lin(0xc9765a)]), 3));
    expect(Array.from(tagSurface(g, '').getAttribute('surface').array)).toEqual([Surface.grass, Surface.grass, Surface.brick]);
  });
});
