/** Roblox-style BrickColor palette (sRGB hex) shared by every world part. */
export const Palette = {
  grass: 0x4b974b,
  grassLight: 0x6ec65a,
  leaves: 0x34a853,
  leavesDark: 0x287f47,
  dirt: 0x8a5a33,
  sand: 0xf2d68a,
  stone: 0xa3a2a5,
  stoneDark: 0x6e6d72,
  wood: 0xa0632e,
  woodDark: 0x694028,
  water: 0x2fb5e8,
  waterDeep: 0x1b7fc4,
  white: 0xf8f8f8,
  red: 0xe23d2b,
  blue: 0x1e88e5,
  yellow: 0xf5cd30,
  orange: 0xff9a2e,
  purple: 0x8e5ad8,
  pink: 0xff7fb6,
  skyTop: 0x4aa8ff,
  skyHorizon: 0xcdeeff,
} as const;

/** Pad colour per Moodle activity purpose, so kids read a zone's kind at a glance. */
export const PurposeColor: Readonly<Record<string, number>> = {
  content: Palette.blue,
  assessment: Palette.red,
  communication: Palette.yellow,
  collaboration: Palette.orange,
  interactivecontent: Palette.purple,
  administration: Palette.stone,
  other: Palette.pink,
};
