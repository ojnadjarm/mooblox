import type { Circle } from '../world/layout';
import type { AudioEngine, Point } from './engine';
import { BEDS, type CallId } from './sounds';

/** An animal of the current island that calls now and then. */
export interface Caller extends Point {
  readonly kind: 'dog' | 'cat' | 'duck';
}

/** How a caller sounds: its call, how far it carries (m) and the pause range (s) between two calls. */
export interface CallTune {
  readonly call: CallId;
  readonly hear: number;
  readonly every: readonly [number, number];
}

export const CALLERS: Readonly<Record<Caller['kind'] | 'gull' | 'wave', CallTune>> = {
  dog: { call: 'bark', hear: 34, every: [8, 20] },
  cat: { call: 'meow', hear: 16, every: [14, 34] },
  duck: { call: 'quack', hear: 22, every: [5, 13] },
  gull: { call: 'gull', hear: 45, every: [10, 24] },
  wave: { call: 'wave', hear: 30, every: [5, 12] },
};

/** Metres from the rim within which the sea is heard. */
export const SHORE_HEAR = 26;
/** Bed levels at full volume: the sea right at the rim, the birds inland. */
const SHORE = 0.55;
const BIRDS = 0.3;
/** Metres past the rim a critter still counts as on the island (beach, pond edge). */
const RIM_SLACK = 2;
/** Gulls wheel this far out over the water and this high. */
const GULL_OUT = 10;
const GULL_UP = 9;

/** Metres from (x, z) in to the island's rim (negative past it). */
export function toRim(island: Circle, x: number, z: number): number {
  return island.radius - Math.hypot(x - island.x, z - island.z);
}

/** The rim point nearest (x, z), pushed `out` m over the water. */
export function rimPoint(island: Circle, x: number, z: number, out = 0): { x: number; z: number } {
  const dx = x - island.x;
  const dz = z - island.z;
  const d = Math.hypot(dx, dz) || 1;
  const r = island.radius + out;
  return { x: island.x + (dx / d) * r, z: island.z + (dz / d) * r };
}

/** The sea's level (0..1) at `d` m in from the rim: full at the rim, gone at SHORE_HEAR. */
export function shoreLevel(d: number): number {
  const k = Math.min(1, Math.max(0, 1 - d / SHORE_HEAR));
  return k * k;
}

/** The callers standing on one island. */
export function onIsland<T extends Point>(list: readonly T[], island: Circle): T[] {
  return list.filter((c) => toRim(island, c.x, c.z) > -RIM_SLACK);
}

/** One looped bed on the world bus; positioned beds only pan (their level is set by distance here). */
class Bed {
  private gain: GainNode | null = null;
  private panner: PannerNode | null = null;
  private starting = false;
  level = 0;

  constructor(
    private readonly engine: AudioEngine,
    private readonly stem: string,
    private readonly spatial: boolean,
  ) {}

  set(level: number, at?: Point): void {
    const ctx = this.engine.context;
    if (!ctx) return;
    if (!this.gain && level > 0) this.start();
    const t = ctx.currentTime;
    if (this.panner && at) {
      this.panner.positionX.setTargetAtTime(at.x, t, 0.3);
      this.panner.positionY.setTargetAtTime(at.y, t, 0.3);
      this.panner.positionZ.setTargetAtTime(at.z, t, 0.3);
    }
    if (Math.abs(level - this.level) < 0.01) return;
    this.level = level;
    this.gain?.gain.setTargetAtTime(level, t, 0.6);
    this.engine.note('bed', this.stem, level);
  }

  private start(): void {
    if (this.starting) return;
    this.starting = true;
    void this.engine.load(this.stem).then((buffer) => {
      const ctx = this.engine.context;
      const out = this.engine.world;
      if (!buffer || !ctx || !out) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.gain.setTargetAtTime(this.level, ctx.currentTime, 0.8);
      let tail: AudioNode = this.gain;
      if (this.spatial) {
        this.panner = new PannerNode(ctx, { panningModel: 'equalpower', rolloffFactor: 0 });
        tail = this.gain.connect(this.panner);
      }
      source.connect(this.gain);
      tail.connect(out);
      source.start(0, Math.random() * buffer.duration);
    });
  }
}

/** The current island's sounds: the sea along its rim, birds inland, and its dogs, cats, ducks, gulls and waves calling now and then. */
export class Ambience {
  private callers: Caller[] = [];
  private next: number[] = [];
  private gullAt = 0;
  private waveAt = 0;
  private readonly shore: Bed;
  private readonly birds: Bed;

  constructor(
    private readonly engine: AudioEngine,
    private readonly random: () => number = Math.random,
  ) {
    this.shore = new Bed(engine, BEDS.shore, true);
    this.birds = new Bed(engine, BEDS.birds, false);
  }

  /** Swaps in the callers of a newly entered island (their first calls staggered). */
  setCallers(list: readonly Caller[], t: number): void {
    this.callers = [...list];
    this.next = this.callers.map((c) => t + this.random() * CALLERS[c.kind].every[1]);
    this.gullAt = t + this.pause(CALLERS.gull) / 2;
    this.waveAt = t + this.pause(CALLERS.wave) / 2;
  }

  /** Follows the player at (x, z) on `island` at time `t` (s): bed levels and any calls now due. */
  update(island: Circle | null, x: number, z: number, t: number): void {
    if (!island) {
      this.shore.set(0);
      this.birds.set(0);
      return;
    }
    const near = shoreLevel(toRim(island, x, z));
    const rim = rimPoint(island, x, z);
    this.shore.set(SHORE * near, { x: rim.x, y: 0, z: rim.z });
    this.birds.set(BIRDS * (1 - 0.6 * near));
    this.callers.forEach((c, i) => {
      if (t < this.next[i]!) return;
      const tune = CALLERS[c.kind];
      this.next[i] = t + this.pause(tune);
      if (Math.hypot(c.x - x, c.z - z) < tune.hear) this.engine.playAt(tune.call, { x: c.x, y: c.y + 0.5, z: c.z }, tune.hear);
    });
    if (near <= 0) return;
    if (t >= this.gullAt) {
      this.gullAt = t + this.pause(CALLERS.gull);
      const side = (this.random() - 0.5) * 24;
      const p = rimPoint(island, x + side, z - side, GULL_OUT);
      this.engine.playAt('gull', { x: p.x, y: GULL_UP, z: p.z }, CALLERS.gull.hear);
    }
    if (t >= this.waveAt) {
      this.waveAt = t + this.pause(CALLERS.wave);
      const p = rimPoint(island, x, z, 1);
      this.engine.playAt('wave', { x: p.x, y: 0, z: p.z }, CALLERS.wave.hear);
    }
  }

  private pause(tune: CallTune): number {
    return tune.every[0] + this.random() * (tune.every[1] - tune.every[0]);
  }
}
