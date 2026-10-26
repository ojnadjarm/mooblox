import { PerspectiveCamera, Vector3 } from 'three';
import { MAP } from './map-layout';

/** Where the map camera looks from: a ground target, distance, bearing and pitch (radians, from the horizon). */
export interface MapPose {
  readonly x: number;
  readonly z: number;
  readonly distance: number;
  readonly yaw: number;
  readonly pitch: number;
}

/** Seconds of the flight to an island. */
export const FLIGHT = 1.5;
const OVERVIEW_PITCH = 0.95;
const YAW = 0.35;
/** Closest the free camera may come, and the close pose over an island. */
const NEAR = 30;
const LANDING = { distance: 2.1, pitch: 0.42 } as const;

/** Screen room (CSS px) the overview keeps round the islands (rim), round their label anchors (label) and below the title and above the hint. */
const MARGIN = { rim: 12, label: 70, top: 96, bottom: 64 } as const;
/** Closest overview distance (m): an empty map still reads as a sea. */
const OVERVIEW_MIN = 75;
/** Height (m) of the label anchors the overview keeps in view. */
const TOP = 18;

/**
 * The closest overview that shows a circle of `extent` m round the origin, label room included, in a `width` x `height` px view
 * with a vertical field of view `fov` (deg); the target slides along z so the map sits centred between the margins.
 */
export function overviewPose(extent: number, width: number, height: number, fov: number): MapPose {
  const camera = new PerspectiveCamera(fov, width / height, 0.1, 10000);
  const v = new Vector3();
  const yMax = 1 - (2 * MARGIN.top) / height;
  const yMin = -1 + (2 * MARGIN.bottom) / height;
  const ring = Math.max(0, extent - MAP.island);
  const points: [number, number, number, number][] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    points.push([Math.cos(a) * extent, 0, Math.sin(a) * extent, 1 - (2 * MARGIN.rim) / width]);
    points.push([Math.cos(a) * ring, TOP, Math.sin(a) * ring, 1 - (2 * Math.min(MARGIN.label, width * 0.08)) / width]);
  }
  const fits = (p: MapPose): boolean => {
    placeCamera(camera, p);
    camera.updateMatrixWorld();
    return points.every(([x, y, z, xMax]) => {
      v.set(x, y, z).project(camera);
      return v.z < 1 && Math.abs(v.x) <= xMax && v.y <= yMax && v.y >= yMin;
    });
  };
  let best: MapPose | null = null;
  for (let k = -6; k <= 6; k++) {
    let lo = OVERVIEW_MIN;
    let hi = extent * 12 + 400;
    const at = (d: number): MapPose => ({ x: 0, z: (k / 20) * extent, distance: d, yaw: YAW, pitch: OVERVIEW_PITCH });
    if (!fits(at(hi))) continue;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(at(mid))) hi = mid;
      else lo = mid;
    }
    if (!best || hi < best.distance) best = at(hi);
  }
  return best ?? { x: 0, z: 0, distance: extent * 4 + 60, yaw: YAW, pitch: OVERVIEW_PITCH };
}

/** The pose a flight to an island of `radius` at (x, z) ends in: low over its front, facing it as seen from the map. */
export function landingPose(from: MapPose, x: number, z: number, radius: number): MapPose {
  return { x, z, distance: radius * LANDING.distance, yaw: from.yaw, pitch: LANDING.pitch };
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The flight's pose at `t` (0..1): the target glides in, the distance shrinks on a curve and the pitch levels out late. */
export function flightPose(a: MapPose, b: MapPose, t: number): MapPose {
  const k = ease(Math.min(1, Math.max(0, t)));
  const late = ease(Math.min(1, Math.max(0, t * 1.4 - 0.4)));
  return {
    x: a.x + (b.x - a.x) * k,
    z: a.z + (b.z - a.z) * k,
    distance: a.distance * Math.pow(b.distance / a.distance, k),
    yaw: a.yaw + (b.yaw - a.yaw) * k,
    pitch: a.pitch + (b.pitch - a.pitch) * late,
  };
}

/** Puts a camera at a pose. */
export function placeCamera(camera: PerspectiveCamera, p: MapPose): void {
  const flat = Math.cos(p.pitch) * p.distance;
  camera.position.set(p.x + Math.sin(p.yaw) * flat, Math.sin(p.pitch) * p.distance, p.z + Math.cos(p.yaw) * flat);
  camera.lookAt(p.x, 0, p.z);
}

/** The map's camera: overview, drag pan, wheel and pinch zoom inside the map, and the flight to a picked island. */
export class MapCamera {
  private pose: MapPose;
  private home: MapPose;
  private flight: { from: MapPose; to: MapPose; t: number; done: () => void } | null = null;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly extent: number,
  ) {
    this.home = this.pose = overviewPose(extent, 1366, 768, camera.fov);
  }

  get current(): MapPose {
    return this.pose;
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  /** Fits the whole map into a view of `width` x `height` CSS px again (after a resize). */
  frame(width: number, height: number): void {
    if (this.flight) return;
    this.home = this.pose = overviewPose(this.extent, width, height, this.camera.fov);
  }

  /** Moves the target by a screen drag of (dx, dy) px in a view `height` px tall. */
  pan(dx: number, dy: number, height: number): void {
    if (this.flight) return;
    const metres = (2 * this.pose.distance * Math.tan((this.camera.fov * Math.PI) / 360)) / height;
    const s = Math.sin(this.pose.yaw);
    const c = Math.cos(this.pose.yaw);
    const fx = -dx * metres;
    const fz = (-dy * metres) / Math.sin(this.pose.pitch);
    let x = this.pose.x + fx * c + fz * s;
    let z = this.pose.z - fx * s + fz * c;
    const d = Math.hypot(x, z);
    if (d > this.extent) {
      x *= this.extent / d;
      z *= this.extent / d;
    }
    this.pose = { ...this.pose, x, z };
  }

  /** Zooms by `factor` (< 1 = closer), between the near limit and the overview. */
  zoom(factor: number): void {
    if (this.flight) return;
    this.pose = { ...this.pose, distance: Math.min(this.home.distance * 1.15, Math.max(NEAR, this.pose.distance * factor)) };
  }

  /** Flies to an island and calls `done` on arrival. */
  flyTo(x: number, z: number, radius: number, done: () => void): void {
    this.flight = { from: this.pose, to: landingPose(this.pose, x, z, radius), t: 0, done };
  }

  /** Advances the flight and places the camera. */
  update(dt: number): void {
    const f = this.flight;
    if (f) {
      f.t = Math.min(1, f.t + dt / FLIGHT);
      this.pose = flightPose(f.from, f.to, f.t);
      if (f.t >= 1) {
        this.flight = null;
        f.done();
      }
    }
    placeCamera(this.camera, this.pose);
  }
}
