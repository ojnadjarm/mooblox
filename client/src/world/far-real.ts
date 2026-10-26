import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Group, Mesh, type Material, type Object3D } from 'three';
import type { FarView } from './far-view';
import { withFade } from './island-fade';
import { withIslandHaze } from './far-view';
import type { Circle } from './layout';

/** One island's far build (its big shapes only: no detail or minor dressing, no solids), made in the background. */
export interface FarBuild {
  readonly group: Object3D;
  readonly isBuilt: boolean;
  readonly busy: boolean;
  step(): boolean;
  unload(): void;
}

/** What the real far view needs from the world. */
export interface RealHost {
  /** Island i's far build over the far material (made on first ask, empty until built). */
  build(i: number): FarBuild;
  /** Runs `job` until done or this frame's background slice is spent. */
  run(job: () => boolean): void;
  /** A finished build is about to show: upload it before it is seen. */
  ready(group: Object3D): void;
  /** How far island i is from where the player looks out (nearest builds first). */
  distance(i: number): number;
}

/** Far builds kept past the ring, most recently in it first: walking back and forth rebuilds nothing. */
const SPARE = 6;

/**
 * The scenery material for far builds, from the scenery material before its own island fade is added: the same program
 * chain (sway, surface atlas, detail), the inverted fade (hidden where an island is live) and the per-island haze.
 */
export function farScenery(scenery: Material): Material {
  const m = scenery.clone();
  m.onBeforeCompile = scenery.onBeforeCompile;
  m.customProgramCacheKey = scenery.customProgramCacheKey;
  withFade(m, true);
  withIslandHaze(m);
  return m;
}

/**
 * Real-mesh far view (HLOD): every island in the haze ring draws its own light build (big shapes only, merged chunks over
 * one material), so a far island is real geometry at any resolution instead of a card; each fades by its nearest edge and
 * takes the aerial tint as one piece (`withIslandHaze`). Builds stream in nearest first and stay a while after leaving the ring.
 */
export class RealIslands implements FarView {
  readonly mesh = new Group();
  private readonly builds = new Map<number, FarBuild>();
  private readonly lastSeen = new Map<number, number>();
  private ring: readonly number[] = [];
  private frame = 0;

  constructor(
    private readonly islands: readonly Circle[],
    material: Material,
    private readonly host: RealHost,
  ) {
    this.mesh.name = 'far-real';
    // A hidden primer with a far build's attributes: the boot-time compile links the far program before any build shows.
    const primer = new Mesh(primerGeometry(), material);
    primer.visible = false;
    primer.castShadow = false;
    primer.receiveShadow = false;
    this.mesh.add(primer);
  }

  setRing(ring: readonly number[]): void {
    this.ring = ring;
    this.frame++;
    for (const i of ring) this.lastSeen.set(i, this.frame);
    for (const [i, b] of this.builds) b.group.visible = b.isBuilt && ring.includes(i);
  }

  step(): boolean {
    let next = -1;
    let best = Infinity;
    for (const i of this.ring) {
      const b = this.builds.get(i);
      if (b?.isBuilt || b?.busy) continue;
      const d = this.host.distance(i);
      if (d < best) {
        best = d;
        next = i;
      }
    }
    if (next < 0) return false;
    let b = this.builds.get(next);
    if (!b) {
      b = this.host.build(next);
      b.group.visible = false;
      this.mesh.add(b.group);
      this.builds.set(next, b);
    }
    const build = b;
    this.host.run(() => build.step() || build.busy);
    if (!build.isBuilt) return false;
    tag(build.group, this.islands[next]!);
    this.host.ready(build.group);
    build.group.visible = this.ring.includes(next);
    this.evict();
    return true;
  }

  /** Frees the builds past SPARE outside the ring, least recently in it first. */
  private evict(): void {
    const out = [...this.builds.keys()].filter((i) => !this.ring.includes(i)).sort((a, b) => (this.lastSeen.get(b) ?? 0) - (this.lastSeen.get(a) ?? 0));
    for (const i of out.slice(SPARE)) {
      const b = this.builds.get(i)!;
      b.unload();
      b.group.removeFromParent();
      this.builds.delete(i);
    }
  }

  dispose(): void {
    for (const b of this.builds.values()) b.unload();
    this.builds.clear();
  }
}

/** One degenerate triangle with the attributes of a far build chunk. */
function primerGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'island']) g.setAttribute(name, new Float32BufferAttribute(new Float32Array(9), 3));
  return g;
}

/** Gives every vertex of a far build its island (centre x, z and radius) for the per-island haze; far builds cast no shadow. */
function tag(group: Object3D, c: Circle): void {
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.castShadow = false;
    m.receiveShadow = false;
    const n = m.geometry.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.x, c.z, c.radius], i * 3);
    m.geometry.setAttribute('island', new BufferAttribute(a, 3));
  });
}
