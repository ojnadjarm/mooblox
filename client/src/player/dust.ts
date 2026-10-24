import { IcosahedronGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { puffScale, stepPuffs, type Puff } from './game-feel';

const MAX = 24;

/** Faceted puffs from a fixed pool in one instanced draw: cream dust at the feet, or gold sparkles over a finished activity. */
export class Dust {
  readonly mesh: InstancedMesh;
  private readonly puffs: Puff[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();

  constructor(
    colour = 0xf4e6cc,
    private readonly rise = 0.6,
    glow = 0,
  ) {
    this.mesh = new InstancedMesh(new IcosahedronGeometry(0.22, 0), new MeshLambertMaterial({ color: colour, emissive: colour, emissiveIntensity: glow, flatShading: true }), MAX);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
  }

  /** Kicks up `n` puffs round (x, y, z), spreading faster with `strength` (0..1). */
  kick(x: number, y: number, z: number, n: number, strength: number): void {
    for (let i = 0; i < n && this.puffs.length < MAX; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const v = 0.6 + strength * 2.2;
      this.puffs.push({ x, y: y + 0.1, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, age: 0, size: 0.7 + strength * 0.8 + Math.random() * 0.3 });
    }
  }

  update(dt: number): void {
    const n = stepPuffs(this.puffs, dt, this.rise);
    for (let i = 0; i < n; i++) {
      const puff = this.puffs[i]!;
      const k = puffScale(puff);
      this.m.compose(this.p.set(puff.x, puff.y, puff.z), this.q, this.s.set(k, k * 0.8, k));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
  }
}
