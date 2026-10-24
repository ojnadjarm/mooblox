import type { MaterialTier } from '../world/material-kit';

export type QualityTier = 'low' | 'medium' | 'high' | 'xhigh';

export interface QualitySettings {
  /** Highest device pixel ratio the canvas renders at. */
  readonly maxDpr: number;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly antialias: boolean;
  readonly materials: MaterialTier;
  /** Post chain (bloom, grade); off tiers get the grade's vignette as a CSS overlay. */
  readonly post: boolean;
  /** Ambient occlusion in the post chain. */
  readonly ao: boolean;
  /** Districts further than this from the camera (edge, metres) are not drawn while playing. */
  readonly districtDistance: number;
  /** Lowest dynamic-resolution scale before the governor drops a tier. */
  readonly minScale: number;
  /** Triangles the district scenery may draw (nearest districts first); Infinity = no cap. */
  readonly sceneryTris: number;
}

export const QUALITY: Readonly<Record<QualityTier, QualitySettings>> = {
  low: { maxDpr: 1, shadows: false, shadowMapSize: 1024, antialias: false, materials: 'low', post: false, ao: false, districtDistance: 45, minScale: 0.5, sceneryTris: 55000 },
  medium: { maxDpr: 1.5, shadows: true, shadowMapSize: 1024, antialias: true, materials: 'standard', post: false, ao: false, districtDistance: 110, minScale: 0.6, sceneryTris: 90000 },
  high: { maxDpr: 2, shadows: true, shadowMapSize: 2048, antialias: true, materials: 'standard', post: true, ao: false, districtDistance: 260, minScale: 0.6, sceneryTris: Infinity },
  xhigh: { maxDpr: 2, shadows: true, shadowMapSize: 4096, antialias: true, materials: 'standard', post: true, ao: false, districtDistance: Infinity, minScale: 0.6, sceneryTris: Infinity },
};

export const TIERS = Object.keys(QUALITY) as QualityTier[];

/** Device facts the starting tier is picked from. */
export interface DeviceHints {
  readonly query: string | null;
  readonly memoryGb: number | undefined;
  readonly cores: number;
  readonly coarse: boolean;
  /** Unmasked WebGL renderer string, '' when the browser hides it. */
  readonly gpu?: string;
  /** Tier an earlier visit stepped down to because frames were slow. */
  readonly stored?: string | null;
  /** navigator.userAgent (Chromebooks start low). */
  readonly ua?: string;
}

const STRONG_GPU = /nvidia|geforce|rtx|quadro|radeon (rx|pro)|apple m\d+ (pro|max|ultra)|intel\(r\) arc|intel arc/i;
const WEAK_GPU = /iris|uhd|hd graphics|mali|adreno|powervr|llvmpipe|swiftshader|software|microsoft basic/i;
const PHONE_GPU = /mali|adreno|powervr|apple gpu|llvmpipe|swiftshader|software|microsoft basic|videocore/i;

/** Whether the GPU string names a discrete-class desktop GPU. */
export function strongGpu(gpu: string): boolean {
  return STRONG_GPU.test(gpu) && !WEAK_GPU.test(gpu);
}

const isTier = (t: string | null | undefined): t is QualityTier => !!t && (TIERS as string[]).includes(t);

/**
 * Starting tier: `?quality=` wins, then a tier an earlier visit stepped down to; phones, tablets, Chromebooks, small
 * devices and software or mobile GPUs start low, strong desktop GPUs high, every other laptop or desktop medium.
 * Xhigh only when asked for.
 */
export function pickTier(h: DeviceHints): QualityTier {
  if (isTier(h.query)) {
    return h.query;
  }
  if (isTier(h.stored)) {
    return h.stored;
  }
  const gpu = h.gpu ?? '';
  if ((h.memoryGb !== undefined && h.memoryGb <= 4) || h.cores <= 4 || h.coarse || PHONE_GPU.test(gpu) || /CrOS/.test(h.ua ?? '')) {
    return 'low';
  }
  return h.cores >= 8 && strongGpu(gpu) ? 'high' : 'medium';
}

/** The next tier down, or null at the bottom. */
export function lowerTier(tier: QualityTier): QualityTier | null {
  const i = TIERS.indexOf(tier);
  return i > 0 ? TIERS[i - 1]! : null;
}

/** Canvas pixel ratio for a tier at a dynamic-resolution scale. */
export function pixelRatio(tier: QualityTier, deviceDpr: number, scale: number): number {
  return Math.max(0.5, Math.min(deviceDpr || 1, QUALITY[tier].maxDpr) * scale);
}

const SLOW_MS = 1000 / 50;
const FAST_MS = 1000 / 57;
const WINDOW_MS = 1000;
const RAISE_AFTER = 3;
/** Share of each window's slowest frames left out of its average: a one-off hitch never moves the scale (a resize is a hitch too). */
const TRIM = 0.05;

/**
 * Lowers the render scale while the average frame (slowest 5% left out) misses 50 fps and raises it again after 3 windows at vsync;
 * `starved` turns true when the scale is at its floor and frames are still slow (the governor's cue to drop a tier).
 */
export class DynamicResolution {
  scale = 1;
  starved = false;
  private sum = 0;
  private readonly frames: number[] = [];
  private good = 0;

  constructor(private readonly minScale = 0.6) {}

  /** Feeds one frame time; returns true when the scale changed. */
  sample(frameMs: number): boolean {
    this.sum += frameMs;
    this.frames.push(frameMs);
    if (this.sum < WINDOW_MS) {
      return false;
    }
    const sorted = this.frames.sort((a, b) => a - b);
    const kept = Math.max(1, sorted.length - Math.floor(sorted.length * TRIM));
    let total = 0;
    for (let i = 0; i < kept; i++) total += sorted[i]!;
    const avg = total / kept;
    this.sum = 0;
    this.frames.length = 0;
    const before = this.scale;
    this.starved = false;
    if (avg > SLOW_MS) {
      this.good = 0;
      this.starved = this.scale <= this.minScale + 1e-9;
      this.scale = Math.max(this.minScale, this.scale - 0.1);
    } else if (avg < FAST_MS && ++this.good >= RAISE_AFTER) {
      this.good = 0;
      this.scale = Math.min(1, this.scale + 0.05);
    }
    return this.scale !== before;
  }
}
