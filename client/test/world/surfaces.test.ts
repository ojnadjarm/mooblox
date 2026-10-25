import { BufferAttribute, BufferGeometry, Color, Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { GRAIN, grainAxis, grainTops, Surface, surfaceOf, tagSurface, TAGGED_MODELS } from '../../src/world/surfaces';

const lin = (hex: number): [number, number, number] => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};

describe('surfaces', () => {
  it('classes building colours as roof, plaster, wood and window metal', () => {
    expect(surfaceOf('suburb/building-type-a', ...lin(0x5fb36a))).toBe(Surface.roof);
    expect(surfaceOf('suburb/building-type-a', ...lin(0xf1ece0))).toBe(Surface.plaster);
    expect(surfaceOf('suburb/building-type-a', ...lin(0xe6dcc6))).toBe(Surface.plaster);
    expect(surfaceOf('suburb/building-type-a', ...lin(0xf6c445))).toBe(Surface.roof);
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

  it('marks flat tops of bridge decks and docks with a grain that turns with the yaw', () => {
    expect(grainAxis('nature/bridge_center_wood')).toBe('x');
    expect(grainAxis('pirate/structure-platform-dock')).toBe('z');
    for (const id of ['town/stall-bench', 'nature/tree_oak']) expect(grainAxis(id)).toBeNull();
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 1, 0, 0]), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array([...lin(0xa0703f), ...lin(0xa0703f)]), 3));
    grainTops(tagSurface(g, 'nature/bridge_center_wood'), 'x');
    expect(Array.from(g.getAttribute('surface').array)).toEqual([Surface.wood + GRAIN, Surface.wood]);
    g.applyMatrix4(new Matrix4().makeRotationY(0.6));
    const n = g.getAttribute('normal');
    expect(Math.atan2(-n.getZ(0), n.getX(0))).toBeCloseTo(0.6, 5);
    expect(n.getY(0)).toBeGreaterThan(0.999);
    expect(n.getX(1)).toBeCloseTo(Math.cos(0.6), 5);
  });

  it('writes one surface value per vertex', () => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array([...lin(0x7cc35a), ...lin(0x7cc35a), ...lin(0xc9765a)]), 3));
    expect(Array.from(tagSurface(g, '').getAttribute('surface').array)).toEqual([Surface.grass, Surface.grass, Surface.brick]);
  });
});
