import { Box3, Vector3 } from 'three';
import type { Collider } from './collider';

/** One static collider and the world box it covers. */
export interface ColliderPart {
  readonly collider: Collider;
  readonly bounds: Box3;
}

/** Static world collision made of parts that come and go (streamed districts): each part the capsule touches pushes in turn. */
export class CompositeCollider implements Collider {
  private parts: readonly ColliderPart[] = [];
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly box = new Box3();
  private readonly push = new Vector3();

  /** Replaces the parts (after a district was built or freed). */
  set(parts: readonly ColliderPart[]): void {
    this.parts = parts;
  }

  resolve(start: Vector3, end: Vector3, radius: number): Vector3 {
    const a = this.a.copy(start);
    const b = this.b.copy(end);
    const box = this.box.makeEmpty().expandByPoint(a).expandByPoint(b);
    box.min.x -= radius + 1;
    box.min.y -= radius + 1;
    box.min.z -= radius + 1;
    box.max.x += radius + 1;
    box.max.y += radius + 1;
    box.max.z += radius + 1;
    const parts = this.parts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (!part.bounds.intersectsBox(box)) continue;
      const p = part.collider.resolve(a, b, radius);
      a.add(p);
      b.add(p);
    }
    return this.push.subVectors(a, start);
  }
}
