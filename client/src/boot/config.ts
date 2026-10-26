/** Settings play.php writes into #mooblox-config. */
export interface PlayConfig {
  readonly wwwroot: string;
  readonly courseid: number;
  /** The Moodle user id (0 when an older play.php leaves it out). */
  readonly userid: number;
  readonly sesskey: string;
  readonly firstname: string;
  readonly avatar: string;
  /** The stored sound choice (`local_mooblox_sound`), '' when none. */
  readonly sound: string;
  readonly rev: number;
  /** `hub` on the hub page (index.php, where `courseid` is the course the kid came back from), else `play`. */
  readonly mode: 'play' | 'hub';
  /** The hub page, '' when an older play.php leaves it out. */
  readonly huburl: string;
  /** The kid came through a hub portal (`play.php?warp=1`): the world opens with the arrival. */
  readonly arrival: boolean;
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
    userid: o['userid'] === undefined ? 0 : int(o, 'userid'),
    sesskey: str(o, 'sesskey'),
    firstname: str(o, 'firstname'),
    avatar: str(o, 'avatar'),
    sound: o['sound'] === undefined ? '' : str(o, 'sound'),
    rev: int(o, 'rev'),
    mode: o['mode'] === 'hub' ? 'hub' : 'play',
    huburl: o['huburl'] === undefined ? '' : str(o, 'huburl'),
    arrival: o['arrival'] === true,
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
