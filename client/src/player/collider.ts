import { Box3, BufferGeometry, Line3, Vector3, type BufferAttribute, type Mesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BVH, ExtendedTriangle, MeshBVH } from 'three-mesh-bvh';

/** Pushes a capsule out of static geometry. */
export interface Collider {
  /** Offset that moves the capsule (segment start..end, radius) out of every surface it overlaps; valid until the next call. */
  resolve(start: Vector3, end: Vector3, radius: number): Vector3;
}

/** Static world collision over a three-mesh-bvh tree (the library's characterMovement approach). */
export class BvhCollider implements Collider {
  private readonly bvh: MeshBVH;
  private readonly segment = new Line3();
  private readonly box = new Box3();
  private readonly triPoint = new Vector3();
  private readonly capPoint = new Vector3();
  private readonly dir = new Vector3();
  private readonly push = new Vector3();
  private radius = 0;
  private readonly tri = new ExtendedTriangle();
  private readonly index: BufferAttribute;
  private readonly position: BufferAttribute;
  /** Built once: MeshBVH.shapecast would wrap the callbacks in fresh objects and closures on every call. */
  private readonly callbacks = {
    intersectsBounds: (b: Box3) => b.intersectsBox(this.box),
    intersectsRange: (offset: number, count: number) => {
      const { index, position, tri, segment: seg } = this;
      for (let i = offset * 3, end = (offset + count) * 3; i < end; i += 3) {
        tri.a.fromBufferAttribute(position, index.getX(i));
        tri.b.fromBufferAttribute(position, index.getX(i + 1));
        tri.c.fromBufferAttribute(position, index.getX(i + 2));
        tri.needsUpdate = true;
        const distance = tri.closestPointToSegment(seg, this.triPoint, this.capPoint);
        if (distance < this.radius) {
          const dir = this.dir.subVectors(this.capPoint, this.triPoint).normalize();
          const depth = this.radius - distance;
          seg.start.addScaledVector(dir, depth);
          seg.end.addScaledVector(dir, depth);
        }
      }
      return false;
    },
  };

  constructor(geometry: BufferGeometry) {
    this.bvh = new MeshBVH(geometry);
    this.index = geometry.getIndex() as BufferAttribute;
    this.position = geometry.getAttribute('position') as BufferAttribute;
  }

  /** Merges the world-space positions of `meshes` and of the world-space `extra` geometries into one collision geometry. */
  static fromMeshes(meshes: readonly Object3D[], extra: readonly BufferGeometry[] = []): BvhCollider {
    const parts: BufferGeometry[] = extra.map((g) => {
      const p = new BufferGeometry();
      p.setAttribute('position', g.getAttribute('position'));
      return p;
    });
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
          parts.push((index ? g.toNonIndexed() : g).applyMatrix4(mesh.matrixWorld));
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
    const seg = this.segment;
    seg.start.copy(start);
    seg.end.copy(end);
    this.radius = radius;
    this.box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);
    this.box.min.addScalar(-radius);
    this.box.max.addScalar(radius);
    BVH.prototype.shapecast.call(this.bvh, this.callbacks);
    return this.push.subVectors(seg.start, start);
  }
}
