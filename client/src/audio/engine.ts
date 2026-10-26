import { mixGains, type MixState } from './cues';
import { MUSIC_GAIN, SFX, type SfxId } from './sounds';

/** One logged sound decision (the test tools read these instead of listening). */
export interface SoundEvent {
  readonly t: number;
  readonly kind: 'unlock' | 'sfx' | 'music' | 'water' | 'mix' | 'call' | 'bed';
  readonly id: string;
  /** Linear gain the sound was sent at (before the master), or the master level for `mix`. */
  readonly gain: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const LOG_SIZE = 200;
/** Seconds a bus level change takes (no clicks). */
const RAMP = 0.08;

/** The file format this browser plays: Ogg Opus, else AAC. */
export function audioFormat(probe: Pick<HTMLMediaElement, 'canPlayType'> | null): 'ogg' | 'm4a' {
  return probe?.canPlayType('audio/ogg; codecs=opus') ? 'ogg' : 'm4a';
}

/** The Web Audio graph: effects, world and music buses under one master; silent until a user gesture unlocks it. */
export class AudioEngine {
  readonly log: SoundEvent[] = [];
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly last = new Map<SfxId, number>();
  private mix: MixState;

  constructor(
    private readonly base: string,
    readonly format: 'ogg' | 'm4a',
    initial: MixState,
    private readonly create: () => AudioContext = () => new AudioContext(),
  ) {
    this.mix = initial;
  }

  /** The running context, null before the first gesture. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** The bus music decks connect to (null before unlock). */
  get music(): AudioNode | null {
    return this.musicBus;
  }

  /** The bus world sounds (fountains) connect to (null before unlock). */
  get world(): AudioNode | null {
    return this.sfx;
  }

  /** The URL of a shipped sound file. */
  url(stem: string): string {
    return `${this.base}audio/${stem}.${this.format}`;
  }

  /** Builds or resumes the context; call inside a user gesture. Returns true the first time. */
  unlock(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.mix.hidden) void this.ctx.resume();
      return false;
    }
    let ctx: AudioContext;
    try {
      ctx = this.create();
    } catch {
      return false;
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = mixGains(this.mix).master;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC_GAIN * mixGains(this.mix).music;
    this.musicBus.connect(this.master);
    if (ctx.state === 'suspended') void ctx.resume();
    this.note('unlock', ctx.state, 1);
    for (const spec of Object.values(SFX)) for (const f of spec.files) void this.buffer(f);
    return true;
  }

  /** Sets the levels from the player's choice and what is open. */
  setMix(m: MixState): void {
    this.mix = m;
    const g = mixGains(m);
    this.note('mix', `${m.on ? 'on' : 'off'}${m.video ? ' video' : ''}${m.panel ? ' panel' : ''}${m.hidden ? ' hidden' : ''}`, g.master);
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.musicBus) return;
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(g.master, now, RAMP / 3);
    this.musicBus.gain.setTargetAtTime(MUSIC_GAIN * g.music, now, 0.4);
    if (m.hidden && ctx.state === 'running') void ctx.suspend();
    else if (!m.hidden && ctx.state === 'suspended') void ctx.resume();
  }

  /** Whether anything can be heard now. */
  get audible(): boolean {
    return mixGains(this.mix).master > 0;
  }

  /** Plays one effect (a random variant, slightly varied pitch) at `gain` x its own level; rate-limited per sound. */
  play(id: SfxId, gain = 1): void {
    const source = this.voice(id, gain, 'sfx');
    if (source) source.out.connect(this.sfx!);
  }

  /** Plays one effect from a point in the world, fading with distance (heard up to `hear` m). */
  playAt(id: SfxId, at: Point, hear: number, gain = 1): void {
    const source = this.voice(id, gain, 'call', `@${at.x.toFixed(0)},${at.z.toFixed(0)}`);
    if (!source) return;
    const panner = new PannerNode(this.ctx!, {
      panningModel: 'equalpower',
      distanceModel: 'linear',
      refDistance: 2,
      maxDistance: hear,
      rolloffFactor: 1,
      positionX: at.x,
      positionY: at.y,
      positionZ: at.z,
    });
    source.out.connect(panner).connect(this.sfx!);
  }

  /** Fetches and decodes a shipped file once (after unlock); null when it cannot load. */
  load(stem: string): Promise<AudioBuffer | null> {
    return this.ctx ? this.buffer(stem) : Promise.resolve(null);
  }

  /** Starts a logged, rate-limited, pitch-varied voice of an effect; null when silent, limited or not loaded yet. */
  private voice(id: SfxId, gain: number, kind: 'sfx' | 'call', where = ''): { out: GainNode } | null {
    const spec = SFX[id];
    const now = performance.now() / 1000;
    if (now - (this.last.get(id) ?? -Infinity) < spec.gap) return null;
    this.last.set(id, now);
    const level = spec.gain * gain;
    this.note(kind, id + where, level);
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.audible) return null;
    const buffer = this.buffers.get(spec.files[Math.floor(Math.random() * spec.files.length)]!);
    if (!buffer) return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * spec.vary;
    const out = ctx.createGain();
    out.gain.value = level;
    source.connect(out);
    source.start();
    return { out };
  }

  /** Logs a decision of another sound part (music, water). */
  note(kind: SoundEvent['kind'], id: string, gain: number): void {
    if (this.log.length >= LOG_SIZE) this.log.shift();
    this.log.push({ t: Math.round(performance.now()), kind, id, gain: Math.round(gain * 1000) / 1000 });
  }

  /** Moves the listener to the player, facing `yaw` (0 = +z). */
  listen(at: Point, yaw: number): void {
    const l = this.ctx?.listener;
    if (!l) return;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    if (l.positionX) {
      const t = this.ctx!.currentTime;
      l.positionX.setTargetAtTime(at.x, t, 0.05);
      l.positionY.setTargetAtTime(at.y + 1.4, t, 0.05);
      l.positionZ.setTargetAtTime(at.z, t, 0.05);
      l.forwardX.setTargetAtTime(fx, t, 0.05);
      l.forwardY.setTargetAtTime(0, t, 0.05);
      l.forwardZ.setTargetAtTime(fz, t, 0.05);
    } else {
      l.setPosition(at.x, at.y + 1.4, at.z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /** Fetches and decodes one effect file once. */
  private buffer(stem: string): Promise<AudioBuffer | null> {
    let p = this.loading.get(stem);
    if (!p) {
      p = fetch(this.url(stem))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${stem}`))))
        .then((data) => this.ctx!.decodeAudioData(data))
        .then((b) => {
          this.buffers.set(stem, b);
          return b;
        })
        .catch((e: unknown) => {
          console.warn('mooblox: sound not loaded', stem, e);
          return null;
        });
      this.loading.set(stem, p);
    }
    return p;
  }
}
