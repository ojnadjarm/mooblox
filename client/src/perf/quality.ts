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

const TARGET_MS = 1000 / 60;
const SLOW_MS = 1000 / 50;
const FAST_MS = 1000 / 57;
const WINDOW_MS = 1000;
const RAISE_AFTER = 3;
/** Longest wait (windows) before trying a scale again after raises kept failing. */
const RAISE_MAX = 48;
/** Share of each window's slowest frames left out of its average: a one-off hitch never moves the scale (a resize is a hitch too). */
const TRIM = 0.05;
/** A slow window whose frames spend this share of their interval in main-thread work is CPU-bound: a smaller canvas would not help. */
const CPU_BOUND = 0.7;
/** CPU-bound slow windows in a row before the governor asks for a lower tier (fewer draws and districts: less CPU work). */
const STARVE_CPU = 5;
const STEP = 0.05;

/**
 * Dynamic render scale. A window (1 s, slowest 5% left out) slower than 50 fps lowers the scale in one step sized from how slow it
 * was (GPU time follows pixels: scale x sqrt(16.7 / avg), 0.05-0.25), unless the frames' own main-thread work fills their interval
 * (CPU-bound: the scale stays, each resize is a hitch for nothing). Windows at 57+ fps raise it 0.05 after 3 in a row; a raise
 * that is slow within 3 windows goes back one step and doubles that wait (up to 48; a raise that holds resets it), so a scale on
 * the edge never oscillates. `starved` turns true when the
 * scale is at its floor and frames are still slow, or after 5 CPU-bound slow windows (the cue to drop a tier).
 */
export class DynamicResolution {
  scale = 1;
  starved = false;
  /** Whether the last slow window was CPU-bound. */
  cpuBound = false;
  private sum = 0;
  private readonly frames: number[] = [];
  private readonly work: number[] = [];
  private good = 0;
  private slowCpu = 0;
  private raiseAfter = RAISE_AFTER;
  /** Windows since the last raise (a drop within RAISE_AFTER of it means the raise failed). */
  private sinceRaise = Infinity;

  constructor(private readonly minScale = 0.6) {}

  /** Feeds one frame interval and its main-thread work (ms; 0 = unknown, taken as GPU-bound); returns true when the scale changed. */
  sample(frameMs: number, workMs = 0): boolean {
    this.sum += frameMs;
    this.frames.push(frameMs);
    this.work.push(workMs);
    if (this.sum < WINDOW_MS) {
      return false;
    }
    const n = this.frames.length;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => this.frames[a]! - this.frames[b]!);
    const kept = Math.max(1, n - Math.floor(n * TRIM));
    let total = 0;
    let busy = 0;
    for (let i = 0; i < kept; i++) {
      total += this.frames[order[i]!]!;
      busy += this.work[order[i]!]!;
    }
    const avg = total / kept;
    this.sum = 0;
    this.frames.length = 0;
    this.work.length = 0;
    const before = this.scale;
    this.starved = false;
    this.sinceRaise++;
    if (avg > SLOW_MS) {
      this.good = 0;
      this.cpuBound = busy / kept >= avg * CPU_BOUND;
      if (this.cpuBound) {
        this.starved = ++this.slowCpu >= STARVE_CPU;
        if (this.starved) this.slowCpu = 0;
        return false;
      }
      this.slowCpu = 0;
      this.starved = this.scale <= this.minScale + 1e-9;
      const failed = this.sinceRaise <= RAISE_AFTER;
      const step = failed ? STEP : Math.min(0.25, Math.max(STEP, this.scale * (1 - Math.sqrt(TARGET_MS / avg))));
      this.scale = Math.max(this.minScale, snap(this.scale - step, Math.floor));
      if (failed) {
        this.raiseAfter = Math.min(RAISE_MAX, this.raiseAfter * 2);
        this.sinceRaise = Infinity;
      }
    } else {
      this.slowCpu = 0;
      if (this.sinceRaise === RAISE_AFTER + 1) this.raiseAfter = RAISE_AFTER;
      if (avg < FAST_MS && this.scale < 1 && ++this.good >= this.raiseAfter) {
        this.good = 0;
        this.scale = Math.min(1, snap(this.scale + STEP, Math.round));
        this.sinceRaise = 0;
      } else if (avg >= FAST_MS) {
        this.good = 0;
      }
    }
    return this.scale !== before;
  }
}

/** Rounds a scale to the 0.05 grid. */
function snap(v: number, round: (x: number) => number): number {
  return round(v / STEP + 1e-6) / (1 / STEP);
}
