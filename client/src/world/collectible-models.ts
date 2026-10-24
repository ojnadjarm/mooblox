import { BufferAttribute, BufferGeometry, CircleGeometry, Color, ConeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CollectibleKind } from '../domain/rewards';
import { alternate, facet, prism, rock } from './landmarks/shapes';

/** Art data: lit and shade of each collectible (art bible section 4). */
const GEM = { lit: 0xa774f0, shade: 0x6a3fb0, table: 0xd9c6ff };
const CRYSTAL = { lit: 0x5ed8d2, shade: 0x1fa4c9, base: 0xc7bbc9 };
const STAR = { lit: 0xf6c445, shade: 0xd49a2a };

/** A brilliant-cut gem, girdle at y 0: 8-sided crown, table and pavilion with alternating facets (about 0.7 m across). */
function gem(): BufferGeometry {
  const crown = alternate(prism(0.2, 0.34, 0.16, 8, GEM.lit, 0, 0, 0, true), GEM.shade, 2);
  const table = facet(new CircleGeometry(0.2, 8).rotateX(-Math.PI / 2), GEM.table, 0, 0.16);
  const pavilion = alternate(facet(new ConeGeometry(0.34, 0.42, 8, 1, true).rotateX(Math.PI), GEM.shade, 0, -0.21), GEM.lit, 1);
  return mergeGeometries([crown, table, pavilion])!;
}

/** Three hexagonal teal shards with pointed tips leaning out of a lavender rock. */
function crystal(): BufferGeometry {
  const shard = (r: number, h: number, lean: number, turn: number) => {
    const body = alternate(prism(r, r * 0.9, h, 6, CRYSTAL.lit, 0, 0, 0, true), CRYSTAL.shade, 2);
    const tip = alternate(facet(new ConeGeometry(r, r * 1.6, 6, 1, true), CRYSTAL.lit, 0, h + r * 0.8), CRYSTAL.shade, 1);
    return mergeGeometries([body, tip])!.rotateZ(lean).rotateY(turn);
  };
  return mergeGeometries([
    shard(0.16, 0.62, 0, 0.3),
    shard(0.11, 0.4, 0.45, 0.4),
    shard(0.1, 0.34, 0.5, 2.6),
    rock(0.24, CRYSTAL.base, 0, 0.02, 0, 0.45),
  ])!.translate(0, -0.3, 0);
}

/** A puffy five-point star facing +z: ridge facets alternate lit and shade. */
function star(): BufferGeometry {
  const outer = 0.42;
  const inner = 0.19;
  const depth = 0.13;
  const rim: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    rim.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const pos: number[] = [];
  const col: number[] = [];
  const lit = new Color(STAR.lit);
  const shade = new Color(STAR.shade);
  for (const side of [1, -1]) {
    for (let i = 0; i < 10; i++) {
      const [ax, ay] = rim[i]!;
      const [bx, by] = rim[(i + 1) % 10]!;
      const tri = side > 0 ? [0, 0, depth, ax, ay, 0, bx, by, 0] : [0, 0, -depth, bx, by, 0, ax, ay, 0];
      pos.push(...tri);
      const c = (i + (side > 0 ? 0 : 1)) % 2 ? shade : lit;
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

/** One designed model per collectible kind, centred on its float point. */
export function collectibleGeometry(kind: CollectibleKind): BufferGeometry {
  return kind === 'gem' ? gem() : kind === 'crystal' ? crystal() : star();
}

/** Triangles of one collectible of each kind (budget checks). */
export function collectibleTriangles(): Record<CollectibleKind, number> {
  const tris = (k: CollectibleKind) => collectibleGeometry(k).getAttribute('position').count / 3;
  return { gem: tris('gem'), crystal: tris('crystal'), star: tris('star') };
}
