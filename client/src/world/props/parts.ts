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

  mesh(name: string, material: Material): Mesh {
    const merged = mergeGeometries(this.list, false);
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
    return mesh;
  }
}
