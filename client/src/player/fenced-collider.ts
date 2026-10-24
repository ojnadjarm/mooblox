import type { Vector3 } from 'three';
import type { AccessFence } from '../world/access-fence';
import type { Collider } from './collider';

/** Decorates the world collider with the access fence, so no move, jump or fall ends inside a closed zone. */
export class FencedCollider implements Collider {
  private readonly at = { x: 0, z: 0 };

  constructor(
    private inner: Collider,
    private readonly fence: AccessFence,
  ) {}

  /** Swaps the static world collider after a rebuild. */
  setInner(inner: Collider): void {
    this.inner = inner;
  }

  resolve(start: Vector3, end: Vector3, radius: number): Vector3 {
    const push = this.inner.resolve(start, end, radius);
    // Pass the point as an object: doubles handed to a non-inlined call are boxed on every step.
    this.at.x = start.x + push.x;
    this.at.z = start.z + push.z;
    const fence = this.fence.pushPoint(this.at, radius);
    push.x += fence.x;
    push.z += fence.z;
    return push;
  }
}
