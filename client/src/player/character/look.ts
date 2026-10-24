import { CLOTH, FIELDS, LOOK_VERSION, OPTIONS, type Field } from './catalog';

/** A built character: one allow-listed id per field. */
export type CharacterLook = { readonly v: number } & { readonly [F in Field]: string };

/** The T1302 look: a Kenney skin letter and an optional shirt tint (sRGB hex). */
export interface LegacyLook {
  readonly skin: string;
  readonly tint: number | null;
}

export const DEFAULT_LOOK: CharacterLook = {
  v: LOOK_VERSION,
  skin: 's3',
  hair: 'short',
  hairc: 'brown',
  eyes: 'round',
  eyec: 'brown',
  brows: 'soft',
  mouth: 'smile',
  glasses: 'none',
  glassesc: 'black',
  top: 'tee',
  topc: 'red',
  bottom: 'trousers',
  bottomc: 'denim',
  shoes: 'sneakers',
  shoesc: 'white',
};

type Preset = Partial<Record<Field, string>>;

/** The 18 T1302 Kenney bodies as character presets, by skin letter. */
const LEGACY: Readonly<Record<string, Preset>> = {
  a: { skin: 's2', hair: 'short', hairc: 'platinum', topc: 'brown', bottomc: 'green' },
  b: { skin: 's8', hair: 'curly', hairc: 'black', topc: 'red', bottomc: 'blue' },
  c: { skin: 's2', hair: 'buzz', hairc: 'blonde', topc: 'green', bottom: 'shorts', bottomc: 'brown' },
  d: { skin: 's4', hair: 'spiky', hairc: 'blonde', topc: 'yellow', bottomc: 'black', eyes: 'wide' },
  e: { skin: 's3', hair: 'long', hairc: 'brown', topc: 'purple', bottom: 'shorts', bottomc: 'brown' },
  f: { skin: 's7', hair: 'afro', hairc: 'black', topc: 'teal', bottomc: 'denim' },
  g: { skin: 's1', hair: 'mohawk', hairc: 'red', topc: 'grey', bottomc: 'grey', eyes: 'wide' },
  h: { skin: 's1', hair: 'mohawk', hairc: 'purple', topc: 'grey', bottomc: 'grey', eyes: 'wide' },
  i: { skin: 's2', hair: 'bob', hairc: 'platinum', glasses: 'round', top: 'longsleeve', topc: 'white', bottomc: 'blue' },
  j: { skin: 's5', hair: 'short', hairc: 'black', top: 'longsleeve', topc: 'navy', bottomc: 'navy' },
  k: { skin: 's5', hair: 'ponytail', hairc: 'brown', topc: 'red', bottomc: 'blue' },
  l: { skin: 's4', hair: 'spiky', hairc: 'green', top: 'stripes', topc: 'navy', bottom: 'shorts', bottomc: 'green' },
  m: { skin: 's6', hair: 'buns', hairc: 'brown', topc: 'green', bottomc: 'green' },
  n: { skin: 's1', hair: 'braids', hairc: 'pink', topc: 'teal', bottom: 'skirt', bottomc: 'teal' },
  o: { skin: 's6', hair: 'curly', hairc: 'green', top: 'hoodie', topc: 'teal', bottomc: 'brown' },
  p: { skin: 's5', hair: 'bob', hairc: 'auburn', top: 'stripes', topc: 'blue', bottom: 'shorts', bottomc: 'brown' },
  q: { skin: 's9', hair: 'short', hairc: 'black', top: 'longsleeve', topc: 'black', bottomc: 'black' },
  r: { skin: 's7', hair: 'buzz', hairc: 'black', top: 'hoodie', topc: 'black', bottomc: 'grey' },
};

/** Legacy body ids, as the T1302 picker stored them. */
export const LEGACY_BODIES = Object.keys(LEGACY);

/** True when every field holds an allowed id and the version matches. */
export function isValidLook(value: unknown): value is CharacterLook {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  return (
    o['v'] === LOOK_VERSION &&
    keys.length === FIELDS.length + 1 &&
    FIELDS.every((f) => typeof o[f] === 'string' && OPTIONS[f].includes(o[f] as string))
  );
}

/** Character for a T1302 look: its body's preset, the tint as the nearest top colour. */
export function migrateLegacy(look: LegacyLook): CharacterLook {
  const preset = LEGACY[look.skin] ?? {};
  const out: Record<string, string | number> = { ...DEFAULT_LOOK, ...preset };
  if (look.tint !== null) {
    out['topc'] = nearestCloth(look.tint);
  }
  return out as CharacterLook;
}

/** Look from a stored preference: v2 JSON, a T1302 `<body>[_<colour>]` value, or the default. */
export function parseLook(value: string): CharacterLook {
  const text = value.trim();
  if (text.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(text);
      return isValidLook(parsed) ? parsed : DEFAULT_LOOK;
    } catch {
      return DEFAULT_LOOK;
    }
  }
  const match = /^([a-r])(?:_([a-z]+))?$/.exec(text);
  if (!match) {
    return DEFAULT_LOOK;
  }
  const colour = match[2] !== undefined ? CLOTH[match[2]] : undefined;
  return migrateLegacy({ skin: match[1]!, tint: colour ?? null });
}

/** Compact preference value: fields in schema order. */
export function encodeCharacter(look: CharacterLook): string {
  const out: Record<string, string | number> = { v: LOOK_VERSION };
  for (const f of FIELDS) {
    out[f] = look[f];
  }
  return JSON.stringify(out);
}

/** A random valid look; glasses on one kid in three. */
export function randomLook(random: () => number = Math.random): CharacterLook {
  const pick = (list: readonly string[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
  const out: Record<string, string | number> = { v: LOOK_VERSION };
  for (const f of FIELDS) {
    out[f] = pick(OPTIONS[f]);
  }
  if (random() < 0.67) {
    out['glasses'] = 'none';
  }
  return out as CharacterLook;
}

/** Same look with one field changed. */
export function withField(look: CharacterLook, field: Field, id: string): CharacterLook {
  return { ...look, [field]: id };
}

function nearestCloth(tint: number): string {
  let best = 'red';
  let bestD = Infinity;
  for (const [id, hex] of Object.entries(CLOTH)) {
    const d = Math.hypot(((hex >> 16) & 255) - ((tint >> 16) & 255), ((hex >> 8) & 255) - ((tint >> 8) & 255), (hex & 255) - (tint & 255));
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
