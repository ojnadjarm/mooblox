import { Group, InstancedMesh, Matrix4, MeshLambertMaterial, type Material } from 'three';
import type { CollectibleKind } from '../domain/rewards';
import type { QualityTier } from '../perf/quality';
import { collectibleGeometry } from './collectible-models';
import { COLLECTIBLE_TIERS, visibleSpots, type CollectibleSpot } from './collectibles';

const KINDS: readonly CollectibleKind[] = ['gem', 'crystal', 'star'];
/** Height of the float point above the ground. */
export const FLOAT_Y = 1.05;
const SCALE: Record<CollectibleKind, number> = { gem: 1, crystal: 1.25, star: 1.1 };
/** Move the camera this far before the visible set is picked again. */
const REPICK = 2;

/** Vertex colours, slightly self-lit; spin and bob run in the vertex shader from the instance position. */
function bobMaterial(time: { value: number }): Material {
  const m = new MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3450 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nfloat mbPhase() {\n#ifdef USE_INSTANCING\n  return instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.4;\n#else\n  return 0.0;\n#endif\n}\nvec3 mbSpin(vec3 v, float a) { float c = cos(a); float s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nfloat mbA = uTime * 1.6 + mbPhase();\nobjectNormal = mbSpin(objectNormal, mbA);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = mbSpin(transformed, mbA);\ntransformed.y += sin(uTime * 2.2 + mbPhase()) * 0.12;');
  };
  m.customProgramCacheKey = () => 'mooblox-collectible';
  return m;
}

/** The collectibles waiting in the world: one instanced draw per kind, nearest first within the tier's cap and distance. */
export class CollectibleLayer {
  readonly group = new Group();
  private readonly meshes: Record<CollectibleKind, InstancedMesh>;
  private readonly material: Material;
  private spots: CollectibleSpot[] = [];
  private readonly order = new Int32Array(COLLECTIBLE_TIERS.xhigh.max);
  private readonly dist = new Float32Array(COLLECTIBLE_TIERS.xhigh.max);
  private shown = 0;
  private readonly at = { x: Infinity, z: Infinity, tier: '' };
  private readonly matrix = new Matrix4();

  constructor(time: { value: number }) {
    this.group.name = 'collectibles';
    this.material = bobMaterial(time);
    const make = (kind: CollectibleKind) => {
      const mesh = new InstancedMesh(collectibleGeometry(kind), this.material, COLLECTIBLE_TIERS.xhigh.max);
      mesh.name = `collectible-${kind}`;
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    this.meshes = { gem: make('gem'), crystal: make('crystal'), star: make('star') };
  }

  /** Spots still to pick up (unlocked, not found). */
  set(spots: readonly CollectibleSpot[]): void {
    this.spots = [...spots];
    this.at.x = Infinity;
  }

  /** Takes one spot out at once (picked up). */
  remove(key: string): void {
    const i = this.spots.findIndex((s) => s.key === key);
    if (i < 0) return;
    this.spots.splice(i, 1);
    this.shown = 0;
    this.at.x = Infinity;
  }

  get remaining(): readonly CollectibleSpot[] {
    return this.spots;
  }

  /** Re-picks the visible set when the camera moved far enough or the tier changed; returns whether instances changed. */
  update(x: number, z: number, tier: QualityTier): boolean {
    if (Math.hypot(x - this.at.x, z - this.at.z) < REPICK && this.at.tier === tier) return false;
    this.at.x = x;
    this.at.z = z;
    this.at.tier = tier;
    this.shown = visibleSpots(this.spots, x, z, tier, this.order, this.dist);
    const counts = { gem: 0, crystal: 0, star: 0 };
    for (let i = 0; i < this.shown; i++) {
      const s = this.spots[this.order[i]!]!;
      const k = SCALE[s.kind];
      this.matrix.makeScale(k, k, k).setPosition(s.x, FLOAT_Y, s.z);
      this.meshes[s.kind].setMatrixAt(counts[s.kind]++, this.matrix);
    }
    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      mesh.count = counts[kind];
      mesh.visible = counts[kind] > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    return true;
  }

  /** The shown spot within `reach` of (x, z), or null. */
  touching(x: number, z: number, reach: number): CollectibleSpot | null {
    for (let i = 0; i < this.shown; i++) {
      const s = this.spots[this.order[i]!];
      if (s && Math.hypot(s.x - x, s.z - z) <= reach) return s;
    }
    return null;
  }

  /** Draw calls the layer adds now. */
  get draws(): number {
    return KINDS.filter((k) => this.meshes[k].visible).length;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const kind of KINDS) this.meshes[kind].geometry.dispose();
    this.material.dispose();
  }
}
