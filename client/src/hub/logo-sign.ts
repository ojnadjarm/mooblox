import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, ExtrudeGeometry, Path, Shape, SphereGeometry, Vector2, type BufferGeometry } from 'three';
import type { LookPalette } from '../world/look';
import { Surface } from '../world/surfaces';
import { HUB } from './hub-layout';
import wordmark from './wordmark.json';

/** The two sign designs: chunky letters on a plate standing on a gateway beam, or a framed wooden board hanging from it. */
export type LogoSignDesign = 'gateway' | 'board';

type Wood = Pick<LookPalette, 'trim' | 'trimShade' | 'wood' | 'woodDark'>;

/** Where the sign stands: outside the north balustrade, behind the middle portal, facing the hub centre (+z). Metres. */
export const LOGO_SIGN = { z: -(HUB.wall + 1), post: 6.4, beam: 9.6 } as const;

/** Logo colours, lit and shade. */
const COLOURS = {
  terra: [0xe0844f, 0xb4583a],
  teal: [0x2fa39a, 0x1f7a78],
  cream: [0xfffbf2, 0xd2bc9a],
  grass: [0xa1c270, 0x5fa866],
  band: [0xf4e6cc, 0xd2bc9a],
  ink: [0x2b2f3a, 0x2b2f3a],
  rope: [0xc9b48a, 0x8a7656],
} as const;
type Paint = keyof typeof COLOURS;

/** Every solid piece of the sign, one geometry each, local to the hub. */
export function logoSignParts(p: Wood, design: LogoSignDesign = 'gateway'): BufferGeometry[] {
  return design === 'gateway' ? gateway(p) : board(p);
}

/** Gateway: two cream posts and a wooden beam; on it a cream plate with extruded letters, and the island block on the left. */
function gateway(p: Wood): BufferGeometry[] {
  const { z, post, beam } = LOGO_SIGN;
  const scale = 0.026;
  const parts = frame(p, beam);
  const lift = beam + 0.4 - 0.12 - plateBottom() * scale;
  parts.push(plate(scale, 0.36, z - 0.5).translate(1, lift, 0));
  parts.push(...letters(scale, 0.32, z - 0.18).map((g) => g.translate(1, lift, 0)));
  parts.push(...island(2.4).map((g) => g.translate(-post + 0.9, beam + 0.4 - 0.08, z - 0.3)));
  return parts;
}

/** Board: a framed plank signboard hung on two ropes from the beam, raised letters and the island block on its face. */
function board(p: Wood): BufferGeometry[] {
  const { z, post, beam } = LOGO_SIGN;
  const scale = 0.0225;
  const high = beam + 3.6;
  const parts = frame(p, high);
  const w = post * 2 - 1.6;
  const h = 3.4;
  const top = beam + 2.9;
  const y0 = top - h;
  const planks = 3;
  parts.push(paint(new BoxGeometry(w, h, 0.12), p.woodDark, p.woodDark).translate(0, y0 + h / 2, z - 0.2));
  for (let i = 0; i < planks; i++) {
    // Each plank stands 12 mm proud of the one below: no two plank faces share a plane.
    parts.push(paint(new BoxGeometry(w, h / planks - 0.04, 0.3), p.wood, p.woodDark).translate(0, y0 + (i + 0.5) * (h / planks), z + 0.012 * i));
  }
  const rim = 0.26;
  parts.push(
    paint(new BoxGeometry(w + rim * 2, rim, 0.5), p.woodDark, p.woodDark).translate(0, top + rim / 2, z),
    paint(new BoxGeometry(w + rim * 2, rim, 0.5), p.woodDark, p.woodDark).translate(0, y0 - rim / 2, z),
    paint(new BoxGeometry(rim, h, 0.46), p.woodDark, p.woodDark).translate(-w / 2 - rim / 2, y0 + h / 2, z),
    paint(new BoxGeometry(rim, h, 0.46), p.woodDark, p.woodDark).translate(w / 2 + rim / 2, y0 + h / 2, z),
  );
  for (const x of [-w / 2 + 1.2, w / 2 - 1.2]) {
    parts.push(paint(new CylinderGeometry(0.07, 0.07, high - top, 5), ...COLOURS.rope).translate(x, (high + top) / 2 + 0.1, z - 0.05));
  }
  const face = z + 0.15 + 0.012 * (planks - 1);
  const mid = (y0 + top) / 2 - ((wordTop() + wordBottom()) / 2) * scale;
  parts.push(...letters(scale, 0.26, face - 0.09).map((g) => g.translate(1.1, mid, 0)));
  parts.push(...island(1.4).map((g) => g.translate(-w / 2 + 1.25, y0 + 0.5, face + 0.45)));
  return parts;
}

/** Two posts on foot rings and a beam whose underside is at `top` - 0.02 and top at `top` + 0.4. */
function frame(p: Wood, top: number): BufferGeometry[] {
  const { z, post } = LOGO_SIGN;
  return [
    ...[-post, post].flatMap((x) => [
      paint(new CylinderGeometry(0.42, 0.5, top, 6), p.trim, p.trimShade).translate(x, top / 2, z - 0.3),
      paint(new CylinderGeometry(0.62, 0.62, 0.35, 6), p.trimShade, p.trimShade).translate(x, 0.175, z - 0.3),
    ]),
    paint(new BoxGeometry(post * 2 + 1.4, 0.42, 0.62), p.wood, p.woodDark).translate(0, top + 0.19, z - 0.3),
  ];
}

