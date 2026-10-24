import type { MaterialTier } from '../world/material-kit';

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  /** Highest device pixel ratio the canvas renders at. */
  readonly maxDpr: number;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly antialias: boolean;
  readonly materials: MaterialTier;
}

export const QUALITY: Readonly<Record<QualityTier, QualitySettings>> = {
  low: { maxDpr: 1, shadows: false, shadowMapSize: 1024, antialias: false, materials: 'low' },
  medium: { maxDpr: 1.5, shadows: true, shadowMapSize: 1024, antialias: true, materials: 'standard' },
  high: { maxDpr: 2, shadows: true, shadowMapSize: 2048, antialias: true, materials: 'standard' },
};

export const TIERS = Object.keys(QUALITY) as QualityTier[];

/** Device facts the starting tier is picked from. */
export interface DeviceHints {
  readonly query: string | null;
  readonly memoryGb: number | undefined;
  readonly cores: number;
  readonly coarse: boolean;
}

/** Starting tier: `?quality=` wins; small devices start low, touch devices medium, the rest high. */
export function pickTier(h: DeviceHints): QualityTier {
  if (h.query && (TIERS as string[]).includes(h.query)) {
    return h.query as QualityTier;
  }
  if ((h.memoryGb !== undefined && h.memoryGb <= 4) || h.cores <= 4) {
    return 'low';
  }
  return h.coarse ? 'medium' : 'high';
}

/** Canvas pixel ratio for a tier at a dynamic-resolution scale. */
export function pixelRatio(tier: QualityTier, deviceDpr: number, scale: number): number {
  return Math.max(0.5, Math.min(deviceDpr || 1, QUALITY[tier].maxDpr) * scale);
}

const TARGET_MS = 1000 / 30;
const WINDOW_MS = 1000;
const MIN_SCALE = 0.6;

/** Lowers the render scale when the average frame misses 30 fps and raises it again when there is headroom. */
export class DynamicResolution {
  scale = 1;
  private sum = 0;
  private frames = 0;

  /** Feeds one frame time; returns true when the scale changed. */
  sample(frameMs: number): boolean {
    this.sum += frameMs;
    this.frames++;
    if (this.sum < WINDOW_MS) {
      return false;
    }
    const avg = this.sum / this.frames;
    this.sum = 0;
    this.frames = 0;
    const before = this.scale;
    if (avg > TARGET_MS * 1.1) {
      this.scale = Math.max(MIN_SCALE, this.scale - 0.1);
    } else if (avg < TARGET_MS * 0.6) {
      this.scale = Math.min(1, this.scale + 0.05);
    }
    return this.scale !== before;
  }
}
