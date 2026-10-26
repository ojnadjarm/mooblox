import { BoxGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paintPlace } from './dressing';
import { sceneryGeometry } from './scenery';

/** Animal kinds that walk or paddle in the world. */
export type CritterKind = 'duck' | 'cat' | 'dog';

const INK = 0x2b2f3a;
const WHITE = 0xffffff;
const ROSE = 0xff8a9a;

type Box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => BufferGeometry;

const box: Box = (w, h, d, c, x, y, z) => paintPlace(new BoxGeometry(w, h, d), c, x, y, z, 0);

/** The kid avatars' face on a front plane at `z`: square ink eyes with a white highlight, rosy cheeks. */
function face(eyeX: number, eyeY: number, eye: number, z: number, cheekX: number, cheekY: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(box(eye, eye * 1.15, 0.012, INK, s * eyeX, eyeY, z + 0.006));
    parts.push(box(eye * 0.38, eye * 0.38, 0.008, WHITE, s * eyeX + eye * 0.2, eyeY + eye * 0.25, z + 0.014));
    parts.push(box(eye * 0.8, eye * 0.4, 0.006, ROSE, s * cheekX, cheekY, z + 0.003));
  }
  return parts;
}

/** Cat: orange tabby with pointed pink-lined ears, cream muzzle, pink nose, back stripes, white paws and tail tip. */
function cat(): BufferGeometry[] {
  const fur = 0xf2a33a;
  const dark = 0xc96f1f;
  const cream = 0xfff0d2;
  const parts = [box(0.32, 0.28, 0.62, fur, 0, 0.36, 0), box(0.3, 0.28, 0.28, fur, 0, 0.58, 0.38)];
  for (const s of [-1, 1]) {
    parts.push(box(0.09, 0.06, 0.06, fur, s * 0.09, 0.75, 0.36), box(0.045, 0.05, 0.045, fur, s * 0.1, 0.805, 0.36), box(0.05, 0.05, 0.006, ROSE, s * 0.09, 0.765, 0.393));
  }
  parts.push(...face(0.075, 0.625, 0.065, 0.52, 0.115, 0.545));
  parts.push(box(0.14, 0.08, 0.05, cream, 0, 0.53, 0.545), box(0.05, 0.03, 0.02, ROSE, 0, 0.565, 0.575), box(0.04, 0.012, 0.006, INK, 0, 0.51, 0.572));
  for (const z of [-0.18, -0.03, 0.12]) parts.push(box(0.326, 0.03, 0.05, dark, 0, 0.495, z));
  parts.push(box(0.2, 0.16, 0.01, cream, 0, 0.36, 0.31));
  parts.push(box(0.07, 0.07, 0.32, dark, 0, 0.62, -0.38), box(0.074, 0.074, 0.08, cream, 0, 0.62, -0.57));
  for (const x of [-0.1, 0.1]) for (const z of [-0.22, 0.22]) parts.push(box(0.08, 0.2, 0.08, dark, x, 0.14, z), box(0.085, 0.045, 0.085, cream, x, 0.0225, z));
  return parts;
}

/** Dog: brown pup with floppy dark ears, tan muzzle, black nose, pink tongue, an eye patch, a back patch and a red collar with a gold tag. */
function dog(): BufferGeometry[] {
  const fur = 0xb07a48;
  const dark = 0x6e4a2a;
  const tan = 0xf0d2a8;
  const parts = [box(0.32, 0.28, 0.62, fur, 0, 0.36, 0), box(0.3, 0.28, 0.28, fur, 0, 0.58, 0.38)];
  for (const s of [-1, 1]) parts.push(box(0.05, 0.17, 0.11, dark, s * 0.175, 0.6, 0.37));
  parts.push(box(0.1, 0.11, 0.006, dark, 0.075, 0.625, 0.523));
  parts.push(...face(0.075, 0.625, 0.065, 0.526, 0.115, 0.545));
  parts.push(box(0.16, 0.1, 0.09, tan, 0, 0.525, 0.565), box(0.06, 0.04, 0.03, INK, 0, 0.565, 0.62), box(0.045, 0.012, 0.006, INK, 0, 0.5, 0.612), box(0.04, 0.03, 0.02, ROSE, 0.02, 0.475, 0.6));
  parts.push(box(0.22, 0.03, 0.26, dark, 0.02, 0.505, -0.08), box(0.006, 0.14, 0.16, dark, -0.162, 0.38, 0.05));
  parts.push(box(0.316, 0.045, 0.296, 0xd9534f, 0, 0.465, 0.38), box(0.04, 0.04, 0.012, 0xe8b84a, 0, 0.43, 0.53));
  parts.push(box(0.07, 0.07, 0.22, fur, 0, 0.5, -0.4), box(0.074, 0.074, 0.06, tan, 0, 0.5, -0.5));
  for (const x of [-0.1, 0.1]) for (const z of [-0.22, 0.22]) parts.push(box(0.08, 0.2, 0.08, dark, x, 0.14, z), box(0.085, 0.045, 0.085, tan, x, 0.0225, z));
  return parts;
}

/** Duck: white mallard with a green head, white neck ring, orange beak, grey wings with a blue flash and a dark tail. */
function duck(): BufferGeometry[] {
  const parts = [box(0.34, 0.22, 0.5, 0xfafafa, 0, 0.11, 0), box(0.2, 0.22, 0.2, 0x2f8f4e, 0, 0.32, 0.2), box(0.12, 0.05, 0.14, 0xf2a33a, 0, 0.3, 0.36)];
  parts.push(...face(0.05, 0.375, 0.045, 0.3, 0.075, 0.33));
  parts.push(box(0.21, 0.03, 0.21, WHITE, 0, 0.225, 0.2));
  for (const s of [-1, 1]) parts.push(box(0.02, 0.12, 0.28, 0xb9b4ae, s * 0.175, 0.14, -0.03), box(0.024, 0.035, 0.08, 0x3f6fd9, s * 0.176, 0.14, -0.12));
  parts.push(box(0.16, 0.08, 0.1, 0x3a3a3a, 0, 0.2, -0.28));
  return parts;
}

/** Blocky animals built from boxes, facing +z, standing on y = 0, with faces in the kid avatars' style and their markings. */
export function animalGeometry(kind: CritterKind): BufferGeometry {
  const parts = kind === 'duck' ? duck() : kind === 'cat' ? cat() : dog();
  return sceneryGeometry(mergeGeometries(parts, false)!);
}
