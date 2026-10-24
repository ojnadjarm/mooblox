import { BufferAttribute, BufferGeometry, Color, ConeGeometry, DodecahedronGeometry, Matrix4, Mesh, Quaternion, Vector3, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Segment } from './dressing';
import type { GroundQuery } from './occupancy';
import type { Circle } from './layout';

/** One grass tuft or pebble on open lawn. */
export interface GroundSpot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
  readonly pebble: boolean;
}

const CELL = 1.6;
const ATTRIBUTES = ['position', 'normal', 'color', 'sway'] as const;

/** Integer hash of a grid cell to [0, 1) (stable: a cell keeps its spot as the window moves). */
function cellHash(i: number, j: number, k: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Spots within `radius` of (cx, cz), ring by ring outwards, at most `cap`; one candidate per cell, kept where `open` says lawn. */
export function forEachSpot(
  cx: number,
  cz: number,
  radius: number,
  cap: number,
  open: (x: number, z: number) => boolean,
  fn: (x: number, z: number, yaw: number, scale: number, pebble: boolean) => void,
): number {
  const n = Math.ceil(radius / CELL);
  const ci = Math.floor(cx / CELL);
  const cj = Math.floor(cz / CELL);
  let count = 0;
  for (let k = 0; k <= n; k++) {
    for (let i = ci - k; i <= ci + k; i++) {
      const edge = i === ci - k || i === ci + k;
      for (let j = cj - k; j <= cj + k; j += edge ? 1 : 2 * k) {
        if (cellHash(i, j, 0) > 0.7) continue;
        const x = (i + cellHash(i, j, 1)) * CELL;
        const z = (j + cellHash(i, j, 2)) * CELL;
        if (Math.hypot(x - cx, z - cz) > radius || !open(x, z)) continue;
        fn(x, z, cellHash(i, j, 4) * Math.PI * 2, 0.7 + cellHash(i, j, 5) * 0.6, cellHash(i, j, 3) < 0.28);
        if (++count >= cap) return count;
      }
    }
  }
  return count;
}

/** The spots `forEachSpot` visits, as data. */
export function groundSpots(cx: number, cz: number, radius: number, cap: number, open: (x: number, z: number) => boolean): GroundSpot[] {
  const out: GroundSpot[] = [];
  forEachSpot(cx, cz, radius, cap, open, (x, z, yaw, scale, pebble) => out.push({ x, z, yaw, scale, pebble }));
  return out;
}

/** A lawn test narrowed to one area first (`focus`), so a refill only checks the islands, plots and walks near it. */
export interface LawnTest {
  focus(cx: number, cz: number, r: number): void;
  open(x: number, z: number): boolean;
}

/** Open lawn: inside an island, off the spawn plaza, plots, walks, bridges and anything solid. */
export function lawnTest(islands: readonly Circle[], plots: readonly { x: number; z: number }[], paths: readonly Segment[], ground: GroundQuery, plaza: number): LawnTest {
  const near = { islands: [...islands], plots: [...plots], paths: [...paths] };
  return {
    focus(cx, cz, r) {
      near.islands.length = near.plots.length = near.paths.length = 0;
      for (const c of islands) if (Math.hypot(cx - c.x, cz - c.z) < r + c.radius) near.islands.push(c);
      for (const p of plots) if (Math.hypot(cx - p.x, cz - p.z) < r + 3) near.plots.push(p);
      for (const s of paths) if (segmentDistance(cx, cz, s) < r + 2) near.paths.push(s);
    },
    open: (x, z) =>
      near.islands.some((c) => Math.hypot(x - c.x, z - c.z) < c.radius - 1.2) &&
      Math.hypot(x, z) > plaza &&
      !near.plots.some((p) => Math.hypot(x - p.x, z - p.z) < 2.6) &&
      !near.paths.some((s) => segmentDistance(x, z, s) < 1.6) &&
      !ground.hits(x, z, 0.35),
  };
}

function segmentDistance(x: number, z: number, s: Segment): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len));
  return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
}

