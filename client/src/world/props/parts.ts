import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../material-kit';

/** Collects painted, placed primitives and merges them into one mesh (one draw call). */
export class Parts {
  private readonly list: BufferGeometry[] = [];

  box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, yaw = 0, pitch = 0): this {
    return this.add(new BoxGeometry(w, h, d), color, x, y, z, yaw, pitch);
  }

  cylinder(r: number, h: number, color: number, x: number, y: number, z: number, segments = 12): this {
    return this.add(new CylinderGeometry(r, r, h, segments), color, x, y, z);
  }

  add(g: BufferGeometry, color: number, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): this {
    const q = new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, 'YXZ'));
    g.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1)));
    this.list.push(paint(g, color));
    return this;
  }

  /** Primitives collected so far. */
  get size(): number {
    return this.list.length;
  }

  /** Moves another set's primitives in after this one's, shifted by (x, z). */
  append(other: Parts, x: number, z: number): this {
    for (const g of other.list.splice(0)) this.list.push(g.translate(x, 0, z));
    return this;
  }

  /** Merges everything into one mesh; `userData.head` is the draw count without the last `tail` primitives. */
  mesh(name: string, material: Material, tail = 0): Mesh {
    const mixed = this.list.some((g) => !g.index);
    const parts = mixed ? this.list.map((g) => (g.index ? g.toNonIndexed() : g)) : this.list;
    const head = parts.slice(0, parts.length - tail).reduce((n, g) => n + (g.index ? g.index.count : g.getAttribute('position').count), 0);
    const merged = mergeGeometries(parts, false);
    for (const g of this.list) {
      g.dispose();
    }
    if (!merged) {
      throw new Error(`mooblox: cannot merge ${name}`);
    }
    const mesh = new Mesh(merged, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData['head'] = head;
    return mesh;
  }
}
