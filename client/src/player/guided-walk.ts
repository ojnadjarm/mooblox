import { NO_INPUT, type InputSource, type InputState, type MutableInput } from './input';

/** A route point and the distance (m) at which it counts as reached. */
export interface Waypoint {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/** The camera a guided walk steers by and swings behind the kid. */
export interface WalkCamera {
  readonly yaw: number;
  behind: boolean;
}

/** Less than this much stick (squared) is no movement key. */
const DEAD = 0.01;
/** No 0.5 m of progress in 0.75 s sidesteps for 0.5 s (a solid the walk grid does not know), alternating sides; 8 s stuck gives up. */
const UNSTICK = { metres: 0.5, after: 750, side: 500, giveUp: 8000 } as const;

/** Player input that walks a route on its own until it arrives or any movement key takes over. */
export class GuidedWalk implements InputSource {
  private route: Waypoint[] = [];
  private readonly state: MutableInput = { x: 0, z: 0, run: true, jump: false, emote: -1 };
  private readonly mark = { x: 0, z: 0, t: 0, side: 1, until: 0 };

  constructor(
    private readonly manual: InputSource,
    private readonly at: () => { readonly x: number; readonly z: number },
    private readonly camera: WalkCamera,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get active(): boolean {
    return this.route.length > 0;
  }

  /** Starts walking `route` from where the player stands. */
  start(route: readonly Waypoint[]): void {
    this.route = [...route];
    const p = this.at();
    Object.assign(this.mark, { x: p.x, z: p.z, t: this.now(), until: 0 });
    this.camera.behind = this.route.length > 0;
  }

  cancel(): void {
    this.route.length = 0;
    this.camera.behind = false;
  }

  read(): InputState {
    const own = this.manual.read();
    if (this.route.length > 0 && own.x * own.x + own.z * own.z > DEAD) this.cancel();
    if (this.route.length === 0) return own;
    const p = this.at();
    let w = this.route[0]!;
    while (Math.hypot(w.x - p.x, w.z - p.z) < w.r) {
      this.route.shift();
      if (this.route.length === 0) {
        this.cancel();
        return NO_INPUT;
      }
      w = this.route[0]!;
    }
    const t = this.now();
    const m = this.mark;
    if (Math.hypot(p.x - m.x, p.z - m.z) > UNSTICK.metres) Object.assign(m, { x: p.x, z: p.z, t });
    else if (t - m.t > UNSTICK.giveUp) {
      this.cancel();
      return NO_INPUT;
    } else if (t - m.t > UNSTICK.after && t > m.until) Object.assign(m, { side: -m.side, until: t + UNSTICK.side });
    const side = t < m.until ? m.side : 0;
    const ax = w.x - p.x;
    const az = w.z - p.z;
    const dx = side ? -az * side : ax;
    const dz = side ? ax * side : az;
    const d = Math.hypot(ax, az);
    const s = Math.sin(this.camera.yaw);
    const c = Math.cos(this.camera.yaw);
    const out = this.state;
    out.x = (dx * c - dz * s) / d;
    out.z = (-dx * s - dz * c) / d;
    out.jump = own.jump;
    out.emote = own.emote ?? -1;
    return out;
  }
}
