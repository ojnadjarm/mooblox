import { BufferGeometry, Color, Float32BufferAttribute, Uint16BufferAttribute, Vector3 } from 'three';
import { tileUv } from './atlas';
import { BONES, type Part, type Vec3 } from './parts';

/** Growable attribute arrays of one merged, skinned character mesh. */
class Buffers {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly color: number[] = [];
  readonly uv: number[] = [];
  readonly skinIndex: number[] = [];
  readonly index: number[] = [];

  get count(): number {
    return this.position.length / 3;
  }

  vertex(p: Vec3, n: Vec3, c: Color, u: number, v: number, bone: number): void {
    this.position.push(p[0], p[1], p[2]);
    this.normal.push(n[0], n[1], n[2]);
    const k = Math.min(1, bakedShade(p[1], n[1]) + formShade(bone, p[1]));
    this.color.push(c.r * (1 - k) + SHADE.r * k, c.g * (1 - k) + SHADE.g * k, c.b * (1 - k) + SHADE.b * k);
    this.uv.push(u, v);
    this.skinIndex.push(bone, 0, 0, 0);
  }
}

/** Baked shade like the world's (art bible shadow tint, at 60 %): towards the feet and on faces that look down. */
const SHADE = new Color(0x4b5a8c).multiplyScalar(0.6);

function bakedShade(y: number, ny: number): number {
  const t = Math.min(1, Math.max(0, y / 0.8));
  return 0.24 * (1 - t * t * (3 - 2 * t)) + (ny < -0.5 ? 0.12 : 0);
}

/** Each body block shades from its top (as painted) to `FORM` at its bottom, so stacked segments read as one rounded form. */
const FORM = 0.09;
const FORM_SPAN: readonly (readonly [number, number] | null)[] = [null, [0, 1.0], [0, 1.0], [1.0, 1.9], [0.8, 1.9], [0.8, 1.9], [1.9, 2.7]];

function formShade(bone: number, y: number): number {
  const span = FORM_SPAN[bone];
  if (!span) return 0;
  const t = Math.min(1, Math.max(0, (y - span[0]) / (span[1] - span[0])));
  return FORM * (1 - t);
}

const SOLID = tileUv('solid');
const SOLID_U = (SOLID[0] + SOLID[2]) / 2;
const SOLID_V = (SOLID[1] + SOLID[3]) / 2;

