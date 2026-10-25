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

/** The colour script's sky (sRGB hex): dome gradient, sun, far sea below the horizon, cloud paint. */
export interface SkyScript {
  readonly zenith: number;
  readonly upper: number;
  readonly horizon: number;
  /** Warm glow on the horizon under the sun and round it. */
  readonly glow: number;
  /** Thin bright line where sea meets sky. */
  readonly line: number;
  readonly seaHorizon: number;
  readonly sea: number;
  readonly disc: number;
  readonly cloudLit: number;
  readonly cloudWarm: number;
  readonly cloudShade: number;
}

/** Lighting, sky, water, post and sizes of one art direction. */
export interface Look {
  readonly name: string;
  readonly palette: LookPalette;
  readonly sky: SkyScript;
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
  sky: {
    zenith: 0x3a8fdb,
    upper: 0x7dbdeb,
    horizon: 0xfbe3c2,
    glow: 0xffd39a,
    line: 0xf3ebd9,
    seaHorizon: 0xb2e0ee,
    sea: 0x4688d2,
    disc: 0xfff6df,
    cloudLit: 0xfffbf2,
    cloudWarm: 0xffe2b8,
    cloudShade: 0xc9c6e0,
  },
  fog: { color: 0xfbe3c2, near: 170, far: 620 },
  sun: { color: 0xffe6bf, intensity: 2.8, dir: [0.6, 0.62, 0.5] },
  hemi: { sky: 0xdce8f8, ground: 0x8a7290, intensity: 1.45 },
  exposure: 1.02,
  water: { shallow: 0x5ed8d2, mid: 0x54b6db, deep: 0x4688d2, foam: 0xffffff, glint: 0xfff4e0 },
  post: { bloom: 0.08, saturation: 1.04, contrast: 1.04, warmth: 0.03, vignette: 0.18 },
  size: { hubRadius: 22, zoneMargin: 10 },
};
