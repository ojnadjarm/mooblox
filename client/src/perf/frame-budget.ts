/** How much background work a frame may take: the frame target, and the slice range (ms). */
export interface BudgetPolicy {
  /** Frame interval to hold (ms), e.g. 16.7 for 60 Hz. */
  readonly target: number;
  /** Smallest slice (ms): background work never stops entirely. */
  readonly min: number;
  /** Largest slice (ms). */
  readonly max: number;
  /** Share of the interval a frame may fill (0..1): the rest is headroom for the compositor, GC and timing noise. */
  readonly fill: number;
}

/**
 * Background work time per frame, measured: the slice is what the last frame left of its interval after its own work
 * (input, player, culling, render calls), and halves after a frame that ran late, late meaning well past this device's
 * usual interval (a 30 Hz device is not late every frame). Every background job (district builds, GPU uploads, impostor
 * captures) draws from the same slice through `left`.
 */
export class FrameBudget {
  private start = 0;
  private lastStart = -1;
  private busy = 0;
  private spent = 0;
  private slice: number;
  private late = false;
  /** Running average of the frame interval (ms). */
  private usual: number;

  constructor(
    private readonly policy: BudgetPolicy,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.slice = policy.min;
    this.usual = policy.target;
  }

  /** Starts a frame: sizes this frame's slice from the last frame's interval and own work. */
  begin(): void {
    const t = this.now();
    const p = this.policy;
    if (this.lastStart >= 0) {
      const dt = t - this.lastStart;
      const usual = Math.max(p.target, this.usual);
      this.late = dt > usual * 1.25 + 1;
      // Long gaps (a hidden tab, a pause) do not move the average.
      if (dt < usual * 4) this.usual += (dt - this.usual) * 0.05;
      const room = usual * p.fill - this.busy;
      this.slice = this.late ? Math.max(p.min, this.slice / 2) : clamp(Math.min(room, this.slice * 1.5 + 0.5), p.min, p.max);
    }
    this.lastStart = t;
    this.start = t;
    this.spent = 0;
  }

  /** Ends a frame: its own work is the frame's time minus what background jobs spent. */
  end(): void {
    this.busy = Math.max(0, this.now() - this.start - this.spent);
  }

  /** Milliseconds of background work left this frame. */
  get left(): number {
    return this.slice - this.spent;
  }

  /** This frame's slice (ms). */
  get size(): number {
    return this.slice;
  }

  /** Whether the last frame ran past the target (jobs that cannot split should wait for a calm frame). */
  get wasLate(): boolean {
    return this.late;
  }

  /** Runs `job` until it returns true (done) or the slice is spent; returns whether it finished. */
  run(job: () => boolean): boolean {
    let done = false;
    while (!done && this.left > 0) {
      const t = this.now();
      done = job();
      this.spent += this.now() - t;
    }
    return done;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
