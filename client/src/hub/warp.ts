/** Fires once the kid has stood on a spot for a moment; it arms only after they have been off it (no warp on arrival). */
export class Dwell {
  private held = 0;
  private armed: boolean;

  constructor(
    private readonly seconds: number,
    startsInside = false,
  ) {
    this.armed = !startsInside;
  }

  /** Feeds one frame; true on the frame the dwell completes. */
  step(inside: boolean, grounded: boolean, dt: number): boolean {
    if (!inside) {
      this.armed = true;
      this.held = 0;
      return false;
    }
    if (!this.armed || !grounded) return false;
    this.held += dt;
    if (this.held < this.seconds) return false;
    this.armed = false;
    this.held = 0;
    return true;
  }
}

/** One frame of a warp: the beam's height and width, how high the kid floats and spins, and the white-out. */
export interface WarpPose {
  readonly beam: number;
  readonly width: number;
  readonly lift: number;
  readonly spin: number;
  readonly shrink: number;
  readonly flash: number;
}

/** Seconds of a warp out (into a course) and of the arrival back in the hub. */
export const WARP_OUT = 1.1;
export const WARP_IN = 0.9;

const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp = (t: number): number => Math.min(1, Math.max(0, t));

/** The warp out at `t` seconds: the beam shoots up, the kid rises spinning and shrinks into it, the screen whites out. */
export function warpOut(t: number): WarpPose {
  const k = clamp(t / WARP_OUT);
  return {
    beam: ease(clamp(k * 3)) * 9,
    width: 0.6 + ease(clamp(k * 2)) * 0.9 - ease(clamp((k - 0.75) * 4)) * 0.6,
    lift: ease(clamp((k - 0.15) / 0.85)) * 2.2,
    spin: k * k * Math.PI * 8,
    shrink: 1 - ease(clamp((k - 0.5) * 2)) * 0.85,
    flash: ease(clamp((k - 0.55) / 0.45)),
  };
}

/** The arrival: the white-out clears while the beam drops away round the kid. */
export function warpIn(t: number): WarpPose {
  const k = clamp(t / WARP_IN);
  return { beam: (1 - ease(k)) * 9, width: 1.2 * (1 - ease(k)), lift: 0, spin: 0, shrink: 1, flash: 1 - ease(clamp(k * 1.6)) };
}

/** A course url with the flag that tells play.php the kid arrives through a portal. */
export const withWarpFlag = (url: string): string => `${url}${url.includes('?') ? '&' : '?'}warp=1`;

/** Seconds of the arrival out of a portal in a course world. */
export const EMERGE = 1.2;

/** The arrival in a course at `t` seconds: the white-out clears and the beam drops (as the hub's warp in) while the kid steps out of the portal, growing back. */
export function emerge(t: number): WarpPose & { readonly out: number; readonly portal: number } {
  const k = clamp(t / EMERGE);
  const pose = warpIn(t * (WARP_IN / EMERGE));
  return { ...pose, shrink: 0.15 + 0.85 * ease(clamp(k * 1.4)), out: ease(clamp(k * 1.25)), portal: 1 - ease(clamp((k - 0.6) / 0.4)) };
}
