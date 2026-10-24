import { box, mirrored, shade, type Part } from './parts';

const TOP = 2.7;
const FRINGE = 2.44;

type Style = (c: number) => Part[];

/** Shell over the head top and forehead down to the fringe line. */
function cap(c: number, t: number, front = 0.4 + t): Part[] {
  return [box('head', -0.4 - t, 0.4 + t, FRINGE + (t < 0.04 ? 0.06 : 0), TOP + t, -0.4 - t, front, c, 'crown')];
}

function back(c: number, t: number, y0: number, half = 0.4 + t): Part[] {
  return [box('head', -half, half, y0, FRINGE + 0.08, -0.4 - t, -0.4, c)];
}

/** Side panels from `y0` up to the fringe line, ending at `front` (stays behind the glasses hinge). */
function sides(c: number, t: number, y0: number, front: number): Part[] {
  return mirrored((s) => [box('head', s > 0 ? 0.4 : -0.4 - t, s > 0 ? 0.4 + t : -0.4, y0, FRINGE + 0.08, -0.4 - t, front, c)]);
}

function short(c: number): Part[] {
  return [...cap(c, 0.05), ...back(c, 0.05, 2.0), ...sides(c, 0.05, 2.3, 0.12)];
}

function cube(x: number, y: number, z: number, size: number, c: number, tag?: 'crown'): Part {
  const h = size / 2;
  return box('head', x - h, x + h, y - h, y + h, z - h, z + h, c, tag);
}

/** Hairstyles by id; every style is meshes on the head bone, clear of the face, eyes and glasses. */
export const HAIRSTYLES: Readonly<Record<string, Style>> = {
  buzz: (c) => [...cap(c, 0.025), ...back(c, 0.025, 2.1), ...sides(c, 0.025, 2.3, 0.1)],
  short,
  spiky: (c) => [
    ...short(c),
    ...[-0.24, 0, 0.24].flatMap((x, i) =>
      [-0.2, 0.15].map((z, j) => ({
        kind: 'spike' as const,
        bone: 'head' as const,
        min: [x - 0.13, TOP + 0.04, z - 0.13] as const,
        max: [x + 0.13, TOP + 0.04, z + 0.13] as const,
        apex: [x + (i - 1) * 0.08, TOP + 0.3 - j * 0.05, z - 0.1] as const,
        colour: c,
        tag: 'crown' as const,
      })),
    ),
  ],
  curly: (c) => {
    const curls: Part[] = [];
    for (let i = 0; i < 5; i++) curls.push(cube(-0.36 + i * 0.18, FRINGE + 0.05, 0.45, 0.13, c, 'crown'));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) curls.push(cube(-0.27 + i * 0.27, TOP + 0.06, -0.27 + j * 0.27, 0.14, shade(c, 0.92), 'crown'));
    for (const s of [1, -1]) for (let k = 0; k < 3; k++) curls.push(cube(s * 0.45, 2.36 - k * 0.12, -0.08 - k * 0.12, 0.13, c));
    for (let i = 0; i < 4; i++) curls.push(cube(-0.3 + i * 0.2, 2.1, -0.45, 0.14, shade(c, 0.92)));
    return [...cap(c, 0.05), ...back(c, 0.05, 2.0), ...sides(c, 0.05, 2.2, 0.06), ...curls];
  },
  afro: (c) => [
    box('head', -0.56, 0.56, FRINGE, 2.98, -0.56, 0.47, c, 'crown'),
    box('head', -0.46, 0.46, 2.98, 3.06, -0.46, 0.38, shade(c, 0.95), 'crown'),
    box('head', -0.56, 0.56, 2.0, FRINGE, -0.58, -0.4, c),
    ...mirrored((s) => [box('head', s > 0 ? 0.4 : -0.58, s > 0 ? 0.58 : -0.4, 2.06, FRINGE, -0.56, 0.12, c)]),
  ],
  bob: (c) => [...cap(c, 0.06), ...back(c, 0.07, 1.98), ...sides(c, 0.07, 1.98, 0.14)],
  long: (c) => [
    ...cap(c, 0.06),
    ...back(c, 0.07, 1.9),
    ...sides(c, 0.07, 1.9, 0.12),
    box('head', -0.36, 0.36, 1.4, 1.9, -0.47, -0.34, shade(c, 0.94)),
  ],
  ponytail: (c) => [
    ...cap(c, 0.05),
    ...back(c, 0.05, 2.1),
    ...sides(c, 0.05, 2.25, 0.12),
    box('head', -0.1, 0.1, 2.36, 2.5, -0.5, -0.45, shade(c, 0.7)),
    box('head', -0.09, 0.09, 2.0, 2.4, -0.62, -0.47, c),
    box('head', -0.07, 0.07, 1.78, 2.0, -0.6, -0.48, shade(c, 0.94)),
  ],
  buns: (c) => [...short(c), cube(0.3, TOP + 0.16, -0.05, 0.24, c, 'crown'), cube(-0.3, TOP + 0.16, -0.05, 0.24, c, 'crown')],
  braids: (c) => [
    ...cap(c, 0.05),
    ...back(c, 0.05, 2.0),
    ...sides(c, 0.05, 2.25, 0.12),
    ...mirrored((s) => {
      const out: Part[] = [];
      for (let k = 0; k < 5; k++) out.push(cube(s * (0.2 + (k % 2 ? 0.02 : -0.02)), 1.94 - k * 0.12, -0.48, 0.14, k % 2 ? shade(c, 0.88) : c));
      out.push(cube(s * 0.2, 1.34, -0.48, 0.08, shade(c, 0.6)));
      return out;
    }),
  ],
  mohawk: (c) => [
    ...cap(shade(c, 0.85), 0.02),
    ...back(shade(c, 0.85), 0.02, 2.1),
    box('head', -0.08, 0.08, TOP + 0.02, TOP + 0.24, -0.38, 0.32, c, 'crown'),
    box('head', -0.08, 0.08, 2.3, TOP + 0.02, -0.5, -0.4, c),
  ],
};
