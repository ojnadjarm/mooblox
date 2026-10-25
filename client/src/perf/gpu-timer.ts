/** The WebGL2 timer query extension's names this module uses. */
interface TimerExt {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/** Most frames in flight before measuring pauses (results normally arrive 1-3 frames late). */
const MAX_PENDING = 6;
/** Finished results held per disjoint check: reading GPU_DISJOINT_EXT is a round trip to the GPU process (a main-thread stall). */
const BATCH = 30;

/**
 * GPU time of each frame's commands (EXT_disjoint_timer_query_webgl2): `begin` before the frame's GL work, `end` after it; finished
 * results come out of `take` later, oldest first. A batch spanning a disjoint event (power state change) is dropped.
 */
export class GpuTimer {
  private readonly free: WebGLQuery[] = [];
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private readonly held: number[] = [];

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly ext: TimerExt,
  ) {}

  /** A timer on this context, or null when the browser does not expose the extension. */
  static create(gl: WebGL2RenderingContext | null | undefined): GpuTimer | null {
    const ext = gl?.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null | undefined;
    return gl && ext ? new GpuTimer(gl, ext) : null;
  }

  begin(): void {
    if (this.active || this.pending.length >= MAX_PENDING) return;
    this.active = this.free.pop() ?? this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
  }

  end(): void {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Pushes the GPU ms of finished frames onto `out`, oldest first, in batches of 30 (each batch checked once for a disjoint). */
  take(out: number[]): void {
    const gl = this.gl;
    while (this.pending.length > 0 && gl.getQueryParameter(this.pending[0]!, gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.pending.shift()!;
      this.held.push((gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6);
      this.free.push(q);
    }
    if (this.held.length < BATCH) return;
    if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) out.push(...this.held);
    this.held.length = 0;
  }
}
