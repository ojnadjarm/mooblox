import { describe, expect, it } from 'vitest';
import { BufferGeometry, DoubleSide, Matrix4, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { archSpots, type Spot } from '../../src/hub/hub-layout';
import { PLINTH, plinthParts } from '../../src/hub/hub-scene';
import { archParts } from '../../src/hub/portal-arch';
import { cupGeometry, cupMatrices } from '../../src/hub/portals';
import { CAMPUS } from '../../src/world/look';

/** Gap (m) under a cup's foot that reads as floating. */
const AIR = 0.02;

const at = (g: BufferGeometry, s: Spot): BufferGeometry => g.rotateY(s.yaw).translate(s.x, 0, s.z);
const merge = (parts: BufferGeometry[]): BufferGeometry => mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map(clean), false)!;
function clean(g: BufferGeometry): BufferGeometry {
  for (const key of Object.keys(g.attributes)) if (key !== 'position') g.deleteAttribute(key);
  return g;
}

interface Prop {
  readonly name: string;
  readonly geometry: BufferGeometry;
  /** Index of the plinth this prop stands on (cups), else -1. */
  readonly seat: number;
}

/** Every portal prop of a floor with all five courses finished: arches, plinths (one per side) and gold cups. */
function hubProps(): Prop[] {
  const p = CAMPUS.palette;
  const props: Prop[] = [];
  archSpots().forEach((s, i) => {
    props.push({ name: `arch ${i}`, geometry: merge(archParts({ trim: p.trim, trimShade: p.trimShade, accent: 0xff0000, shade: 0x880000 }).map((g) => at(g, s))), seat: -1 });
    const parts = plinthParts(p, i);
    for (const side of [0, 1]) props.push({ name: `plinth ${i}.${side}`, geometry: merge(parts.slice(side * 2, side * 2 + 2).map((g) => at(g, s))), seat: -1 });
  });
  const cup = cupGeometry();
  cupMatrices([true, true, true, true, true]).forEach((m, k) => {
    const arch = Math.floor(k / 2);
    const plinth = props.findIndex((x) => x.name === `plinth ${arch}.${k % 2}`);
    props.push({ name: `cup ${arch}.${k % 2}`, geometry: clean(cup.clone().applyMatrix4(m)), seat: plinth });
  });
  return props;
}

describe('hub props', () => {
  const props = hubProps();
  const bvhs = props.map((x) => new MeshBVH(x.geometry));

  it('no two portal props cut into each other (a cup only rests on its own plinth)', () => {
    const bad: string[] = [];
    for (let i = 0; i < props.length; i++) {
      for (let j = i + 1; j < props.length; j++) {
        if (props[i]!.seat === j || props[j]!.seat === i) continue;
        if (bvhs[i]!.intersectsGeometry(props[j]!.geometry, new Matrix4())) bad.push(`${props[i]!.name} + ${props[j]!.name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('seats every cup on its plinth: no floating foot, nothing sunk, nothing over the edge', () => {
    const bad: string[] = [];
    for (const cup of props.filter((x) => x.seat >= 0)) {
      const plinth = bvhs[cup.seat]!;
      cup.geometry.computeBoundingBox();
      const box = cup.geometry.boundingBox!;
      if (Math.abs(box.min.y - PLINTH.h) > 1e-3) bad.push(`${cup.name} foot at ${box.min.y.toFixed(3)}`);
      const pos = cup.geometry.getAttribute('position');
      const v = new Vector3();
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k);
        if (v.y > box.min.y + 0.01) continue;
        const hit = plinth.raycastFirst(new Ray(new Vector3(v.x, v.y + 0.05, v.z), new Vector3(0, -1, 0)), DoubleSide);
        if (!hit || hit.point.y < v.y - AIR) {
          bad.push(`${cup.name} foot off the plinth`);
          break;
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
