/** The shipped sound files (public/assets/audio, built by tools/intake-audio.mjs) and how loud each plays. */

export type Surface = 'grass' | 'stone' | 'wood';

export type SfxId = `step-${Surface}` | 'jump' | 'land' | 'open' | 'close' | 'xp' | 'guide' | 'complete' | 'levelup';

export interface SfxSpec {
  /** File stems; one is picked per play. */
  readonly files: readonly string[];
  /** Linear gain at full volume (files peak near 0 dBFS). */
  readonly gain: number;
  /** Random playback-rate spread (+-), so repeats do not sound the same. */
  readonly vary: number;
  /** Shortest gap (s) between two plays. */
  readonly gap: number;
}

const variants = (stem: string, n: number) => Array.from({ length: n }, (_, i) => `${stem}-${i}`);

export const SFX: Readonly<Record<SfxId, SfxSpec>> = {
  'step-grass': { files: variants('step-grass', 5), gain: 0.32, vary: 0.08, gap: 0.12 },
  'step-stone': { files: variants('step-stone', 5), gain: 0.22, vary: 0.08, gap: 0.12 },
  'step-wood': { files: variants('step-wood', 5), gain: 0.26, vary: 0.08, gap: 0.12 },
  jump: { files: variants('jump', 2), gain: 0.3, vary: 0.1, gap: 0.2 },
  land: { files: variants('land', 3), gain: 0.3, vary: 0.06, gap: 0.25 },
  open: { files: ['open'], gain: 0.3, vary: 0, gap: 0.2 },
  close: { files: ['close'], gain: 0.3, vary: 0, gap: 0.2 },
  xp: { files: ['xp'], gain: 0.3, vary: 0, gap: 0.5 },
  guide: { files: ['guide'], gain: 0.22, vary: 0.04, gap: 4 },
  complete: { files: ['complete'], gain: 0.4, vary: 0, gap: 1 },
  levelup: { files: ['levelup'], gain: 0.36, vary: 0, gap: 2 },
};

/** Calm loops, normalised to -20 LUFS: the plazas get the lullaby, districts take turns with the other two. */
export const MUSIC = { hub: 'music-hub', districts: ['music-bluebonnet', 'music-catmint'] } as const;

/** Music gain at full volume (about -29 LUFS under the effects). */
export const MUSIC_GAIN = 0.36;

/** The loop for an island index (hubs first, then zones, as `WorldView.island`). */
export function musicFor(island: number, hubs: number): string {
  if (island < hubs) return MUSIC.hub;
  return MUSIC.districts[(island - hubs) % MUSIC.districts.length]!;
}

/** Every file stem the client may fetch. */
export function soundFiles(): string[] {
  return [...Object.values(SFX).flatMap((s) => s.files), MUSIC.hub, ...MUSIC.districts];
}
