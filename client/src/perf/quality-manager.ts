import type { Stage } from '../world/stage';
import { DynamicResolution, QUALITY, lowerTier, pixelRatio, type QualityTier } from './quality';

/** Where a tier step-down is remembered for the next visit. */
export type TierMemory = (tier: QualityTier) => void;

/** Applies a quality tier to the stage (pixel ratio, shadow, post), runs dynamic resolution and steps the tier down when frames stay slow. */
export class QualityManager {
  dynamic: DynamicResolution;

  constructor(
    private readonly stage: Stage,
    private current: QualityTier,
    /** Null when the tier was asked for (`?quality=`): never stepped down. */
    private readonly remember: TierMemory | null = null,
    /** Software GL: starts at the scale floor (it ends there anyway, and every step on the way is a canvas resize hitch). */
    private readonly software = false,
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

  /**
   * Feeds one frame time in ms; re-applies the pixel ratio only when dynamic resolution moves (a resize reallocates the
   * canvas: a long frame), drops a tier when it is starved and a lower one exists.
   */
  frame(frameMs: number): void {
    const moved = this.dynamic.sample(frameMs);
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