/** One indexed geometry for all parts, every vertex bound rigidly to its part's bone (skinIndex, weight 1). */
export function buildGeometry(parts: readonly Part[]): BufferGeometry {
  const b = new Buffers();
  const colour = new Color();
  for (const part of parts) {
    const bone = BONES.indexOf(part.bone);
    if (part.kind === 'mesh') {
      addMesh(b, part.positions, part.colours, colour, bone);
      continue;
    }
    colour.setHex(part.colour);
    if (part.kind === 'box' && part.bevel) addBlock(b, part.min, part.max, part.bevel, colour, bone);
    else if (part.kind === 'box') addBox(b, part.min, part.max, colour, bone);
    else if (part.kind === 'spike') addSpike(b, part.min, part.max, part.apex, colour, bone);
    else addQuad(b, part.centre, part.width, part.height, tileUv(part.tile), part.mirror ?? false, colour, bone);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(b.position, 3));
  g.setAttribute('normal', new Float32BufferAttribute(b.normal, 3));
  g.setAttribute('color', new Float32BufferAttribute(b.color, 3));
  g.setAttribute('uv', new Float32BufferAttribute(b.uv, 2));
  g.setAttribute('skinIndex', new Uint16BufferAttribute(b.skinIndex, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(b.skinIndex.map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  g.setIndex(b.index);
  return g;
}

/** Box faces: normal axis, sign, and the two in-plane axes in counter-clockwise order seen from outside. */
const FACES: readonly [number, 1 | -1, number, number][] = [
  [0, 1, 1, 2],
  [0, -1, 2, 1],
  [1, 1, 2, 0],
  [1, -1, 0, 2],
  [2, 1, 0, 1],
  [2, -1, 1, 0],
];

function addBox(b: Buffers, min: Vec3, max: Vec3, c: Color, bone: number): void {
  for (const [axis, sign, a, d] of FACES) {
    const base = b.count;
    const n = [0, 0, 0] as [number, number, number];
    n[axis] = sign;
    for (const [sa, sd] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      const p = [0, 0, 0] as [number, number, number];
      p[axis] = sign > 0 ? max[axis]! : min[axis]!;
      p[a] = sa ? max[a]! : min[a]!;
      p[d] = sd ? max[d]! : min[d]!;
      b.vertex(p, n, c, SOLID_U, SOLID_V, bone);
    }
    b.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/** An eight-sided prism: the box with its four vertical edges chamfered by `bevel`, capped top and bottom. */
function addBlock(b: Buffers, min: Vec3, max: Vec3, bevel: number, c: Color, bone: number): void {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const k = Math.min(bevel, (x1 - x0) / 2, (z1 - z0) / 2);
  const ring: [number, number][] = [
    [x1 - k, z1],
    [x1, z1 - k],
    [x1, z0 + k],
    [x1 - k, z0],
    [x0 + k, z0],
    [x0, z0 + k],
    [x0, z1 - k],
    [x0 + k, z1],
  ];
  for (let i = 0; i < 8; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % 8]!;
    const len = Math.hypot(bx - ax, bz - az);
    const n: Vec3 = [-(bz - az) / len, 0, (bx - ax) / len];
    const base = b.count;
    for (const p of [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]] as Vec3[]) b.vertex(p, n, c, SOLID_U, SOLID_V, bone);
    b.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  for (const [y, ny] of [[y1, 1], [y0, -1]] as const) {
    const base = b.count;
    for (const [x, z] of ring) b.vertex([x, y, z], [0, ny, 0], c, SOLID_U, SOLID_V, bone);
    for (let i = 1; i < 7; i++) b.index.push(...(ny > 0 ? [base, base + i, base + i + 1] : [base, base + i + 1, base + i]));
  }
}

function addSpike(b: Buffers, min: Vec3, max: Vec3, apex: Vec3, c: Color, bone: number): void {
  const y = min[1];
  const corners: Vec3[] = [
    [min[0], y, min[2]],
    [max[0], y, min[2]],
    [max[0], y, max[2]],
    [min[0], y, max[2]],
  ];
  const e1 = new Vector3();
  const e2 = new Vector3();
  for (let i = 0; i < 4; i++) {
    const p0 = corners[(i + 1) % 4]!;
    const p1 = corners[i]!;
    e1.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    e2.set(apex[0] - p0[0], apex[1] - p0[1], apex[2] - p0[2]);
    const n = e1.cross(e2).normalize();
    const base = b.count;
    for (const p of [p0, p1, apex]) b.vertex(p, [n.x, n.y, n.z], c, SOLID_U, SOLID_V, bone);
    b.index.push(base, base + 1, base + 2);
  }
  const base = b.count;
  for (const p of corners) b.vertex(p, [0, -1, 0], c, SOLID_U, SOLID_V, bone);
  b.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function addQuad(b: Buffers, centre: Vec3, w: number, h: number, uv: readonly number[], mirror: boolean, c: Color, bone: number): void {
  const [u0, v0, u1, v1] = uv as [number, number, number, number];
  const [ul, ur] = mirror ? [u1, u0] : [u0, u1];
  const [x, y, z] = centre;
  const base = b.count;
  b.vertex([x - w / 2, y - h / 2, z], [0, 0, 1], c, ul, v0, bone);
  b.vertex([x + w / 2, y - h / 2, z], [0, 0, 1], c, ur, v0, bone);
  b.vertex([x + w / 2, y + h / 2, z], [0, 0, 1], c, ur, v1, bone);
  b.vertex([x - w / 2, y + h / 2, z], [0, 0, 1], c, ul, v1, bone);
  b.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Flat-shaded triangles: one face normal per triangle, colours already linear. */
function addMesh(b: Buffers, p: Float32Array, rgb: Float32Array, c: Color, bone: number): void {
  const e1 = new Vector3();
  const e2 = new Vector3();
  for (let t = 0; t < p.length; t += 9) {
    e1.set(p[t + 3]! - p[t]!, p[t + 4]! - p[t + 1]!, p[t + 5]! - p[t + 2]!);
    e2.set(p[t + 6]! - p[t]!, p[t + 7]! - p[t + 1]!, p[t + 8]! - p[t + 2]!);
    const n = e1.cross(e2).normalize();
    const base = b.count;
    for (let v = 0; v < 9; v += 3) {
      c.setRGB(rgb[t + v]!, rgb[t + v + 1]!, rgb[t + v + 2]!);
      b.vertex([p[t + v]!, p[t + v + 1]!, p[t + v + 2]!], [n.x, n.y, n.z], c, SOLID_U, SOLID_V, bone);
    }
    b.index.push(base, base + 1, base + 2);
  }
}
