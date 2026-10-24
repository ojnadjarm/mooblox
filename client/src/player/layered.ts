import { Quaternion, Vector3, type Object3D } from 'three';

const turn = new Quaternion();

/** A bone the motion layer moves, with its clip pose saved so the layer never accumulates. */
export class Layered {
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  constructor(readonly bone: Object3D) {}

  /** Puts back the clip pose before the mixer runs (tracks the clip does not animate keep it). */
  restore(): void {
    this.bone.quaternion.copy(this.q);
    this.bone.scale.copy(this.s);
  }

  /** Saves the clip pose, then adds the pitch, yaw, roll at `m[at..at+2]` (YXZ) and the stretch at `m[stretch]` (< 0: none). */
  apply(m: Float64Array, at: number, stretch: number): void {
    const b = this.bone;
    this.q.copy(b.quaternion);
    this.s.copy(b.scale);
    const px = m[at]! / 2;
    const py = m[at + 1]! / 2;
    const pz = m[at + 2]! / 2;
    const cx = Math.cos(px), sx = Math.sin(px), cy = Math.cos(py), sy = Math.sin(py), cz = Math.cos(pz), sz = Math.sin(pz);
    turn.set(sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz);
    b.quaternion.multiply(turn);
    const st = stretch < 0 ? 0 : m[stretch]!;
    b.scale.y *= 1 + st;
    b.scale.x *= 1 - st * 0.5;
    b.scale.z *= 1 - st * 0.5;
  }
}
