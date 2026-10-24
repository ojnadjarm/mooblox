import { BoxGeometry, BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';
import { BvhCollider } from '../../src/player/collider';
import { MeshMerge, SolidsMerge, solidsTree, transferables, type PartArrays } from '../../src/world/district-merge';

/** A 2 m box at (x, 0, z) as part arrays. */
function box(x: number, z = 0, surface: number | null = null): PartArrays {
  const g = new BoxGeometry(2, 2, 2).toNonIndexed().translate(x, 0, z);
  const n = g.getAttribute('position').count;
  return {
    position: g.getAttribute('position').array as Float32Array,
    normal: g.getAttribute('normal').array as Float32Array,
    color: new Float32Array(n * 3).fill(1),
    colorSize: 3,
    sway: new Float32Array(n),
    surface: surface === null ? null : new Float32Array(n).fill(surface),
  };
}

describe('district merge', () => {
  it('appends parts in order, growing past its first capacity', () => {
    const m = new MeshMerge();
    for (let i = 0; i < 40; i++) m.add(box(i * 3));
    const r = m.finish()!;
    expect(r.position.length).toBe(40 * 36 * 3);
    expect(r.position[39 * 36 * 3]).toBeGreaterThan(110);
    expect(r.color.length).toBe(r.position.length);
    expect(new MeshMerge().finish()).toBeNull();
  });

  it('keeps surface ids only when every part carries them', () => {
    const tagged = new MeshMerge();
    tagged.add(box(0, 0, 2));
    tagged.add(box(3, 0, 5));
    expect(tagged.finish()!.surface![36]).toBe(5);
    const mixed = new MeshMerge();
    mixed.add(box(0, 0, 2));
    mixed.add(box(3));
    expect(mixed.finish()!.surface).toBeNull();
  });

  it('builds a serialized BVH over the solids that collides like one built in place', () => {
    const solids = new SolidsMerge();
    solids.add(box(0).position);
    solids.add(box(0, 8).position);
    const t = solidsTree(solids.finish()!);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(t.position, 3));
    g.boundsTree = MeshBVH.deserialize(t.bvh, g, { setIndex: true });
    const c = new BvhCollider(g);
    expect(c.resolve(new Vector3(1.2, -0.5, 0), new Vector3(1.2, 0.5, 0), 0.5).length()).toBeGreaterThan(0.1);
    expect(c.resolve(new Vector3(5, -0.5, 0), new Vector3(5, 0.5, 0), 0.5).length()).toBe(0);
    expect(c.resolve(new Vector3(0, -0.5, 9.2), new Vector3(0, 0.5, 9.2), 0.5).length()).toBeGreaterThan(0.1);
    expect(transferables(t)).toContain(t.position.buffer);
    expect(new SolidsMerge().finish()).toBeNull();
  });
});
