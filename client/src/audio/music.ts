import type { AudioEngine } from './engine';

/** Seconds two loops overlap when the island changes. */
const FADE = 3;

interface Deck {
  readonly stem: string;
  readonly element: HTMLAudioElement;
  readonly gain: GainNode;
}

/** Streams the island loops through two media-element decks and crossfades between them (no long PCM buffers in memory). */
export class Music {
  private deck: Deck | null = null;
  private wanted: string | null = null;
  private paused = false;

  constructor(private readonly engine: AudioEngine) {}

  /** The loop now playing (or waiting for the unlock). */
  get current(): string | null {
    return this.wanted;
  }

  /** Fades to `stem`; a no-op when it already plays. */
  play(stem: string): void {
    if (stem === this.wanted && (this.deck || !this.engine.context)) return;
    this.wanted = stem;
    const ctx = this.engine.context;
    const bus = this.engine.music;
    if (!ctx || !bus) return;
    const element = new Audio(this.engine.url(stem));
    element.loop = true;
    element.preload = 'auto';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(element).connect(gain).connect(bus);
    const now = ctx.currentTime;
    gain.gain.setTargetAtTime(1, now, FADE / 4);
    const old = this.deck;
    if (old) {
      old.gain.gain.setTargetAtTime(0, now, FADE / 5);
      window.setTimeout(() => this.drop(old), FADE * 1000 + 200);
    }
    this.deck = { stem, element, gain };
    this.engine.note('music', stem, 1);
    if (!this.paused) element.play().catch((e: unknown) => console.warn('mooblox: music blocked', e));
  }

  /** Plays the current loop again inside a gesture: the browser blocks it when it started before one (a portal arrival). */
  resume(): void {
    const el = this.deck?.element;
    if (el && el.paused && !this.paused) el.play().catch((e: unknown) => console.warn('mooblox: music blocked', e));
  }

  /** Stops streaming while nothing can be heard; picks up again after. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    const el = this.deck?.element;
    if (!el) return;
    if (paused) el.pause();
    else el.play().catch((e: unknown) => console.warn('mooblox: music blocked', e));
  }

  private drop(d: Deck): void {
    d.element.pause();
    d.element.removeAttribute('src');
    d.element.load();
    d.gain.disconnect();
  }
}
