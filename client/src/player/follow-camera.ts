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
/** Share of the half-width the look-ahead may shift the player off centre across the view. */
const FRAME = 0.5;
/** Views narrower than this (tan of the half-angle across) swing round behind a sideways run, the narrower the more (a portrait phone 0.74). */
const WIDE = 1;
/** Collision: samples along the sight line, the clearance kept from walls, how fast it eases back out, the closest it comes, the fan. */
const PROBES = 10;
const CLEARANCE = 0.3;
const EASE_OUT = 2.5;
/** How fast it glides in when a wall cuts the sight line: a dolly of a few frames, not a cut. */
const PULL_IN = 20;
const NEAREST = 2.2;
const SIDE = 1.2;
/** Radius of the camera itself, pushed out of anything it touches every frame. */
const BODY = 0.25;
/** Seconds between sight-line probes (10 a second is plenty for an eased camera); a blocked one checks one side line per frame after. */
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
  /** Probe in progress: 0 = none, 1 / 2 = the centre line was blocked at `centre`, the +SIDE / -SIDE line is next. */
  private pending = 0;
  private centre = 0;
  private aheadX = 0;
  private aheadZ = 0;
  private dragging = false;
  /** Look-ahead along the view when the last probe started. */
  private probedAlong = 0;
  private readonly goal = new Vector3();
  private readonly dir = { x: 0, z: 0 };
  private readonly look = new Vector3();
  private readonly probe = new Vector3();
  private readonly probeA = new Vector3();

  /** Where the camera is. */
  get eye(): Vector3 {
    return this.camera.position;
  }

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
      this.dragging = true;
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
      this.dragging = false;
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

  /** Moves towards the spot behind `target`, looking ahead along `velocity` (a narrow view also turns with it); `snap` jumps there at once. */
  follow(target: Vector3, dt: number, snap = false, velocity?: { readonly x: number; readonly z: number }): void {
    const k = snap ? 1 : 1 - Math.exp(-LOOK_AHEAD_RATE * dt);
    this.aheadX += ((velocity ? velocity.x * Feel.lookAhead : 0) - this.aheadX) * k;
    this.aheadZ += ((velocity ? velocity.z * Feel.lookAhead : 0) - this.aheadZ) * k;
    const wide = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect;
    const swing = 1 - wide / WIDE;
    if (velocity && !snap && !this.dragging && swing > 0) {
      // A leash on a narrow view: it turns by part of the angle a sideways run sweeps round it.
      this.yaw -= (swing * (velocity.x * Math.cos(this.yaw) - velocity.z * Math.sin(this.yaw)) * dt) / this.distance;
    }
    // Across the view the look-ahead stays inside the frame (narrow screens, a pulled-in camera).
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const across = this.aheadX * rx + this.aheadZ * rz;
    const half = FRAME * wide;
    // Soft cap: nearly unchanged well inside it; recapped below once the reach is known.
    const was = across / (half * this.reach);
    const kept = across / Math.sqrt(Math.sqrt(1 + was * was * was * was)) - across;
    // A camera pulled in closer than the default looks ahead (and lags) in proportion, so it never ends up beside or past the player.
    const near = Math.min(1, this.reach / DISTANCE);
    const ahead = this.aheadX * rz - this.aheadZ * rx;
    const along = ahead * near;
    const trim = ahead - along;
    this.look.set(target.x + this.aheadX + rx * kept - rz * trim, target.y + LOOK_HEIGHT, target.z + this.aheadZ + rz * kept + rx * trim);
    this.sinceProbe += dt;
    if (snap) {
      this.pending = 0;
      this.sinceProbe = 0;
      this.probedAlong = along;
      this.clear = this.clearDistance(this.distance);
    } else if (this.pending > 0) {
      this.probeSide();
    } else if (this.sinceProbe >= PROBE_EVERY) {
      this.sinceProbe = 0;
      this.probedAlong = along;
      this.probeCentre();
    }
    // A blocked probe holds the wall where it found it: a look point moved since then moves the clear reach with it.
    const clear = this.clear < this.distance ? Math.max(NEAREST, this.clear + along - this.probedAlong) : this.clear;
    this.reach = snap ? clear : damp(this.reach, clear, clear < this.reach ? PULL_IN : EASE_OUT, dt);
    const d = this.reach;
    const now = across / (half * d);
    const pulled = across / Math.sqrt(Math.sqrt(1 + now * now * now * now)) - across - kept;
    // The lead along the view is recapped with this frame's reach, so a pull-in never leaves the camera beside or past the player.
    const nearNow = Math.min(1, d / DISTANCE);
    const retrim = ahead - ahead * nearNow - trim;
    this.look.set(this.look.x + rx * pulled - rz * retrim, this.look.y, this.look.z + rz * pulled + rx * retrim);
    // On the probed sight line, so a pulled-in camera rises towards the look point instead of dropping below what was probed.
    const y = this.look.y + ((this.pitch * this.distance - LOOK_HEIGHT) * d) / this.distance;
    this.goal.set(this.look.x + Math.sin(this.yaw) * d, y, this.look.z + Math.cos(this.yaw) * d);
    const cam = this.camera.position.lerp(this.goal, snap ? 1 : 1 - Math.exp((-FOLLOW * dt) / nearNow));
    // The eased camera lags its goal; it never trails further out than the clear reach.
    // Math.hypot allocates its argument list; the sum of squares does not.
    const ox = cam.x - this.look.x;
    const oz = cam.z - this.look.z;
    const out = Math.sqrt(ox * ox + oz * oz);
    if (out > d) {
      const k = d / out;
      cam.set(this.look.x + (cam.x - this.look.x) * k, this.look.y + (cam.y - this.look.y) * k, this.look.z + (cam.z - this.look.z) * k);
    }
    if (this.collider) cam.add(this.collider.resolve(cam, cam, BODY));
    this.camera.lookAt(this.look);
  }

  /** First step of a spread-out probe: the centre line; a blocked one leaves the side lines to the next frames. */
  private probeCentre(): void {
    if (!this.collider) return;
    const d = this.distance;
    const centre = this.lineClear(d, 0);
    if (centre >= d) {
      this.clear = d;
    } else if (centre >= (d * (PROBES - 1)) / PROBES) {
      this.clear = Math.max(NEAREST, centre);
    } else {
      this.centre = centre;
      this.pending = 1;
    }
  }

  /** Next step of a spread-out probe: one side line; a clear one means a thin occluder (stay out), both blocked pull in. */
  private probeSide(): void {
    const d = this.distance;
    if (this.lineClear(d, this.pending === 1 ? SIDE : -SIDE) >= d) {
      this.clear = d;
      this.pending = 0;
    } else if (this.pending === 1) {
      this.pending = 2;
    } else {
      this.clear = Math.max(NEAREST, this.centre);
      this.pending = 0;
    }
  }

  /**
   * How far back the camera can sit before a solid, all lines at once. A blocked sight line pulls it in unless the line SIDE metres to either
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
