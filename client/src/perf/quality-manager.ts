import type { Stage } from '../world/stage';
import type { GpuTimer } from './gpu-timer';
import { DynamicResolution, QUALITY, lowerTier, pixelRatio, type QualityTier } from './quality';

/** Where a tier step-down is remembered for the next visit. */
export type TierMemory = (tier: QualityTier) => void;

/** Main-thread work of the current animation frame so far (ms): now minus the frame's time; 0 outside a frame or unknown. */
export function frameWork(): number {
  const start = globalThis.document?.timeline?.currentTime;
  return typeof start === 'number' ? Math.max(0, performance.now() - start) : 0;
}

/** Applies a quality tier to the stage (pixel ratio, shadow, post), runs dynamic resolution and steps the tier down when frames stay slow. */
export class QualityManager {
  dynamic: DynamicResolution;
  /** Newest frame GPU time (ms), null without a GPU timer or before its first result. */
  gpuMs: number | null = null;
  private readonly gpuDone: number[] = [];

  constructor(
    private readonly stage: Stage,
    private current: QualityTier,
    /** Null when the tier was asked for (`?quality=`): never stepped down. */
    private readonly remember: TierMemory | null = null,
    /** Software GL: starts at the scale floor (it ends there anyway, and every step on the way is a canvas resize hitch). */
    private readonly software = false,
    /** Called at the end of a frame's work (see `frameWork`). */
    private readonly work: () => number = frameWork,
    /** Times each frame's render pass (`begin` .. `frame`); null = frame times only. */
    private readonly timer: GpuTimer | null = null,
  ) {
    this.dynamic = this.governor(current);
    this.apply();
  }

  get tier(): QualityTier {
    return this.current;
  }

  setTier(tier: QualityTier): void {
    this.current = tier;
    this.dynamic = this.governor(tier);
    this.apply();
  }

  /** Starts timing the frame's render pass (background uploads and captures left out: their GPU time does not follow pixels). */
  begin(): void {
    this.timer?.begin();
  }

  /**
   * Feeds one frame time in ms (0 = a frame outside play, not sampled), called after the frame's work (its CPU share, or the GPU
   * timer, tells GPU-bound from CPU-bound); re-applies the pixel ratio only when dynamic resolution moves (a resize reallocates the
   * canvas: a long frame), drops a tier when it is starved and a lower one exists.
   */
  frame(frameMs: number): void {
    if (this.timer) {
      this.timer.end();
      this.timer.take(this.gpuDone);
      for (const ms of this.gpuDone) this.dynamic.gpu(ms);
      if (this.gpuDone.length > 0) this.gpuMs = this.gpuDone.at(-1)!;
      this.gpuDone.length = 0;
    }
    if (frameMs <= 0) return;
    const moved = this.dynamic.sample(frameMs, this.work());
    const lower = this.dynamic.starved && this.remember ? lowerTier(this.current) : null;
    if (lower) {
      this.remember!(lower);
      this.setTier(lower);
    } else if (moved) {
      this.apply();
    }
  }

  private governor(tier: QualityTier): DynamicResolution {
    const d = new DynamicResolution(QUALITY[tier].minScale);
    if (this.software) d.scale = QUALITY[tier].minScale;
    return d;
  }

  /** Re-reads the host size and device pixel ratio. */
  apply(): void {
    const q = QUALITY[this.current];
    this.stage.resize(pixelRatio(this.current, window.devicePixelRatio, this.dynamic.scale));
    const shadow = this.stage.sun.shadow;
    if (shadow.mapSize.x !== q.shadowMapSize) {
      shadow.map?.dispose();
      shadow.map = null;
      shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    }
    this.stage.sun.castShadow = q.shadows;
    if (!q.post) this.stage.dropPost();
  }
}
