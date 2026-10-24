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
  ) {
    this.dynamic = new DynamicResolution(QUALITY[current].minScale);
    this.apply();
  }

  get tier(): QualityTier {
    return this.current;
  }

  setTier(tier: QualityTier): void {
    this.current = tier;
    this.dynamic = new DynamicResolution(QUALITY[tier].minScale);
    this.apply();
  }

  /** Feeds one frame time in ms; re-applies the pixel ratio when dynamic resolution moves, drops a tier when it is starved. */
  frame(frameMs: number): void {
    if (!this.dynamic.sample(frameMs) && !this.dynamic.starved) {
      return;
    }
    const lower = this.dynamic.starved && this.remember ? lowerTier(this.current) : null;
    if (lower) {
      this.remember!(lower);
      this.setTier(lower);
    } else {
      this.apply();
    }
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
