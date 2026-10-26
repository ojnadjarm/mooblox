import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';

/** A wall-aligned frame: outward normal `n`, horizontal `u` (u × up = n), up; `plane` = n · point on the wall. */
export class WallFrame {
  readonly n: Vector3;
  readonly u: Vector3;
  readonly up = new Vector3(0, 1, 0);

  constructor(
    n: Vector3,
    readonly plane: number,
  ) {
    this.n = n.clone().normalize();
    this.u = new Vector3().crossVectors(this.up, this.n);
  }

  /** The model-space point at `s` along the wall, height `t`, `depth` behind the plane (into the house). */
  at(s: number, t: number, depth: number): Vector3 {
    return this.n.clone().multiplyScalar(this.plane - depth).addScaledVector(this.u, s).addScaledVector(this.up, t);
  }
}

/** Grows a non-indexed, vertex-coloured triangle soup with one source material name per vertex. */
export class TriSink {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  readonly mat: string[] = [];

  /** A rectangle from corner `o` along edges `a` and `b`, facing `towards` (winding follows). `gain` brightens past 1 for lamps. */
  rect(o: Vector3, a: Vector3, b: Vector3, towards: Vector3, colour: number, mat: string, gain = 1): void {
    const n = new Vector3().crossVectors(a, b);
    if (n.dot(towards) < 0) [a, b] = [b, a];
    n.crossVectors(a, b).normalize();
    const c = new Color(colour).multiplyScalar(gain);
    const p1 = o.clone().add(a);
    const p2 = p1.clone().add(b);
    const p3 = o.clone().add(b);
    for (const p of [o, p1, p2, o, p2, p3]) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(c.r, c.g, c.b);
      this.mat.push(mat);
    }
  }

  /** A wall-facing card spanning s0..s1, t0..t1 at `depth` behind the wall plane. */
  card(f: WallFrame, s0: number, s1: number, t0: number, t1: number, depth: number, colour: number, mat: string, gain = 1): void {
    this.rect(f.at(s0, t0, depth), f.u.clone().multiplyScalar(s1 - s0), f.up.clone().multiplyScalar(t1 - t0), f.n, colour, mat, gain);
  }

  /** A box spanning s0..s1, t0..t1 and depth d0..d1 (d0 nearer the outside); its back face is left out. */
  block(f: WallFrame, s0: number, s1: number, t0: number, t1: number, d0: number, d1: number, colour: number, mat: string, gain = 1): void {
    const ds = f.u.clone().multiplyScalar(s1 - s0);
    const dt = f.up.clone().multiplyScalar(t1 - t0);
    const dd = f.n.clone().multiplyScalar(d1 - d0);
    const neg = (v: Vector3) => v.clone().negate();
    this.card(f, s0, s1, t0, t1, d0, colour, mat, gain);
    this.rect(f.at(s0, t1, d1), ds, dd, f.up, colour, mat, gain);
    this.rect(f.at(s0, t0, d1), ds, dd, neg(f.up), colour, mat, gain);
    this.rect(f.at(s0, t0, d1), dt, dd, neg(f.u), colour, mat, gain);
    this.rect(f.at(s1, t0, d1), dt, dd, f.u, colour, mat, gain);
  }

  /** Triangles added so far. */
  get triangles(): number {
    return this.pos.length / 9;
  }
}

/** `geometry` with every triangle `keep` refuses dropped and the sink's triangles appended (position, colour, normal). */
export function rebuild(geometry: BufferGeometry, materials: readonly string[], keep: (tri: number) => boolean, sink: TriSink): { geometry: BufferGeometry; materials: string[] } {
  const names = ['position', 'color', 'normal'] as const;
  const extra = { position: sink.pos, color: sink.col, normal: sink.nor };
  const src = names.map((k) => geometry.getAttribute(k));
  const kept: number[] = [];
  for (let t = 0; t < src[0]!.count / 3; t++) if (keep(t)) kept.push(t);
  const total = kept.length * 3 + sink.pos.length / 3;
  const out = new BufferGeometry();
  const mats: string[] = [];
  names.forEach((k, a) => {
    const arr = new Float32Array(total * 3);
    const from = src[a]!;
    let o = 0;
    for (const t of kept) {
      for (let v = t * 3; v < t * 3 + 3; v++, o += 3) arr.set([from.getX(v), from.getY(v), from.getZ(v)], o);
      if (a === 0) mats.push(materials[t * 3]!, materials[t * 3 + 1]!, materials[t * 3 + 2]!);
    }
    arr.set(extra[k], o);
    out.setAttribute(k, new BufferAttribute(arr, 3));
  });
  mats.push(...sink.mat);
  return { geometry: out, materials: mats };
}