/** Tuft (five leaning blades) and pebble shapes, vertex-coloured, with a `sway` weight rising up the blades. */
function shapes(grass: number, stone: number): { tuft: BufferGeometry; pebble: BufferGeometry } {
  const blades: BufferGeometry[] = [];
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2;
    const h = 0.26 + (b % 3) * 0.06;
    const g = new ConeGeometry(0.035, h, 3, 1).translate(0, h / 2, 0).rotateZ(0.28 * Math.cos(a)).rotateX(0.28 * Math.sin(a)).translate(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
    blades.push(g.toNonIndexed());
  }
  const tuft = mergeGeometries(blades)!;
  tuft.computeVertexNormals();
  const pebble = new DodecahedronGeometry(0.09, 0).scale(1.3, 0.55, 1).translate(0, 0.03, 0).toNonIndexed();
  pebble.computeVertexNormals();
  const lo = new Color(grass).multiplyScalar(0.62);
  const hi = new Color(grass).lerp(new Color(0xf4f0a0), 0.25);
  const k = new Color();
  for (const [g, tip, root] of [[tuft, hi, lo], [pebble, new Color(stone), new Color(stone).multiplyScalar(0.7)]] as const) {
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const sway = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, pos.getY(i) / 0.3);
      k.copy(root).lerp(tip, t);
      col.set([k.r, k.g, k.b], i * 3);
      sway[i] = g === tuft ? t * 0.35 : 0;
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.setAttribute('sway', new BufferAttribute(sway, 1));
    g.deleteAttribute('uv');
  }
  return { tuft, pebble };
}

/**
 * Grass tufts and pebbles round a moving centre, written into one preallocated mesh on the shared scenery material
 * (one draw, no program of its own), refilled when the centre moves a cell or more.
 */
export class GroundScatter {
  readonly mesh: Mesh;
  private lastX = Infinity;
  private lastZ = Infinity;
  private readonly shapes: { tuft: BufferGeometry; pebble: BufferGeometry };
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly one = new Vector3();

  constructor(
    material: Material,
    colours: { grass: number; stone: number },
    private readonly radius: number,
    private readonly cap: number,
    private readonly lawn: LawnTest,
  ) {
    this.shapes = shapes(colours.grass, colours.stone);
    const most = Math.max(this.shapes.tuft.getAttribute('position').count, this.shapes.pebble.getAttribute('position').count) * cap;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(most * 3), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(most * 3), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(most * 3), 3));
    g.setAttribute('sway', new BufferAttribute(new Float32Array(most), 1));
    g.setDrawRange(0, 0);
    this.mesh = new Mesh(g, material);
    this.mesh.name = 'ground-scatter';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
  }

  private out = 0;
  /** Appends one tuft or pebble, transformed, to the mesh buffers. */
  private readonly write = (x: number, z: number, yaw: number, scale: number, pebble: boolean): void => {
    const g = this.mesh.geometry;
    const src = pebble ? this.shapes.pebble : this.shapes.tuft;
    this.q.setFromAxisAngle(this.up, yaw);
    this.m.compose(this.v.set(x, 0, z), this.q, this.one.setScalar(scale));
    const pos = src.getAttribute('position');
    const nor = src.getAttribute('normal');
    const col = src.getAttribute('color').array;
    const sway = src.getAttribute('sway').array;
    const outPos = g.getAttribute('position').array as Float32Array;
    const outNor = g.getAttribute('normal').array as Float32Array;
    const outCol = g.getAttribute('color').array as Float32Array;
    const outSway = g.getAttribute('sway').array as Float32Array;
    for (let i = 0; i < pos.count; i++, this.out++) {
      const o = this.out;
      this.v.fromBufferAttribute(pos, i).applyMatrix4(this.m).toArray(outPos, o * 3);
      this.v.fromBufferAttribute(nor, i).applyQuaternion(this.q).toArray(outNor, o * 3);
      outCol[o * 3] = col[i * 3]!;
      outCol[o * 3 + 1] = col[i * 3 + 1]!;
      outCol[o * 3 + 2] = col[i * 3 + 2]!;
      outSway[o] = sway[i]!;
    }
  };

  update(cx: number, cz: number): void {
    if (Math.hypot(cx - this.lastX, cz - this.lastZ) < CELL) return;
    this.lastX = cx;
    this.lastZ = cz;
    const g = this.mesh.geometry;
    this.lawn.focus(cx, cz, this.radius);
    this.out = 0;
    forEachSpot(cx, cz, this.radius, this.cap, this.lawn.open, this.write);
    for (const k of ATTRIBUTES) {
      const a = g.getAttribute(k) as BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.out * a.itemSize);
      a.needsUpdate = true;
    }
    g.setDrawRange(0, this.out);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.shapes.tuft.dispose();
    this.shapes.pebble.dispose();
  }
}