/** The wordmark's letters extruded `depth` m with a bevel, centred on x = 0, baseline at y = 0, backs at z = `back`. */
function letters(scale: number, depth: number, back: number): BufferGeometry[] {
  const cx = (wordLeft() + wordRight()) / 2;
  const bevel = 0.05 / scale;
  return wordmark.glyphs.map((g) => {
    const shapes = g.shapes.map(({ outer, holes }) => {
      const shape = new Shape(outer.map(([x, y]) => new Vector2(x!, y!)));
      shape.holes = holes.map((h) => new Path(h.map(([x, y]) => new Vector2(x!, y!))));
      return shape;
    });
    const solid = new ExtrudeGeometry(shapes, { depth: depth / scale - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: 1 });
    const [lit, shade] = COLOURS[g.colour as Paint];
    return plain(paint(solid.translate(-cx, 0, bevel).scale(scale, scale, scale), lit, shade).translate(0, 0, back));
  });
}

/** The logo's cream sticker outline as a slab `thick` m deep, back at z = `back`, in the letters' frame. */
function plate(scale: number, thick: number, back: number): BufferGeometry {
  const cx = (wordLeft() + wordRight()) / 2;
  const shape = new Shape();
  wordmark.plate.forEach(([x, y], i) => (i ? shape.lineTo(x! - cx, y!) : shape.moveTo(x! - cx, y!)));
  shape.closePath();
  const slab = new ExtrudeGeometry(shape, { depth: thick / scale, bevelEnabled: false, curveSegments: 1 }).scale(scale, scale, scale);
  return plain(paint(slab, ...COLOURS.cream).translate(0, 0, back));
}

/**
 * The logo's block island, about `size` m wide, standing on y = 0: a tall cube turned 45 degrees and tipped to the viewer,
 * terracotta with a cream band, a grass top, a cream tower with an ink door and a teal dome, and a cloud at its foot.
 */
function island(size: number): BufferGeometry[] {
  const s = size / Math.SQRT2;
  const h = s * 1.15;
  const t = s * 0.26;
  const parts = [
    paint(new BoxGeometry(s, h, s), ...COLOURS.terra).translate(0, h / 2, 0),
    paint(new BoxGeometry(s + 0.04, s * 0.28, s + 0.04), ...COLOURS.band).translate(0, s * 0.55, 0),
    paint(new BoxGeometry(s + 0.06, s * 0.1, s + 0.06), ...COLOURS.grass).translate(0, h + s * 0.03, 0),
    paint(new BoxGeometry(t, s * 0.34, t), ...COLOURS.cream).translate(0, h + s * 0.06 + s * 0.17, -s * 0.12),
    paint(new BoxGeometry(t * 0.36, s * 0.16, 0.04), ...COLOURS.ink).translate(0, h + s * 0.16, -s * 0.12 + t / 2),
    paint(new SphereGeometry(t * 0.62, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), ...COLOURS.teal).translate(0, h + s * 0.39, -s * 0.12),
    paint(new CylinderGeometry(0.03, 0.03, s * 0.12, 4), ...COLOURS.ink).translate(0, h + s * 0.39 + t * 0.62, -s * 0.12),
  ];
  for (const g of parts) g.rotateY(Math.PI / 4).rotateX(0.24);
  const puff = (r: number, x: number, y: number) => paint(new SphereGeometry(r, 7, 5), ...COLOURS.cream).translate(x, y, s * 0.6);
  parts.push(puff(s * 0.24, -s * 0.62, s * 0.2), puff(s * 0.3, -s * 0.32, s * 0.28), puff(s * 0.2, -s * 0.06, s * 0.18));
  return parts.map(plain);
}

/** Flat-shaded, non-indexed copy of `g`: `lit` on faces turned to the viewer (+z) or up, `shade` on sides and bevels. */
function paint(g: BufferGeometry, lit: number, shade: number): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  for (const key of Object.keys(flat.attributes)) if (key !== 'position') flat.deleteAttribute(key);
  flat.clearGroups();
  flat.computeVertexNormals();
  const n = flat.getAttribute('normal');
  const col = new Float32Array(n.count * 3);
  const a = new Color(lit);
  const b = new Color(shade);
  for (let i = 0; i < n.count; i++) col.set((n.getZ(i) > 0.8 || n.getY(i) > 0.55 ? a : b).toArray(), i * 3);
  flat.setAttribute('color', new BufferAttribute(col, 3));
  return flat;
}

/** Tags `g` with an untextured atlas layer: the logo's pieces stay clean painted plastic. */
function plain(g: BufferGeometry): BufferGeometry {
  g.setAttribute('surface', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(Surface.metal), 1));
  return g;
}

const points = () => wordmark.glyphs.flatMap((g) => g.shapes.flatMap((sh) => sh.outer));
const wordLeft = () => Math.min(...points().map((p) => p[0]!));
const wordRight = () => Math.max(...points().map((p) => p[0]!));
const wordBottom = () => Math.min(...points().map((p) => p[1]!));
const wordTop = () => Math.max(...points().map((p) => p[1]!));
const plateBottom = () => Math.min(...wordmark.plate.map((p) => p[1]!));
