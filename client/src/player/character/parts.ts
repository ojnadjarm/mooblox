/** Bones of the Kenney blocky rig, in skin-index order. */
export const BONES = ['root', 'leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head'] as const;
export type BoneName = (typeof BONES)[number];

export type Vec3 = readonly [number, number, number];

/** An axis-aligned box in bind space (metres, +z = front), flat-coloured. */
export interface BoxPart {
  readonly kind: 'box';
  readonly bone: BoneName;
  readonly min: Vec3;
  readonly max: Vec3;
  readonly colour: number;
  /** `crown` = hair above the head top, which a hat slot may hide. */
  readonly tag?: 'crown';
}

/** A four-sided pyramid: base rectangle at min.y, apex anywhere. */
export interface SpikePart {
  readonly kind: 'spike';
  readonly bone: BoneName;
  readonly min: Vec3;
  readonly max: Vec3;
  readonly apex: Vec3;
  readonly colour: number;
  readonly tag?: 'crown';
}

/** A front-facing quad showing an atlas tile, multiplied by `colour`. */
export interface QuadPart {
  readonly kind: 'quad';
  readonly bone: BoneName;
  readonly centre: Vec3;
  readonly width: number;
  readonly height: number;
  readonly tile: string;
  readonly colour: number;
  readonly mirror?: boolean;
}

/** A designed model (a hat from `cosmetics/hats.glb`): flat-shaded triangles with linear vertex colours, in bind space. */
export interface MeshPart {
  readonly kind: 'mesh';
  readonly bone: BoneName;
  /** xyz per vertex, three vertices per triangle. */
  readonly positions: Float32Array;
  /** Linear rgb per vertex. */
  readonly colours: Float32Array;
  readonly tag?: undefined;
}

export type Part = BoxPart | SpikePart | QuadPart | MeshPart;

/** Bind-space bounds of the body blocks (Kenney Blocky Characters 2.0 proportions). */
export const BODY = {
  head: { min: [-0.4, 1.9, -0.4], max: [0.4, 2.7, 0.4] },
  torso: { min: [-0.4, 1.0, -0.3], max: [0.4, 1.9, 0.3] },
  armLeft: { min: [0.4, 0.8, -0.3], max: [0.8, 1.9, 0.1] },
  armRight: { min: [-0.8, 0.8, -0.3], max: [-0.4, 1.9, 0.1] },
  legLeft: { min: [0, 0, -0.2], max: [0.4, 1.0, 0.2] },
  legRight: { min: [-0.4, 0, -0.2], max: [0, 1.0, 0.2] },
} as const;

export function box(bone: BoneName, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, colour: number, tag?: 'crown'): BoxPart {
  return tag ? { kind: 'box', bone, min: [x0, y0, z0], max: [x1, y1, z1], colour, tag } : { kind: 'box', bone, min: [x0, y0, z0], max: [x1, y1, z1], colour };
}

/** Both sides of a part built for +x, mirrored to -x. */
export function mirrored(make: (sign: 1 | -1) => Part[]): Part[] {
  return [...make(1), ...make(-1)];
}

/** Scales an sRGB colour's channels by `k` (0..1 darker, >1 lighter, clamped). */
export function shade(hex: number, k: number): number {
  const c = (s: number) => Math.min(255, Math.round(((hex >> s) & 255) * k));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** Triangles a part adds to the merged mesh. */
export function triangles(part: Part): number {
  return part.kind === 'box' ? 12 : part.kind === 'spike' ? 6 : part.kind === 'mesh' ? part.positions.length / 9 : 2;
}
