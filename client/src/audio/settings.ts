/** The player's sound choice, kept as the Moodle preference `local_mooblox_sound` (`on70`, `off40`). */
export interface SoundSettings {
  readonly on: boolean;
  /** 0..1 */
  readonly volume: number;
}

export const SOUND_PREFERENCE = 'local_mooblox_sound';
export const DEFAULT_SOUND: SoundSettings = { on: true, volume: 0.7 };

/** Reads a stored preference; anything unknown gives the default. */
export function parseSound(value: string | null | undefined): SoundSettings {
  const m = /^(on|off)(\d{1,3})$/.exec(value ?? '');
  if (!m) return DEFAULT_SOUND;
  return { on: m[1] === 'on', volume: Math.min(100, Number(m[2])) / 100 };
}

/** The preference value of a choice. */
export function encodeSound(s: SoundSettings): string {
  return `${s.on ? 'on' : 'off'}${Math.round(Math.max(0, Math.min(1, s.volume)) * 100)}`;
}
