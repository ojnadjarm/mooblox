/** The shipped sound files (public/assets/audio, built by tools/intake-audio.mjs) and how loud each plays. */

export type Surface = 'grass' | 'stone' | 'wood';

/** Calls of the world's animals and the sea, played at a point (`AudioEngine.playAt`). */
export type CallId = 'bark' | 'meow' | 'quack' | 'gull' | 'wave' | 'crackle';

export type SfxId =
  | `step-${Surface}`
  | 'jump'
  | 'land'
  | 'bump'
  | 'open'
  | 'close'
  | 'book'
  | 'page'
  | 'click'
  | 'prompt'
  | 'equip'
  | 'emote'
  | 'xp'
  | 'guide'
  | 'complete'
  | 'levelup'
  | 'gem'
  | 'crystal'
  | 'star'
  | 'goal'
  | CallId;

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
  bump: { files: variants('bump', 2), gain: 0.22, vary: 0.08, gap: 0.4 },
  book: { files: ['book'], gain: 0.9, vary: 0.03, gap: 0.3 },
  page: { files: variants('page', 2), gain: 0.22, vary: 0.06, gap: 0.12 },
  click: { files: variants('click', 2), gain: 0.16, vary: 0.05, gap: 0.06 },
  prompt: { files: ['prompt'], gain: 0.14, vary: 0.03, gap: 1 },
  equip: { files: variants('equip', 2), gain: 0.3, vary: 0.06, gap: 0.15 },
  emote: { files: variants('emote', 2), gain: 0.22, vary: 0.08, gap: 0.5 },
  gem: { files: variants('gem', 3), gain: 0.34, vary: 0.06, gap: 0.08 },
  crystal: { files: variants('crystal', 2), gain: 0.34, vary: 0.05, gap: 0.08 },
  star: { files: ['star'], gain: 0.36, vary: 0, gap: 0.3 },
  goal: { files: ['goal'], gain: 0.4, vary: 0, gap: 5 },
  bark: { files: variants('bark', 5), gain: 0.32, vary: 0.1, gap: 0.6 },
  meow: { files: variants('meow', 3), gain: 0.24, vary: 0.1, gap: 1 },
  quack: { files: variants('quack', 3), gain: 0.2, vary: 0.12, gap: 0.3 },
  gull: { files: variants('gull', 2), gain: 0.18, vary: 0.1, gap: 2 },
  wave: { files: variants('wave', 2), gain: 0.3, vary: 0.08, gap: 2 },
  crackle: { files: variants('crackle', 4), gain: 0.2, vary: 0.15, gap: 0.3 },
};

/** Looped ambient beds (-20 LUFS): the sea along the shore, birds in the trees and a burning campfire. */
export const BEDS = { shore: 'bed-shore', birds: 'bed-birds', fire: 'bed-fire' } as const;

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
  return [...Object.values(SFX).flatMap((s) => s.files), ...Object.values(BEDS), MUSIC.hub, ...MUSIC.districts];
}
