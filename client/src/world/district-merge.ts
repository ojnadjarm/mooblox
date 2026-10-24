import { BufferAttribute, BufferGeometry } from 'three';
import { MeshBVH, type SerializedBVH } from 'three-mesh-bvh';

/** One placed part of a district as plain arrays (non-indexed, world space). */
export interface PartArrays {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly color: Float32Array;
  readonly colorSize: number;
  readonly sway: Float32Array;
  /** Surface ids per vertex (rich tiers' detail shading); null when untagged. */
  readonly surface: Float32Array | null;
}

/** One merged mesh's arrays. */
export interface MeshArrays {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly color: Float32Array;
  readonly colorSize: number;
  readonly sway: Float32Array;
  readonly surface: Float32Array | null;
}

/** A district's solids and the collision BVH over them (built in the build worker). */
export interface SolidsTree {
  readonly position: Float32Array;
  readonly bvh: SerializedBVH;
}

/** A float array that grows as parts append to it (amortized copies, no merge pass at the end). */
class Floats {
  private data = new Float32Array(1024);
  private n = 0;

  push(a: Float32Array): void {
    if (this.n + a.length > this.data.length) {
      const grown = new Float32Array(Math.max(this.n + a.length, this.data.length * 2));
      grown.set(this.data.subarray(0, this.n));
      this.data = grown;
    }
    this.data.set(a, this.n);
    this.n += a.length;
  }

  get length(): number {
    return this.n;
  }

  /** The values so far (a view: no copy at the end of a build). */
  take(): Float32Array {
    return this.data.subarray(0, this.n);
  }
}

/** One district mesh merged as its parts are placed: each part is appended once, in placement order. */
export class MeshMerge {
  private readonly position = new Floats();
  private readonly normal = new Floats();
  private readonly color = new Floats();
  private readonly sway = new Floats();
  private readonly surface = new Floats();
  private colorSize = 0;
  private tagged = true;

  add(p: PartArrays): void {
    this.colorSize ||= p.colorSize;
    this.position.push(p.position);
    this.normal.push(p.normal);
    this.color.push(p.color);
    this.sway.push(p.sway);
    if (p.surface) this.surface.push(p.surface);
    else this.tagged = false;
  }

  /** The merged arrays; null when nothing was added. */
  finish(): MeshArrays | null {
    if (!this.position.length) return null;
    return {
      position: this.position.take(),
      normal: this.normal.take(),
      color: this.color.take(),
      colorSize: this.colorSize,
      sway: this.sway.take(),
      surface: this.tagged ? this.surface.take() : null,
    };
  }
}

/** Solid triangles gathered as parts are placed. */
export class SolidsMerge {
  private readonly position = new Floats();

  add(position: Float32Array): void {
    this.position.push(position);
  }

  /** The solids' positions; null when there are none. */
  finish(): Float32Array | null {
    return this.position.length ? this.position.take() : null;
  }
}

/** Builds the collision BVH over a district's solids (pure; runs in the build worker). */
export function solidsTree(position: Float32Array): SolidsTree {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  const bvh = new MeshBVH(g);
  return { position, bvh: MeshBVH.serialize(bvh, { cloneBuffers: false }) };
}

/** Every buffer of a tree, for a zero-copy transfer. */
export function transferables(t: SolidsTree): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>([t.position.buffer as ArrayBuffer]);
  if (t.bvh.index) out.add((t.bvh.index as ArrayBufferView).buffer as ArrayBuffer);
  if (t.bvh.indirectBuffer) out.add((t.bvh.indirectBuffer as ArrayBufferView).buffer as ArrayBuffer);
  for (const root of t.bvh.roots) out.add(root as ArrayBuffer);
  return [...out];
}
