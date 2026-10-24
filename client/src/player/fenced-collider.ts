import { Vector3 } from 'three';
import type { AccessFence } from '../world/access-fence';
import type { Collider } from './collider';

/** Decorates the world collider with the access fence, so no move, jump or fall ends inside a closed zone. */
export class FencedCollider implements Collider {
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
    const fence = this.fence.push(start.x + push.x, start.z + push.z, radius);
    return push.add(new Vector3(fence.x, 0, fence.z));
  }
}
