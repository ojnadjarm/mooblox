import type { AudioEngine, Point } from './engine';

/** A fountain the water sound can sit at; `size` scales its loudness (the tiered spawn fountain is 1). */
export interface Fountain extends Point {
  readonly size: number;
}

/** Metres within which a fountain is heard; the voice stops past it. */
export const HEAR = 26;
const LEVEL = 0.5;

/** The nearest fountain within HEAR of (x, z), or null. */
export function nearestFountain(list: readonly Fountain[], x: number, z: number): Fountain | null {
  let best: Fountain | null = null;
  let d = HEAR * HEAR;
  for (const f of list) {
    const e = (f.x - x) ** 2 + (f.z - z) ** 2;
    if (e < d) {
      d = e;
      best = f;
    }
  }
  return best;
}

/** One spatial splashing-water voice (filtered noise, gently wobbling) placed at the nearest fountain. */
export class FountainWater {
  private voice: { source: AudioBufferSourceNode; panner: PannerNode; gain: GainNode; lfos: OscillatorNode[] } | null = null;
  private at: Fountain | null = null;

  constructor(private readonly engine: AudioEngine) {}

  /** Follows the player: starts, moves or stops the voice. */
  update(list: readonly Fountain[], x: number, z: number): void {
    const f = this.engine.audible ? nearestFountain(list, x, z) : null;
    if (f === this.at) return;
    this.at = f;
    if (!f) {
      this.stop();
      return;
    }
    const v = this.voice ?? this.start();
    if (!v) return;
    const t = this.engine.context!.currentTime;
    v.panner.positionX.setValueAtTime(f.x, t);
    v.panner.positionY.setValueAtTime(f.y + 1, t);
    v.panner.positionZ.setValueAtTime(f.z, t);
    v.gain.gain.setTargetAtTime(LEVEL * f.size, t, 0.3);
    this.engine.note('water', `${f.x.toFixed(1)},${f.z.toFixed(1)}`, LEVEL * f.size);
  }

  private start(): FountainWater['voice'] {
    const ctx = this.engine.context;
    const out = this.engine.world;
    if (!ctx || !out) return null;
    const len = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let pink = 0;
    for (let i = 0; i < len; i++) {
      pink = pink * 0.86 + (Math.random() * 2 - 1) * 0.14;
      data[i] = pink * 2.2;
    }
    // Crossfade the buffer's ends so its loop has no seam.
    const edge = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < edge; i++) {
      const k = i / edge;
      data[len - edge + i] = data[len - edge + i]! * (1 - k) + data[i]! * k;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopEnd = (len - edge) / ctx.sampleRate;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1100;
    band.Q.value = 0.6;
    const tone = ctx.createGain();
    tone.gain.value = 0.8;
    const lfos = [0.9, 1.7, 3.1].map((rate, i) => {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = i === 2 ? 260 : 0.12;
      lfo.connect(depth).connect(i === 2 ? band.frequency : tone.gain);
      lfo.start();
      return lfo;
    });
    const panner = new PannerNode(ctx, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 3, maxDistance: HEAR, rolloffFactor: 1.4 });
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(band).connect(tone).connect(gain).connect(panner).connect(out);
    source.start();
    this.voice = { source, panner, gain, lfos };
    return this.voice;
  }

  private stop(): void {
    const v = this.voice;
    if (!v) return;
    this.voice = null;
    const t = this.engine.context!.currentTime;
    v.gain.gain.setTargetAtTime(0, t, 0.2);
    v.source.stop(t + 1.2);
    for (const l of v.lfos) l.stop(t + 1.2);
    window.setTimeout(() => v.panner.disconnect(), 1400);
    this.engine.note('water', 'off', 0);
  }
}
