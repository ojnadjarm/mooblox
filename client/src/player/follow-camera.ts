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
/** Collision: samples along the sight line, the clearance kept from walls, how fast it eases back out, the closest it comes, the fan. */
const PROBES = 10;
const CLEARANCE = 0.3;
const EASE_OUT = 2.5;
const NEAREST = 2.2;
const SIDE = 1.2;
/** Radius of the camera itself, pushed out of anything it touches every frame. */
const BODY = 0.25;
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
    this.reach = snap || clear < this.reach ? clear : damp(this.reach, clear, EASE_OUT, dt);
    const d = this.reach;
    // On the probed sight line, so a pulled-in camera rises towards the look point instead of dropping below what was probed.
    const y = this.look.y + ((this.pitch * this.distance - LOOK_HEIGHT) * d) / this.distance;
    this.goal.set(this.look.x + Math.sin(this.yaw) * d, y, this.look.z + Math.cos(this.yaw) * d);
    const cam = this.camera.position.lerp(this.goal, snap ? 1 : 1 - Math.exp(-FOLLOW * dt));
    // The eased camera lags its goal; it never trails further out than the clear reach.
    const out = Math.hypot(cam.x - this.look.x, cam.z - this.look.z);
    if (out > d) {
      const k = d / out;
      cam.set(this.look.x + (cam.x - this.look.x) * k, this.look.y + (cam.y - this.look.y) * k, this.look.z + (cam.z - this.look.z) * k);
    }
    if (this.collider) cam.add(this.collider.resolve(cam, cam, BODY));
    this.camera.lookAt(this.look);
  }

  /**
   * How far back the camera can sit before a solid. A blocked sight line pulls it in unless the line SIDE metres to either
   * side is clear all the way (a lamp post or thin trunk the player stays visible past) and the camera spot is clear.
   */
  private clearDistance(distance: number): number {
    if (!this.collider) return distance;
    const centre = this.lineClear(distance, 0);
    if (centre >= distance) return distance;
    const thin = centre < (distance * (PROBES - 1)) / PROBES && (this.lineClear(distance, SIDE) >= distance || this.lineClear(distance, -SIDE) >= distance);
    return thin ? distance : Math.max(NEAREST, centre);
  }

  /** How far out the line from the look point to the camera spot, shifted `side` metres sideways, is clear. */
  private lineClear(distance: number, side: number): number {
    const collider = this.collider!;
    const rise = this.pitch * distance - LOOK_HEIGHT;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const x = this.look.x + c * side;
    const z = this.look.z - s * side;
    const a = this.probeA.set(x, this.look.y, z);
    const b = this.probe;
    for (let i = 1; i <= PROBES; i++) {
      const f = i / PROBES;
      b.set(x + s * distance * f, this.look.y + rise * f, z + c * distance * f);
      // A capsule that cuts straight through a face gets no push, so the end point is probed on its own too.
      if (collider.resolve(a, b, CLEARANCE).lengthSq() > 1e-6 || collider.resolve(b, b, CLEARANCE).lengthSq() > 1e-6) {
        return (distance * (i - 1)) / PROBES;
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
