import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { farScenery, RealIslands, type FarBuild } from '../../src/world/far-real';
import type { Circle } from '../../src/world/layout';

/** A far build that is done after one step, with one chunk of 3 vertices. */
function fakeBuild(): FarBuild & { unloaded: number } {
  const group = new Group();
  let built = false;
  return {
    group,
    busy: false,
    unloaded: 0,
    get isBuilt() {
      return built;
    },
    step() {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(new Float32Array(9), 3));
      group.add(new Mesh(g));
      built = true;
      return true;
    },
    unload() {
      this.unloaded++;
      built = false;
      group.clear();
    },
  };
}

const islands: Circle[] = Array.from({ length: 12 }, (_, i) => ({ x: i * 50, z: 0, radius: 10 + i }));

function world() {
  const builds = new Map<number, ReturnType<typeof fakeBuild>>();
  const ready: Object3D[] = [];
  const far = new RealIslands(islands, new MeshStandardMaterial(), {
    build: (i) => {
      const b = fakeBuild();
      builds.set(i, b);
      return b;
    },
    run: (job) => {
      while (!job());
    },
    ready: (g) => ready.push(g),
    distance: (i) => islands[i]!.x,
  });
  return { far, builds, ready };
}

describe('RealIslands', () => {
  it('builds ring islands nearest first, tags each vertex with its island and shows it only while in the ring', () => {
    const { far, builds, ready } = world();
    far.setRing([3, 1]);
    expect(far.step()).toBe(true);
    expect([...builds.keys()]).toEqual([1]);
    const mesh = builds.get(1)!.group.children[0] as Mesh;
    expect([...(mesh.geometry.getAttribute('island').array as Float32Array).slice(0, 3)]).toEqual([50, 0, 11]);
    expect(mesh.castShadow).toBe(false);
    expect(ready).toEqual([builds.get(1)!.group]);
    expect(builds.get(1)!.group.visible).toBe(true);
    expect(far.step()).toBe(true);
    expect(far.step()).toBe(false);
    far.setRing([3]);
    expect(builds.get(1)!.group.visible).toBe(false);
    expect(builds.get(3)!.group.visible).toBe(true);
  });

  it('keeps a few builds past the ring and frees the least recently seen beyond them', () => {
    const { far, builds } = world();
    for (let i = 0; i < 9; i++) {
      far.setRing([i]);
      far.step();
    }
    const freed = [...builds.entries()].filter(([, b]) => b.unloaded > 0).map(([i]) => i);
    expect(freed).toEqual([0, 1]);
  });

  it('far scenery keeps the scenery program chain and adds the inverted fade and the island haze', () => {
    const scenery = new MeshStandardMaterial({ vertexColors: true });
    const chain = () => undefined;
    scenery.onBeforeCompile = chain;
    scenery.customProgramCacheKey = () => 'mooblox-sway-atlas';
    const m = farScenery(scenery);
    expect(m).not.toBe(scenery);
    expect(m.customProgramCacheKey()).toBe('mooblox-sway-atlas-fade-fake-island-haze');
    expect(scenery.customProgramCacheKey()).toBe('mooblox-sway-atlas');
    expect((m as MeshStandardMaterial).vertexColors).toBe(true);
  });
});
