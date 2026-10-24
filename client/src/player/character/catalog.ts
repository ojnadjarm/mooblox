import shared from '../../../../moodle/local/mooblox/character.json';

/** The fields of a character look, as stored in the preference. */
export type Field =
  | 'skin'
  | 'hair'
  | 'hairc'
  | 'eyes'
  | 'eyec'
  | 'brows'
  | 'mouth'
  | 'glasses'
  | 'glassesc'
  | 'top'
  | 'topc'
  | 'bottom'
  | 'bottomc'
  | 'shoes'
  | 'shoesc';

/** Look schema version; the server allow-lists the same ids (`character.json`, shared with PHP). */
export const LOOK_VERSION: number = shared.version;

/** Allowed ids per field, in display order. */
export const OPTIONS: Readonly<Record<Field, readonly string[]>> = Object.fromEntries(
  Object.entries(shared.fields).map(([field, list]) => [field, shared.lists[list as keyof typeof shared.lists]]),
) as unknown as Record<Field, readonly string[]>;

export const FIELDS = Object.keys(OPTIONS) as Field[];

/** Skin tones, light to deep (sRGB hex). */
export const SKIN: Readonly<Record<string, number>> = {
  s1: 0xffe0cc,
  s2: 0xf9d0b0,
  s3: 0xf2bf94,
  s4: 0xe0a77a,
  s5: 0xc98b5e,
  s6: 0xb07447,
  s7: 0x925a35,
  s8: 0x76462a,
  s9: 0x5c3520,
  s10: 0x432517,
};

export const HAIR_COLOUR: Readonly<Record<string, number>> = {
  blonde: 0xf2cc5c,
  platinum: 0xf3ecd6,
  brown: 0x7a4a26,
  black: 0x2a2220,
  auburn: 0x8f3a1c,
  red: 0xd2541f,
  pink: 0xff7eb6,
  blue: 0x3d8bff,
  purple: 0x9b5de5,
  green: 0x3fc380,
};

export const EYE_COLOUR: Readonly<Record<string, number>> = {
  brown: 0x6b3e1e,
  hazel: 0x9a7b3a,
  green: 0x3f9b4a,
  blue: 0x3b82d6,
  grey: 0x8a96a3,
  amber: 0xd6922a,
  violet: 0x8a4fd8,
  pink: 0xf25c9b,
};

export const CLOTH: Readonly<Record<string, number>> = {
  red: 0xe53935,
  orange: 0xfb8c00,
  yellow: 0xfdd835,
  green: 0x43a047,
  teal: 0x00acc1,
  blue: 0x1e88e5,
  navy: 0x283a7a,
  purple: 0x8e24aa,
  pink: 0xec407a,
  white: 0xf4f4f0,
  grey: 0x8d939c,
  black: 0x2b2b30,
  denim: 0x4a6fa5,
  brown: 0x7b5233,
};

/** Display colour of a colour id in `field`, or null for a style field. */
export function colourOf(field: Field, id: string): number | null {
  const table = field === 'skin' ? SKIN : field === 'hairc' ? HAIR_COLOUR : field === 'eyec' ? EYE_COLOUR : field.endsWith('c') ? CLOTH : null;
  return table ? (table[id] ?? null) : null;
}

/** English label of an option id. */
export function labelOf(id: string): string {
  return LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

const LABELS: Readonly<Record<string, string>> = {
  longsleeve: 'Long sleeves',
  tank: 'Tank top',
  stars: 'Star glasses',
  round: 'Round',
  none: 'None',
  ponytail: 'Ponytail',
};
