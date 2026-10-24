import type { AvatarLook } from './avatar-kit';

/** Shirt colours the picker offers, by preference key (sRGB hex). */
export const SHIRT_COLOURS: Readonly<Record<string, number>> = {
  red: 0xe53935,
  orange: 0xfb8c00,
  yellow: 0xfdd835,
  green: 0x43a047,
  teal: 0x00acc1,
  blue: 0x1e88e5,
  purple: 0x8e24aa,
  pink: 0xec407a,
};

/** Preference value of a look: `<body>` or `<body>_<colour key>`. */
export function encodeLook(look: AvatarLook): string {
  const key = Object.keys(SHIRT_COLOURS).find((k) => SHIRT_COLOURS[k] === look.tint);
  return key ? `${look.skin}_${key}` : look.skin;
}

/** Look from a preference value; unknown bodies fall back to the first, unknown colours to the original clothes. */
export function decodeLook(value: string, bodies: readonly string[]): AvatarLook {
  const [skin = '', colour = ''] = value.split('_');
  return {
    skin: bodies.includes(skin) ? skin : bodies[0] ?? skin,
    tint: SHIRT_COLOURS[colour] ?? null,
  };
}
