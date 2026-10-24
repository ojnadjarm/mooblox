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
  readonly water: { readonly shallow: number; readonly deep: number; readonly foam: number; readonly glint: number };
  readonly post: { readonly bloom: number; readonly saturation: number; readonly contrast: number; readonly warmth: number; readonly vignette: number };
  readonly size: { readonly hubRadius: number; readonly zoneMargin: number };
}

/** Look B, the owner's pick (T1307): soft pastel morning on a school village. */
export const CAMPUS: Look = {
  name: 'Cosy campus island',
  palette: {
    grass: 0x78bf5f,
    grassLight: 0x9fd77a,
    leaves: [0x8cc95a, 0x6fb556, 0xa9d66b, 0x5aa65e],
    dirt: 0xa77a55,
    dirtDark: 0x7c5840,
    sand: 0xf3e2b8,
    stone: 0xcfc7bd,
    stoneDark: 0x948a80,
    path: [0xc9765a, 0xb8664c, 0xd88a6a],
    wood: 0xb98552,
    woodDark: 0x7e5a3c,
    cloud: 0xfffaf2,
  },
  skyTop: 0x86bdf5,
  skyHorizon: 0xfbe9d8,
  fog: { color: 0xf4e7da, near: 110, far: 380 },
  sun: { color: 0xffe4c4, intensity: 2.4, dir: [0.65, 0.85, 0.5] },
  hemi: { sky: 0xffeedd, ground: 0x8a9a6a, intensity: 1.45 },
  exposure: 1.05,
  water: { shallow: 0x8fe3dc, deep: 0x4aa6d6, foam: 0xfffaf0, glint: 0xfff4e0 },
  post: { bloom: 0.12, saturation: 0.98, contrast: 1.02, warmth: 0.05, vignette: 0.22 },
  size: { hubRadius: 22, zoneMargin: 10 },
};
