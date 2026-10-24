import { Vector3, type PerspectiveCamera } from 'three';
import type { Collider } from './collider';
import { damp, Feel, zoom } from './game-feel';

const DISTANCE = 10;
const HEIGHT = 3.8;
const LOOK_HEIGHT = 2.1;
const FOLLOW = 8;
const DRAG_SPEED = 0.008;
/** Camera height per metre of distance, between looking up at landmarks and looking down on the map. */
const PITCH_MIN = 0.12;
const PITCH_MAX = 0.85;
const LOOK_AHEAD_RATE = 3;
/** Collision: samples along the sight line, the clearance kept from walls, and how fast it eases back out. */
const PROBES = 10;
const CLEARANCE = 0.3;
const PULL_IN = 14;
const EASE_OUT = 2.5;
const NEAREST = 4.5;
/** Seconds between sight-line probes (10 a second is plenty for an eased camera). */
const PROBE_EVERY = 0.1;

/** Third-person camera behind the player: drag turns and tilts it, the wheel zooms, it looks ahead and stays out of walls. */
export class FollowCamera {
  yaw = 0;
  private distance = DISTANCE;
  private pitch = HEIGHT / DISTANCE;
  /** Distance after collision, eased: pulled in fast, let out slowly. */
  private reach = DISTANCE;
  private clear = DISTANCE;
  private sinceProbe = 0;
  private aheadX = 0;
  private aheadZ = 0;
  private readonly goal = new Vector3();
  private readonly dir = { x: 0, z: 0 };
  private readonly look = new Vector3();
  private readonly probe = new Vector3();
  private readonly probeA = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    canvas: HTMLElement,
    private readonly collider: Collider | null = null,
  ) {
    let lastX: number | null = null;
    let lastY = 0;
    canvas.addEventListener('pointerdown', (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (lastX !== null) {
        this.yaw -= (e.clientX - lastX) * DRAG_SPEED;
        this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch + (e.clientY - lastY) * DRAG_SPEED * 0.5));
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    const end = (): void => {
      lastX = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = zoom(this.distance, e.deltaY);
      },
      { passive: false },
    );
  }

  /** Moves towards the spot behind `target`, looking ahead along `velocity`; `snap` jumps there at once. */
  follow(target: Vector3, dt: number, snap = false, velocity?: { readonly x: number; readonly z: number }): void {
    const k = snap ? 1 : 1 - Math.exp(-LOOK_AHEAD_RATE * dt);
    this.aheadX += ((velocity ? velocity.x * Feel.lookAhead : 0) - this.aheadX) * k;
    this.aheadZ += ((velocity ? velocity.z * Feel.lookAhead : 0) - this.aheadZ) * k;
    this.look.set(target.x + this.aheadX, target.y + LOOK_HEIGHT, target.z + this.aheadZ);
    this.sinceProbe += dt;
    if (snap || this.sinceProbe >= PROBE_EVERY) {
      this.sinceProbe = 0;
      this.clear = this.clearDistance(this.distance);
    }
    const clear = this.clear;
    this.reach = snap ? clear : damp(this.reach, clear, clear < this.reach ? PULL_IN : EASE_OUT, dt);
    const d = this.reach;
    this.goal.set(this.look.x + Math.sin(this.yaw) * d, target.y + this.pitch * d, this.look.z + Math.cos(this.yaw) * d);
    this.camera.position.lerp(this.goal, snap ? 1 : 1 - Math.exp(-FOLLOW * dt));
    this.camera.lookAt(this.look);
  }

  /** How far back along the sight line the camera can sit before a solid, probed piece by piece from the look point out. */
  private clearDistance(distance: number): number {
    if (!this.collider) return distance;
    const a = this.probeA.copy(this.look);
    const b = this.probe;
    const rise = this.pitch * distance - LOOK_HEIGHT;
    for (let i = 1; i <= PROBES; i++) {
      const f = i / PROBES;
      b.set(this.look.x + Math.sin(this.yaw) * distance * f, this.look.y + rise * f, this.look.z + Math.cos(this.yaw) * distance * f);
      // A capsule that cuts straight through a face gets no push, so the end point is probed on its own too.
      if (this.collider.resolve(a, b, CLEARANCE).lengthSq() > 1e-6 || this.collider.resolve(b, b, CLEARANCE).lengthSq() > 1e-6) {
        return Math.max(NEAREST, (distance * (i - 1)) / PROBES);
      }
      a.copy(b);
    }
    return distance;
  }

  /** Camera-relative (x, z) in world axes; the object is reused by the next call. */
  toWorld(x: number, z: number): { readonly x: number; readonly z: number } {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    this.dir.x = x * c - z * s;
    this.dir.z = -x * s - z * c;
    return this.dir;
  }
}
