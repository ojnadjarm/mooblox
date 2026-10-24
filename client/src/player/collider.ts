import { Box3, BufferGeometry, Line3, Vector3, type Mesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

/** Pushes a capsule out of static geometry. */
export interface Collider {
  /** Offset that moves the capsule (segment start..end, radius) out of every surface it overlaps. */
  resolve(start: Vector3, end: Vector3, radius: number): Vector3;
}

/** Static world collision over a three-mesh-bvh tree (the library's characterMovement approach). */
export class BvhCollider implements Collider {
  private readonly bvh: MeshBVH;
  private readonly segment = new Line3();
  private readonly box = new Box3();
  private readonly triPoint = new Vector3();
  private readonly capPoint = new Vector3();

  constructor(geometry: BufferGeometry) {
    this.bvh = new MeshBVH(geometry);
  }

  /** Merges the world-space positions of `meshes` into one collision geometry. */
  static fromMeshes(meshes: readonly Object3D[]): BvhCollider {
    const parts: BufferGeometry[] = [];
    for (const root of meshes) {
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) {
          const g = new BufferGeometry();
          g.setAttribute('position', mesh.geometry.getAttribute('position').clone());
          const index = mesh.geometry.getIndex();
          if (index) {
            g.setIndex(index.clone());
          }
          parts.push(g.applyMatrix4(mesh.matrixWorld));
        }
      });
    }
    const merged = mergeGeometries(parts, false);
    if (!merged) {
      throw new Error('mooblox: no collision geometry');
    }
    return new BvhCollider(merged);
  }

  resolve(start: Vector3, end: Vector3, radius: number): Vector3 {
    const seg = this.segment.set(start.clone(), end.clone());
    this.box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);
    this.box.min.addScalar(-radius);
    this.box.max.addScalar(radius);
    this.bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(this.box),
      intersectsTriangle: (tri) => {
        const distance = tri.closestPointToSegment(seg, this.triPoint, this.capPoint);
        if (distance < radius) {
          const dir = this.capPoint.sub(this.triPoint).normalize();
          const depth = radius - distance;
          seg.start.addScaledVector(dir, depth);
          seg.end.addScaledVector(dir, depth);
        }
        return false;
      },
    });
    return seg.start.clone().sub(start);
  }
}
