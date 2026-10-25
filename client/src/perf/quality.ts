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

/** Canvas pixels a post tier starts at on a GPU not known to be strong (high on an Iris Xe fits about 1366 x 768 at full scale). */
const WEAK_POST_PIXELS = 1.1e6;

/** Canvas pixels a tier may start at: a last visit's canvas at this tier, else ~1.1 Mpx for post tiers on a GPU not known strong. */
export function pixelBudget(tier: QualityTier, gpu: string, stored: number | null): number {
  if (stored !== null && stored > 0) return stored;
  return QUALITY[tier].post && !strongGpu(gpu) ? WEAK_POST_PIXELS : Infinity;
}

/** Starting render scale: the largest 0.05 step whose canvas (`cssPixels` at the tier's pixel ratio) fits `budget`, at least the floor. */
export function startScale(tier: QualityTier, cssPixels: number, deviceDpr: number, budget: number): number {
  const full = cssPixels * Math.min(deviceDpr || 1, QUALITY[tier].maxDpr) ** 2;
  if (full <= budget) return 1;
  return Math.max(QUALITY[tier].minScale, snap(Math.sqrt(budget / full), Math.floor));
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
/** GPU ms (each window's 90th percentile) over which the scale drops: frames past it miss vsync once the compositor's share is added. */
const GPU_HIGH = 15;
/** GPU ms a drop aims at. */
const GPU_AIM = 12;
/** Most GPU ms a raise may predict (GPU time taken to follow pixels, scale squared): the gap to GPU_HIGH is the hysteresis. */
const GPU_RAISE = 11;
/** Windows in a row over GPU_HIGH before a drop (one busy second is not a trend). */
const GPU_CONFIRM = 2;
/** Largest GPU-timed drop: GPU time swings with the view (a dense second is often gone the next), the next window re-measures. */
const GPU_STEP_MAX = 0.15;
/** GPU timings a window needs before they decide (results arrive a few frames late, and not on every frame). */
const GPU_MIN = 10;
/** Windows a GPU-timed scale holds after any resize, and how far back a raise looks for the heaviest GPU load (the view swings). */
const GPU_HOLD = 30;
/** Resizes within the last minute (60 windows) that block a GPU-timed raise. */
const GPU_CAP = 2;
const MINUTE = 60;
/** GPU-over windows at the scale floor, within the last TIER_SPAN, before a tier step (a step is kept: one dense view never costs a tier). */
const TIER_CONFIRM = 5;
const TIER_SPAN = 10;

/**
 * Dynamic render scale. A window (1 s, slowest 5% left out) slower than 50 fps lowers the scale in one step sized from how slow it
 * was (GPU time follows pixels: scale x sqrt(16.7 / avg), 0.05-0.25), unless the frames' own main-thread work fills their interval
 * (CPU-bound: the scale stays, each resize is a hitch for nothing). Windows at 57+ fps raise it 0.05 after 3 in a row; a raise
 * that is slow within 3 windows goes back one step and doubles that wait (up to 48; a raise that holds resets it), so a scale on
 * the edge never oscillates. `starved` turns true when the
 * scale is at its floor and frames are still slow, or after 5 CPU-bound slow windows (the cue to drop a tier).
 * With GPU timings (`gpu`, the render pass), the window's GPU p90 decides instead: over 15 ms for 2 windows in a row (counted afresh after
 * each resize: the first timings after one are still of the old size) the scale drops towards 12 ms (at most 0.15 a window) even when the average frame looks fine (late frames hide in a ~17 ms average); a raise
 * waits 30 windows after any resize and fewer than 2 resizes in the last minute, then goes in one step to the largest scale whose
 * heaviest GPU load of those 30 windows (p90 / scale squared) is predicted under 11 ms; slow frames with the GPU under 15 ms are CPU-bound.
 * At the floor, `starved` (with `gpuFloor`: resolution alone cannot fit) waits for 5 GPU-over windows within the last 10.
 */
export class DynamicResolution {
  scale = 1;
  starved = false;
  /** Whether the last slow window was CPU-bound. */
  cpuBound = false;
  /** Whether `starved` is GPU time over budget at the scale floor (a lower tier's features are the only cut left). */
  gpuFloor = false;
  private sum = 0;
  private readonly frames: number[] = [];
  private readonly work: number[] = [];
  private readonly gpuMs: number[] = [];
  private good = 0;
  private slowCpu = 0;
  /** Windows in a row with the GPU p90 over GPU_HIGH. */
  private gpuOver = 0;
  private raiseAfter = RAISE_AFTER;
  /** Windows since the last raise (a drop within RAISE_AFTER of it means the raise failed). */
  private sinceRaise = Infinity;
  /** Whether GPU timings ever decided a window: raises then follow them only. */
  private timed = false;
  /** Windows sampled so far. */
  private windows = 0;
  /** Window numbers of the resizes in the last minute. */
  private readonly resizes: number[] = [];
  /** GPU p90 / scale squared of the last GPU_HOLD timed windows. */
  private readonly loads: number[] = [];
  /** Window numbers with the GPU over budget at the scale floor. */
  private readonly floorOver: number[] = [];

  constructor(private readonly minScale = 0.6) {}

  /** Feeds one frame's GPU time (ms), whenever a timer result arrives. */
  gpu(ms: number): void {
    this.gpuMs.push(ms);
  }

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
    const gpu = this.gpuMs.length >= GPU_MIN ? p90(this.gpuMs) : null;
    this.sum = 0;
    this.frames.length = 0;
    this.work.length = 0;
    this.gpuMs.length = 0;
    const before = this.scale;
    this.starved = false;
    this.gpuFloor = false;
    this.sinceRaise++;
    this.windows++;
    if (gpu !== null) {
      this.timed = true;
      this.loads.push(gpu / this.scale ** 2);
      if (this.loads.length > GPU_HOLD) this.loads.shift();
    }
    const gpuOver = gpu !== null && gpu > GPU_HIGH;
    this.gpuOver = gpuOver ? this.gpuOver + 1 : 0;
    const floor = this.scale <= this.minScale + 1e-9;
    if (gpuOver && floor) this.floorOver.push(this.windows);
    while (this.floorOver.length > 0 && this.floorOver[0]! <= this.windows - TIER_SPAN) this.floorOver.shift();
    const confirmed = gpuOver && this.gpuOver >= GPU_CONFIRM;
    const slow = gpu === null ? avg > SLOW_MS : confirmed || (avg > SLOW_MS && !gpuOver);
    if (gpuOver && !confirmed) {
      this.good = 0;
      return false;
    }
    if (slow) {
      this.good = 0;
      this.cpuBound = gpu === null ? busy / kept >= avg * CPU_BOUND : gpu <= GPU_HIGH;
      if (this.cpuBound) {
        this.starved = ++this.slowCpu >= STARVE_CPU;
        if (this.starved) this.slowCpu = 0;
        return false;
      }
      this.slowCpu = 0;
      this.gpuFloor = gpu !== null && floor && this.floorOver.length >= TIER_CONFIRM;
      this.starved = gpu === null ? floor : this.gpuFloor;
      if (this.gpuFloor) this.floorOver.length = 0;
      const failed = this.sinceRaise <= RAISE_AFTER;
      const ratio = gpu === null ? TARGET_MS / avg : GPU_AIM / gpu;
      const most = gpu === null ? 0.25 : GPU_STEP_MAX;
      const step = failed ? STEP : Math.min(most, Math.max(STEP, this.scale * (1 - Math.sqrt(ratio))));
      this.scale = Math.max(this.minScale, snap(this.scale - step, Math.floor));
      if (failed) {
        this.raiseAfter = Math.min(RAISE_MAX, this.raiseAfter * 2);
        this.sinceRaise = Infinity;
      }
    } else if (this.timed) {
      this.slowCpu = 0;
      this.raiseTimed();
    } else {
      this.slowCpu = 0;
      if (this.sinceRaise === RAISE_AFTER + 1) this.raiseAfter = RAISE_AFTER;
      const next = Math.min(1, snap(this.scale + STEP, Math.round));
      const fits = gpu === null ? avg < FAST_MS : gpu * (next / this.scale) ** 2 < GPU_RAISE;
      if (fits && this.scale < 1 && ++this.good >= this.raiseAfter) {
        this.good = 0;
        this.scale = next;
        this.sinceRaise = 0;
      } else if (!fits) {
        this.good = 0;
      }
    }
    if (this.scale === before) return false;
    this.resizes.push(this.windows);
    this.gpuOver = 0;
    return true;
  }

  /** GPU-timed raise: after the hold, under the per-minute cap, straight to the largest scale the heaviest recent load fits. */
  private raiseTimed(): void {
    while (this.resizes.length > 0 && this.resizes[0]! <= this.windows - MINUTE) this.resizes.shift();
    const last = this.resizes.at(-1) ?? -Infinity;
    if (this.loads.length < GPU_HOLD || this.windows - last < GPU_HOLD || this.resizes.length >= GPU_CAP) return;
    const target = Math.min(1, snap(Math.sqrt(GPU_RAISE / Math.max(...this.loads)), Math.floor));
    if (target > this.scale + 1e-9) this.scale = target;
  }
}

/** 90th percentile (sorts in place). */
function p90(v: number[]): number {
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * 0.9))]!;
}

/** Rounds a scale to the 0.05 grid. */
function snap(v: number, round: (x: number) => number): number {
  return round(v / STEP + 1e-6) / (1 / STEP);
}
