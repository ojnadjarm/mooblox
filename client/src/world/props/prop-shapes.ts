import { ExtrudeGeometry, Shape, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Art-bible colours the activity props are painted in (ART-BIBLE.md palette). */
export const PropColour = {
  cream: 0xf4e6cc,
  creamShade: 0xd2bc9a,
  wood: 0xb97a4a,
  woodShade: 0x8a5636,
  teal: 0x2fa39a,
  tealLight: 0x48b8ad,
  tealShade: 0x1f7a78,
  coral: 0xf07a5f,
  sun: 0xf6c445,
  rock: 0xc7bbc9,
  rockShade: 0x8e86a3,
  iron: 0x3b3f4c,
  page: 0xfffaf0,
  screen: 0x24467e,
  glass: 0xbfe6f0,
} as const;

/** A w x h panel `d` thick facing +z, centred on the origin: rounded corners of radius `r` and a soft bevelled edge. */
export function roundedPanel(w: number, h: number, d: number, r: number, bevel = 0.03): BufferGeometry {
  const iw = w / 2 - bevel;
  const ih = h / 2 - bevel;
  const k = Math.min(r, iw, ih);
  const s = new Shape();
  s.moveTo(-iw + k, -ih);
  s.lineTo(iw - k, -ih);
  s.absarc(iw - k, -ih + k, k, -Math.PI / 2, 0, false);
  s.lineTo(iw, ih - k);
  s.absarc(iw - k, ih - k, k, 0, Math.PI / 2, false);
  s.lineTo(-iw + k, ih);
  s.absarc(-iw + k, ih - k, k, Math.PI / 2, Math.PI, false);
  s.lineTo(-iw, -ih + k);
  s.absarc(-iw + k, -ih + k, k, Math.PI, Math.PI * 1.5, false);
  return extrude(s, d, bevel);
}

/** A w-wide panel `d` thick facing +z, standing on y = 0 with a round arched top `h` high (doors, arch openings). */
export function archPanel(w: number, h: number, d: number): BufferGeometry {
  const r = w / 2;
  const s = new Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return extrude(s, d, 0, 5);
}

/** A hanging banner w x h, `d` thick, facing +z with its top edge on y = 0 and a swallowtail notch at the bottom. */
export function banner(w: number, h: number, d: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, -h);
  s.lineTo(0, -h + w * 0.4);
  s.lineTo(-w / 2, -h);
  s.lineTo(-w / 2, 0);
  return extrude(s, d, 0);
}

/**
 * A round arch of crisp cut-stone blocks facing +z: `blocks` voussoirs between radii `inner` and `outer`, centred on the
 * origin (the spring line), `d` deep, a small seam between blocks. The keystone (middle block) comes last.
 */
export function voussoirs(inner: number, outer: number, d: number, blocks: number): BufferGeometry[] {
  const seam = 0.025 / outer;
  const out: BufferGeometry[] = [];
  for (let i = 0; i < blocks; i++) {
    const a0 = (Math.PI * i) / blocks + seam;
    const a1 = (Math.PI * (i + 1)) / blocks - seam;
    const s = new Shape();
    s.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
    s.lineTo(Math.cos(a0) * outer, Math.sin(a0) * outer);
    s.lineTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
    s.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
    s.lineTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
    out.push(extrude(s, d, 0));
  }
  const key = Math.floor(blocks / 2);
  return [...out.slice(0, key), ...out.slice(key + 1), out[key]!];
}

/**
 * A curved awning `len` long along x: `strips` alternating bands (even ones first, then odd ones, so a caller can paint
 * each run), a sheet `t` thick bent over `sweep` radians of a circle of radius `r`, falling from the back (z = 0, y = 0) to
 * the front edge at z = r sin(sweep), y = -r (1 - cos(sweep)).
 */
export function awning(len: number, r: number, t: number, strips: number, sweep: number): { even: BufferGeometry; odd: BufferGeometry } {
  const s = new Shape();
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const a = sweep * (i / n);
    const [x, y] = [Math.sin(a) * r, Math.cos(a) * r - r];
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const a = sweep * (i / n);
    s.lineTo(Math.sin(a) * (r - t), Math.cos(a) * (r - t) - r + t);
  }
  const runs: BufferGeometry[][] = [[], []];
  const w = len / strips;
  for (let i = 0; i < strips; i++) {
    // The profile is drawn in (z, y); extruded along local z, then turned so the run lies along x.
    const g = extrude(s, w, 0).rotateY(-Math.PI / 2).translate(-len / 2 + w * i + w / 2, 0, 0);
    runs[i % 2]!.push(g);
  }
  return { even: merge(runs[0]!), odd: merge(runs[1]!) };
}

/** A row of `count` half-disc scallops `d` thick along x hanging below y = 0, the awning's valance. */
export function scallops(len: number, count: number, d: number): BufferGeometry {
  const r = len / count / 2;
  const s = new Shape();
  s.moveTo(-len / 2, 0);
  for (let i = 0; i < count; i++) s.absarc(-len / 2 + r * (2 * i + 1), 0, r, Math.PI, Math.PI * 2, false);
  s.lineTo(-len / 2, 0);
  return extrude(s, d, 0);
}

function extrude(s: Shape, d: number, bevel: number, curve = 2): BufferGeometry {
  const depth = Math.max(0.001, d - 2 * bevel);
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: curve });
  g.deleteAttribute('uv');
  g.translate(0, 0, -depth / 2);
  return g;
}

function merge(list: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(list, false)!;
  for (const p of list) p.dispose();
  return g;
}
