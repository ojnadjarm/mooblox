import { Color, DynamicDrawUsage, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, type BufferGeometry, type Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A point smoke rises from: a chimney top or a campfire. */
export interface SmokeSource {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly kind: 'chimney' | 'campfire';
}

/** The breeze every puff drifts with (m/s, world x and z); the flags and sails lean the same way. */
export const WIND = { x: 0.55, z: 0.25 } as const;

/** Puff look per source kind: seconds a puff lives, rise speed (m/s), its size (m) when born and fully grown, and how high (m) above the source it is born. */
const KIND = {
  chimney: { life: 5, rise: 0.75, born: 0.28, grown: 1.15, start: 0 },
  campfire: { life: 3.6, rise: 0.85, born: 0.22, grown: 0.9, start: 0.75 },
} as const;
/** Puffs alive per source by tier (low draws no smoke). */
const PER_SOURCE: Readonly<Record<string, number>> = { medium: 6, high: 9, xhigh: 10 };
/** Sources further than this (m) from the camera are skipped. */
const DRAW = 70;
/** Peak puff opacity. */
const OPACITY = 0.75;

/** Where one puff is `age` (0..1) through its life: offset from the source, size and opacity. */
export interface Puff {
  dx: number;
  dy: number;
  dz: number;
  size: number;
  alpha: number;
}

/** Pure puff motion: rises, eases into the wind, wobbles a little, grows, fades in fast and out slowly. */
export function puffAt(kind: SmokeSource['kind'], age: number, seed: number, out: Puff): Puff {
  const k = KIND[kind];
  const t = age * k.life;
  const lean = t * t * 0.12 + t * 0.1;
  const wobble = Math.sin(seed * 6.28 + t * 1.7) * 0.18 * age;
  out.dx = WIND.x * lean + wobble * WIND.z * 2;
  out.dz = WIND.z * lean - wobble * WIND.x * 2;
  out.dy = k.start + k.rise * t * (1 - age * 0.35);
  out.size = k.born + (k.grown - k.born) * Math.sqrt(age);
  out.alpha = Math.min(1, age / 0.1) * (1 - age) ** 1.5 * OPACITY;
  return out;
}

/** A soft round puff: a smooth-shaded icosphere. */
function puffGeometry(): BufferGeometry {
  const g = new IcosahedronGeometry(0.5, 1);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const smooth = mergeVertices(g);
  smooth.computeVertexNormals();
  g.dispose();
  return smooth;
}

/** Lambert puffs with a per-instance fade and edges that thin out towards the silhouette (no hard outline). */
function puffMaterial(): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: new Color(0xf3efe8), transparent: true, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\ndiffuseColor.a *= vFade * smoothstep(0.05, 0.75, abs(dot(normal, normalize(vViewPosition))));');
  };
  m.customProgramCacheKey = () => 'mooblox-smoke';
  return m;
}

/** Every chimney's and campfire's smoke as one instanced draw; puffs past the draw distance are skipped. */
export class Smoke {
  readonly mesh: InstancedMesh;
  private readonly fade: InstancedBufferAttribute;
  private readonly per: number;
  private readonly puff: Puff = { dx: 0, dy: 0, dz: 0, size: 0, alpha: 0 };
  private readonly m = new Matrix4();

  constructor(
    private readonly sources: readonly SmokeSource[],
    tier: string,
  ) {
    this.per = PER_SOURCE[tier] ?? 0;
    const n = Math.max(1, sources.length * this.per);
    const geometry = puffGeometry();
    this.fade = new InstancedBufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute('aFade', this.fade);
    this.mesh = new InstancedMesh(geometry, puffMaterial(), n);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.name = 'smoke';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
  }

  /** Places every live puff at time `t` (s), nearest sources only. */
  update(t: number, eye: Vector3): void {
    let n = 0;
    const p = this.puff;
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i]!;
      if (Math.hypot(s.x - eye.x, s.z - eye.z) > DRAW) continue;
      const life = KIND[s.kind].life;
      for (let k = 0; k < this.per; k++) {
        const seed = (i * 0.618 + k * 0.137) % 1;
        const age = (t / life + k / this.per + i * 0.29) % 1;
        puffAt(s.kind, age, seed, p);
        this.m.makeScale(p.size, p.size * 0.9, p.size).setPosition(s.x + p.dx, s.y + p.dy, s.z + p.dz);
        this.mesh.setMatrixAt(n, this.m);
        this.fade.setX(n, p.alpha);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fade.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
  }
}
