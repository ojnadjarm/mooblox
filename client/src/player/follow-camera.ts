import { Vector3, type PerspectiveCamera } from 'three';

const DISTANCE = 10;
const HEIGHT = 4.5;
const LOOK_HEIGHT = 1.8;
const FOLLOW = 8;
const DRAG_SPEED = 0.008;

/** Third-person camera behind the player; drag on the canvas turns it. */
export class FollowCamera {
  yaw = 0;
  private readonly goal = new Vector3();
  private readonly dir = { x: 0, z: 0 };
  private readonly look = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    canvas: HTMLElement,
  ) {
    let lastX: number | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (lastX !== null) {
        this.yaw -= (e.clientX - lastX) * DRAG_SPEED;
        lastX = e.clientX;
      }
    });
    const end = (): void => {
      lastX = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Moves towards the spot behind `target`; `snap` jumps there at once. */
  follow(target: Vector3, dt: number, snap = false): void {
    this.goal.set(target.x + Math.sin(this.yaw) * DISTANCE, target.y + HEIGHT, target.z + Math.cos(this.yaw) * DISTANCE);
    this.camera.position.lerp(this.goal, snap ? 1 : 1 - Math.exp(-FOLLOW * dt));
    this.look.set(target.x, target.y + LOOK_HEIGHT, target.z);
    this.camera.lookAt(this.look);
  }

  /** Turns camera-relative input (x right, z forward) into a world direction. */
  /** Camera-relative (x, z) in world axes; the object is reused by the next call. */
  toWorld(x: number, z: number): { readonly x: number; readonly z: number } {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    this.dir.x = x * c - z * s;
    this.dir.z = -x * s - z * c;
    return this.dir;
  }
}
