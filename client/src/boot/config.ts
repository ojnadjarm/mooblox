/** Settings play.php writes into #mooblox-config. */
export interface PlayConfig {
  readonly wwwroot: string;
  readonly courseid: number;
  readonly sesskey: string;
  readonly firstname: string;
  readonly avatar: string;
  /** The stored sound choice (`local_mooblox_sound`), '' when none. */
  readonly sound: string;
  readonly rev: number;
  /** Lang strings for the client UI, by key. */
  readonly strings: Readonly<Record<string, string>>;
}

/** Thrown when the play.php config is missing or malformed. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Parses and validates the JSON text of #mooblox-config. */
export function readConfig(json: string | null | undefined): PlayConfig {
  if (!json) {
    throw new ConfigError('missing #mooblox-config');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ConfigError('#mooblox-config is not JSON');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigError('#mooblox-config is not an object');
  }
  const o = raw as Record<string, unknown>;
  return {
    wwwroot: str(o, 'wwwroot').replace(/\/+$/, ''),
    courseid: int(o, 'courseid'),
    sesskey: str(o, 'sesskey'),
    firstname: str(o, 'firstname'),
    avatar: str(o, 'avatar'),
    sound: o['sound'] === undefined ? '' : str(o, 'sound'),
    rev: int(o, 'rev'),
    strings: strings(o['strings']),
  };
}

function strings(v: unknown): Record<string, string> {
  if (v === undefined) {
    return {};
  }
  if (typeof v !== 'object' || v === null || Object.values(v).some((x) => typeof x !== 'string')) {
    throw new ConfigError('config.strings must map keys to strings');
  }
  return v as Record<string, string>;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') {
    throw new ConfigError(`config.${key} must be a string`);
  }
  return v;
}

function int(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new ConfigError(`config.${key} must be an integer`);
  }
  return v;
}
