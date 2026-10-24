/** World colours a look paints the island with (sRGB hex). */
export interface LookPalette {
  readonly grass: number;
  readonly grassLight: number;
  readonly leaves: readonly number[];
  readonly dirt: number;
  readonly dirtDark: number;
  readonly sand: number;
  readonly stone: number;
  readonly stoneDark: number;
  readonly path: readonly number[];
  readonly wood: number;
  readonly woodDark: number;
  readonly cloud: number;
  /** Cream stone edging every path and plaza (trim lit / shade). */
  readonly trim: number;
  readonly trimShade: number;
  /** Cliff bands, upper and lower. */
  readonly cliffHigh: number;
  readonly cliffLow: number;
  /** Warm lavender-grey rock (never neutral grey). */
  readonly rock: number;
  /** Cream plaster walls. */
  readonly wall: number;
}

/** Lighting, sky, water, post and sizes of one art direction. */
export interface Look {
  readonly name: string;
  readonly palette: LookPalette;
  readonly skyTop: number;
  readonly skyHorizon: number;
  readonly fog: { readonly color: number; readonly near: number; readonly far: number };
  readonly sun: { readonly color: number; readonly intensity: number; readonly dir: readonly [number, number, number] };
  readonly hemi: { readonly sky: number; readonly ground: number; readonly intensity: number };
  readonly exposure: number;
  readonly water: { readonly shallow: number; readonly mid: number; readonly deep: number; readonly foam: number; readonly glint: number };
  readonly post: { readonly bloom: number; readonly saturation: number; readonly contrast: number; readonly warmth: number; readonly vignette: number };
  readonly size: { readonly hubRadius: number; readonly zoneMargin: number };
}

/** Look B, the owner's pick (T1307), coloured by the T1364 art bible: late-morning light, warm sun, cool teal-violet shade. */
export const CAMPUS: Look = {
  name: 'Cosy campus island',
  palette: {
    grass: 0x9bcb4e,
    grassLight: 0x86c25a,
    leaves: [0x5db761, 0x7cc35a, 0x9bcb4e, 0x4fa866],
    dirt: 0xd39a6e,
    dirtDark: 0xa8735c,
    sand: 0xf7e2ae,
    stone: 0xf4e6cc,
    stoneDark: 0xd2bc9a,
    path: [0xe0844f, 0xd77a4a, 0xe89a68],
    wood: 0xb97a4a,
    woodDark: 0x8a5636,
    cloud: 0xfff8ee,
    trim: 0xf4e6cc,
    trimShade: 0xd2bc9a,
    cliffHigh: 0xecc193,
    cliffLow: 0xd39a6e,
    rock: 0xc7bbc9,
    wall: 0xf6ead3,
  },
  skyTop: 0x4fa3e0,
  skyHorizon: 0xfbe3c2,
  fog: { color: 0xf3e3cf, near: 170, far: 620 },
  sun: { color: 0xfff0d8, intensity: 2.5, dir: [0.65, 0.85, 0.5] },
  hemi: { sky: 0xfff4e2, ground: 0x4b5a8c, intensity: 1.35 },
  exposure: 1.02,
  water: { shallow: 0x5ed8d2, mid: 0x1fa4c9, deep: 0x1f5fa8, foam: 0xffffff, glint: 0xfff4e0 },
  post: { bloom: 0.08, saturation: 1.04, contrast: 1.04, warmth: 0.03, vignette: 0.18 },
  size: { hubRadius: 22, zoneMargin: 10 },
};
