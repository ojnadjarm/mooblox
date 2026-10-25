import { BoxGeometry, CylinderGeometry, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { dropUndersides, KERB, kerbRun, kerbTris } from '../../src/world/landmarks/kerb';

const tris = (g: BufferGeometry) => g.getAttribute('position').count / 3;

function normals(g: BufferGeometry): { n: Vector3; c: Vector3 }[] {
  const p = g.getAttribute('position');
  const out: { n: Vector3; c: Vector3 }[] = [];
  for (let t = 0; t < p.count; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(p, t + k)) as [Vector3, Vector3, Vector3];
    out.push({ n: b.clone().sub(a).cross(c.clone().sub(a)).normalize(), c: a.clone().add(b).add(c).divideScalar(3) });
  }
  return out;
}

describe('kerb runs', () => {
  it('cost ten triangles a block plus two end caps, no underside', () => {
    for (const len of [0.6, 2.4, 7.3, 18]) {
      const g = kerbRun(len, 0xf4e6cc, 7);
      const blocks = Math.max(1, Math.round(len / KERB.block));
      expect(tris(g)).toBe(kerbTris(blocks));
      expect(normals(g).every(({ n }) => n.y > -0.5)).toBe(true);
    }
  });

  it('turns every face outwards and stays in its box', () => {
    const len = 5;
    const g = kerbRun(len, 0xf4e6cc, 3);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0);
    expect(g.boundingBox!.max.y).toBeCloseTo(KERB.h);
    expect(g.boundingBox!.max.x).toBeCloseTo(KERB.w / 2);
    expect(g.boundingBox!.max.z).toBeCloseTo(len / 2);
    for (const { n, c } of normals(g)) {
      const axis = new Vector3(0, KERB.h / 2, Math.min(len / 2 - 0.1, Math.max(-len / 2 + 0.1, c.z)));
      expect(n.dot(c.clone().sub(axis))).toBeGreaterThan(0);
    }
  });

  it('shades neighbouring blocks apart so the joints read', () => {
    const g = kerbRun(4.4, 0xf4e6cc, 11);
    const col = g.getAttribute('color');
    const top = (b: number) => col.getX(b * 30 + 12);
    for (let b = 0; b < 3; b++) expect(Math.abs(top(b) - top(b + 1))).toBeGreaterThan(0.02);
  });
});

describe('dropUndersides', () => {
  it('drops only the faces turned straight down', () => {
    expect(tris(dropUndersides(new BoxGeometry(2, 0.06, 3)))).toBe(10);
    expect(tris(dropUndersides(new CylinderGeometry(1.1, 1.1, 0.06, 10)))).toBe(30);
    expect(normals(dropUndersides(new BoxGeometry(2, 0.06, 3))).every(({ n }) => n.y > -0.5)).toBe(true);
  });
});
