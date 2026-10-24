export type FrameFn = (dt: number) => void;
type Raf = (cb: (t: number) => void) => number;
type Caf = (handle: number) => void;

const MAX_DT = 0.1;

/** Render loop that runs continuously while playing and only on demand while paused (0 GPU behind a panel). */
export class FrameGate {
  private handle: number | null = null;
  private running = false;
  private paused = false;
  private dirty = false;
  private last: number | null = null;
  private count = 0;

  constructor(
    private readonly frame: FrameFn,
    private readonly raf: Raf = (cb) => requestAnimationFrame(cb),
    private readonly caf: Caf = (h) => cancelAnimationFrame(h),
  ) {}

  /** Frames drawn so far. */
  get frames(): number {
    return this.count;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  start(): void {
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.handle !== null) {
      this.caf(this.handle);
      this.handle = null;
    }
  }

  /** Stops continuous rendering; `invalidate()` still draws single frames. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.last = null;
    this.schedule();
  }

  /** Requests one frame, also while paused. */
  invalidate(): void {
    this.dirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.handle === null && this.running && (!this.paused || this.dirty)) {
      this.handle = this.raf(this.onFrame);
    }
  }

  private readonly onFrame = (t: number): void => this.tick(t);

  private tick(t: number): void {
    this.handle = null;
    const dt = this.last === null || this.paused ? 0 : Math.min(MAX_DT, (t - this.last) / 1000);
    this.last = this.paused ? null : t;
    this.dirty = false;
    this.count++;
    this.frame(dt);
    this.schedule();
  }
}
