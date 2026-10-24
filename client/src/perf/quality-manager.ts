import type { Stage } from '../world/stage';
import { DynamicResolution, QUALITY, pixelRatio, type QualityTier } from './quality';

/** Applies a quality tier to the stage (pixel ratio, shadow) and runs dynamic resolution. */
export class QualityManager {
  readonly dynamic = new DynamicResolution();

  constructor(
    private readonly stage: Stage,
    private current: QualityTier,
  ) {
    this.apply();
  }

  get tier(): QualityTier {
    return this.current;
  }

  setTier(tier: QualityTier): void {
    this.current = tier;
    this.dynamic.scale = 1;
    this.apply();
  }

  /** Feeds one frame time in ms; re-applies the pixel ratio when dynamic resolution moves. */
  frame(frameMs: number): void {
    if (this.dynamic.sample(frameMs)) {
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
  }
}
