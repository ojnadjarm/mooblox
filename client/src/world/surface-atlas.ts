import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, LinearMipmapNearestFilter, NoColorSpace, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three';
import { seededRandom } from './random';
import { ATLAS_LAYERS, Surface } from './surfaces';

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
type Painter = (g: Ctx, s: number, rnd: () => number, accent: Ctx) => void;

/**
 * The world's texture language: one hand-painted tiling layer per surface (grass blades, brick courses, plank seams,
 * shingles, flagstones, sand ripples, cliff strata), greyscale around mid grey so the vertex colours keep the palette.
 * Alpha marks painted accents (meadow flowers) that replace the vertex colour. One array texture, mip-mapped (`cheap`: one
 * mip level per fetch, no anisotropy, for the low tier).
 */
export function surfaceAtlas(size: number, cheap = false): DataArrayTexture {
  const layers = ATLAS_LAYERS.length;
  const data = new Uint8Array(size * size * 4 * layers);
  const base = canvas(size);
  const over = canvas(size);
  for (let i = 0; i < layers; i++) {
    const g = base.getContext('2d') as Ctx;
    const a = over.getContext('2d') as Ctx;
    g.fillStyle = grey(0.5);
    g.fillRect(0, 0, size, size);
    a.clearRect(0, 0, size, size);
    PAINTERS[i]?.(g, size, seededRandom(0x5eed + i * 977), a);
    const px = g.getImageData(0, 0, size, size).data;
    const ac = a.getImageData(0, 0, size, size).data;
    const out = i * size * size * 4;
    for (let k = 0; k < size * size * 4; k += 4) {
      const cover = ac[k + 3]!;
      const src = cover > 8 ? ac : px;
      data[out + k] = src[k]!;
      data[out + k + 1] = src[k + 1]!;
      data[out + k + 2] = src[k + 2]!;
      data[out + k + 3] = cover;
    }
  }
  const t = new DataArrayTexture(data, size, size, layers);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = cheap ? LinearMipmapNearestFilter : LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = NoColorSpace;
  t.anisotropy = cheap ? 1 : 4;
  t.needsUpdate = true;
  return t;
}

function canvas(size: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

const grey = (v: number, a = 1): string => {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${c},${c},${c},${a})`;
};

/** Draws `fn` at (x, y) and at its wrapped copies wherever a shape of reach `r` crosses a tile edge (seamless tiles). */
function wrapped(s: number, x: number, y: number, r: number, fn: (x: number, y: number) => void): void {
  for (const dx of [-s, 0, s]) {
    if ((dx < 0 && x + dx + r < 0) || (dx > 0 && x + dx - r > s)) continue;
    for (const dy of [-s, 0, s]) {
      if ((dy < 0 && y + dy + r < 0) || (dy > 0 && y + dy - r > s)) continue;
      fn(x + dx, y + dy);
    }
  }
}

function blob(g: Ctx, x: number, y: number, rx: number, ry: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

/** Soft painterly patches of a lighter or darker value (large, few: paint variation, not noise). */
function patches(g: Ctx, s: number, rnd: () => number, n: number, spread: number): void {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = s * (0.12 + rnd() * 0.18);
    const v = 0.5 + (rnd() - 0.5) * spread;
    wrapped(s, x, y, r, (px, py) => {
      const grd = g.createRadialGradient(px, py, 0, px, py, r);
      grd.addColorStop(0, grey(v, 0.55));
      grd.addColorStop(1, grey(v, 0));
      g.fillStyle = grd;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
}

/** Grass: soft clover patches and many little three-blade tufts, lit tips over a darker root. */
const grass: Painter = (g, s, rnd) => {
  patches(g, s, rnd, 8, 0.3);
  const tufts = Math.round(s * 0.16);
  g.lineCap = 'round';
  for (let i = 0; i < tufts; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const h = s * (0.04 + rnd() * 0.035);
    const lit = 0.68 + rnd() * 0.1;
    wrapped(s, x, y, h * 1.5, (px, py) => {
      blob(g, px, py + h * 0.1, h * 0.6, h * 0.25, grey(0.32, 0.6));
      g.lineWidth = Math.max(1.5, s / 180);
      for (const lean of [-0.55, 0, 0.5]) {
        g.strokeStyle = grey(lit + lean * 0.05);
        g.beginPath();
        g.moveTo(px + lean * h * 0.2, py);
        g.quadraticCurveTo(px + lean * h * 0.5, py - h * 0.6, px + lean * h, py - h * (lean === 0 ? 1.1 : 0.85));
        g.stroke();
      }
    });
  }
};

/** Meadow: the grass tile with painted flower heads (accent layer replaces the vertex colour). */
const meadow: Painter = (g, s, rnd, accent) => {
  grass(g, s, rnd, accent);
  const colours = ['#fff4d6', '#ffd23f', '#ff8fb1', '#b58cff', '#ffffff'];
  for (let i = 0; i < Math.round(s * 0.07); i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = s * (0.014 + rnd() * 0.01);
    const c = colours[Math.floor(rnd() * colours.length)]!;
    wrapped(s, x, y, r * 3, (px, py) => {
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        blob(accent, px + Math.cos(a) * r, py + Math.sin(a) * r, r * 0.8, r * 0.8, c);
      }
      blob(accent, px, py, r * 0.6, r * 0.6, '#f2a93b');
    });
  }
};

/** Foliage: overlapping round leaf clumps, each lit on top with a darker underside (scalloped crown). */
const foliage: Painter = (g, s, rnd) => {
  const n = Math.round(s * 0.12);
  for (let i = 0; i < n; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = s * (0.05 + rnd() * 0.035);
    wrapped(s, x, y, r * 1.2, (px, py) => {
      blob(g, px, py + r * 0.15, r, r * 0.85, grey(0.38));
      blob(g, px - r * 0.12, py - r * 0.05, r * 0.82, r * 0.68, grey(0.52));
      blob(g, px - r * 0.3, py - r * 0.28, r * 0.38, r * 0.26, grey(0.66));
      for (let k = 0; k < 4; k++) leaf(g, px + (rnd() - 0.6) * r * 1.2, py - r * (0.2 + rnd() * 0.5), r * 0.22, -0.6 + rnd() * 0.8, grey(0.62 + rnd() * 0.1));
    });
  }
};

/** Wood: plank courses with dark seams, a worn light top edge, grain lines and nail heads. */
const wood: Painter = (g, s, rnd) => {
  const rows = 4;
  const h = s / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * h;
    const cuts = [0, s * (0.3 + rnd() * 0.4)];
    for (let c = 0; c < cuts.length; c++) {
      const x0 = cuts[c]! + (r % 2) * s * 0.5;
      const w = c === 0 ? cuts[1]! : s - cuts[1]!;
      const v = 0.46 + rnd() * 0.12;
      wrapped(s, x0 + w / 2, y + h / 2, w, (px) => {
        const x = px - w / 2;
        g.fillStyle = grey(v);
        g.fillRect(x, y, w, h);
        g.fillStyle = grey(v + 0.12);
        g.fillRect(x, y + h * 0.06, w, h * 0.08);
        g.strokeStyle = grey(v - 0.1, 0.7);
        g.lineWidth = Math.max(1, s / 256);
        for (let k = 0; k < 3; k++) {
          const gy = y + h * (0.3 + k * 0.22 + rnd() * 0.05);
          g.beginPath();
          g.moveTo(x + w * 0.05, gy);
          g.bezierCurveTo(x + w * 0.35, gy + h * 0.06, x + w * 0.65, gy - h * 0.06, x + w * 0.95, gy);
          g.stroke();
        }
        if (rnd() < 0.5) knot(g, x + w * (0.25 + rnd() * 0.5), y + h * (0.35 + rnd() * 0.3), h * (0.1 + rnd() * 0.06), v);
        for (let k = 0; k < 2; k++) blob(g, x + w * rnd(), y + h * (0.1 + rnd() * 0.08), w * 0.06, h * 0.05, grey(v + 0.16, 0.7));
        g.fillStyle = grey(0.24);
        g.fillRect(x, y, Math.max(2, s / 128), h);
        for (const nx of [x + w * 0.06, x + w * 0.94]) {
          blob(g, nx, y + h * 0.3, s / 160, s / 160, grey(0.3));
          blob(g, nx, y + h * 0.72, s / 160, s / 160, grey(0.3));
        }
      });
    }
    g.fillStyle = grey(0.22);
    g.fillRect(0, y + h - Math.max(2, s / 96), s, Math.max(2, s / 96));
  }
};

/** Running-bond bricks (or paving setts): each brick its own value, light top edge, dark bottom, cream mortar. */
function bricks(g: Ctx, s: number, rnd: () => number, rows: number, perRow: number, mortar: number): void {
  g.fillStyle = grey(mortar);
  g.fillRect(0, 0, s, s);
  const h = s / rows;
  const w = s / perRow;
  const gap = Math.max(2, s / 110);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= perRow; c++) {
      const x = c * w - (r % 2) * w * 0.5;
      const y = r * h;
      const v = 0.44 + rnd() * 0.14;
      wrapped(s, x + w / 2, y + h / 2, w, (px, py) => {
        const bx = px - w / 2 + gap / 2;
        const by = py - h / 2 + gap / 2;
        const bw = w - gap;
        const bh = h - gap;
        g.fillStyle = grey(v);
        g.beginPath();
        g.roundRect(bx, by, bw, bh, gap);
        g.fill();
        g.fillStyle = grey(v + 0.1);
        g.fillRect(bx + gap, by + gap * 0.4, bw - gap * 2, bh * 0.16);
        g.fillStyle = grey(v - 0.08);
        g.fillRect(bx + gap, by + bh * 0.8, bw - gap * 2, bh * 0.16);
        if (rnd() < 0.18) blob(g, bx + bw * rnd(), by + bh * 0.5, bw * 0.12, bh * 0.14, grey(v - 0.07, 0.8));
        if (rnd() < 0.22) blob(g, bx + (rnd() < 0.5 ? 0 : bw), by + (rnd() < 0.5 ? 0 : bh), bh * 0.18, bh * 0.14, grey(mortar - 0.12));
        if (rnd() < 0.12) wear(g, bx + bw * 0.5, by + bh * 0.5, bw * 0.4, bh * 0.4, rnd);
      });
    }
  }
}

const brick: Painter = (g, s, rnd) => bricks(g, s, rnd, 8, 4, 0.7);

/** Flagstones: irregular slabs with soft edges, worn light rims and a few hairline cracks. */
const paving: Painter = (g, s, rnd, accent) => {
  g.fillStyle = grey(0.36);
  g.fillRect(0, 0, s, s);
  jointMoss(accent, s, rnd, s / 4, 0.6);
  const cells = 4;
  const c = s / cells;
  const gap = Math.max(2, s / 90);
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x = i * c + (j % 2) * c * 0.5;
      const y = j * c;
      const v = 0.5 + rnd() * 0.1;
      wrapped(s, x + c / 2, y + c / 2, c, (px, py) => {
        g.fillStyle = grey(v);
        g.beginPath();
        g.roundRect(px - c / 2 + gap, py - c / 2 + gap, c - gap * 2, c - gap * 2, c * 0.12);
        g.fill();
        g.fillStyle = grey(v + 0.08);
        g.fillRect(px - c / 2 + gap * 2, py - c / 2 + gap * 1.5, c - gap * 4, c * 0.08);
        g.fillStyle = grey(v - 0.07);
        g.fillRect(px - c / 2 + gap * 2, py + c / 2 - gap - c * 0.07, c - gap * 4, c * 0.06);
        wear(g, px, py, c * 0.3, c * 0.3, rnd);
        if (rnd() < 0.3) {
          g.strokeStyle = grey(v - 0.14);
          g.lineWidth = Math.max(1, s / 300);
          g.beginPath();
          let cx = px - c * 0.3 + rnd() * c * 0.2;
          let cy = py - c * 0.3 + rnd() * c * 0.2;
          g.moveTo(cx, cy);
          for (let k = 0; k < 3; k++) {
            cx += c * (0.1 + rnd() * 0.12);
            cy += c * (rnd() - 0.3) * 0.2;
            g.lineTo(cx, cy);
          }
          g.stroke();
        }
      });
    }
  }
};

/** Roof shingles: offset rows of rounded tabs, each with a shadowed lower lip. */
const roof: Painter = (g, s, rnd) => {
  const rows = 6;
  const per = 6;
  const h = s / rows;
  const w = s / per;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= per; c++) {
      const x = c * w + (r % 2) * w * 0.5;
      const y = r * h;
      const v = 0.48 + rnd() * 0.1;
      wrapped(s, x, y + h / 2, w, (px, py) => {
        g.fillStyle = grey(v - 0.16);
        g.beginPath();
        g.roundRect(px - w / 2, py - h / 2, w, h * 1.08, [0, 0, w * 0.45, w * 0.45]);
        g.fill();
        g.fillStyle = grey(v);
        g.beginPath();
        g.roundRect(px - w / 2 + 1.5, py - h / 2, w - 3, h * 0.96, [0, 0, w * 0.42, w * 0.42]);
        g.fill();
        g.fillStyle = grey(v + 0.1);
        g.fillRect(px - w * 0.3, py - h * 0.4, w * 0.6, h * 0.12);
        g.fillStyle = grey(v - 0.06, 0.6);
        g.fillRect(px - w * 0.36, py + h * 0.2, w * 0.72, h * 0.12);
        if (rnd() < 0.25) blob(g, px + (rnd() - 0.5) * w * 0.5, py + h * 0.05, w * 0.07, h * 0.06, grey(0.74, 0.85));
        if (rnd() < 0.1) wear(g, px, py, w * 0.3, h * 0.3, rnd);
      });
    }
  }
};

/** Plaster: broad soft trowel patches, a few chipped spots showing brick beneath. */
const plaster: Painter = (g, s, rnd) => {
  patches(g, s, rnd, 9, 0.18);
  for (let i = 0; i < 5; i++) {
    const x = rnd() * s;
    const len = s * (0.15 + rnd() * 0.3);
    const y = rnd() * s;
    const w = s * (0.02 + rnd() * 0.03);
    wrapped(s, x, y + len / 2, len, (px, py) => {
      const grd = g.createLinearGradient(px, py - len / 2, px, py + len / 2);
      grd.addColorStop(0, grey(0.4, 0.45));
      grd.addColorStop(1, grey(0.4, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.roundRect(px - w / 2, py - len / 2, w, len, w / 2);
      g.fill();
    });
  }
  for (let i = 0; i < 3; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const w = s * 0.05;
    wrapped(s, x, y, w * 3, (px, py) => {
      blob(g, px + w * 0.75, py + w * 0.6, w * 1.3, w * 0.95, grey(0.45));
      for (let k = 0; k < 3; k++) {
        g.fillStyle = grey(0.52);
        g.fillRect(px + (k % 2) * w * 0.55, py + k * w * 0.42, w * 0.9, w * 0.3);
        g.fillStyle = grey(0.58);
        g.fillRect(px + (k % 2) * w * 0.55, py + k * w * 0.42, w * 0.9, w * 0.08);
      }
    });
  }
};

/** Rock: angular facets, each lit on its upper-left edge, with a crack or two. */
const rock: Painter = (g, s, rnd) => {
  for (let i = 0; i < 18; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = s * (0.08 + rnd() * 0.08);
    const v = 0.42 + rnd() * 0.16;
    const pts = Array.from({ length: 5 }, (_, k) => {
      const a = (k / 5) * Math.PI * 2 + rnd() * 0.6;
      return [Math.cos(a) * r * (0.7 + rnd() * 0.3), Math.sin(a) * r * (0.7 + rnd() * 0.3)] as const;
    });
    wrapped(s, x, y, r, (px, py) => {
      g.fillStyle = grey(v);
      g.beginPath();
      pts.forEach(([dx, dy], k) => (k ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy)));
      g.closePath();
      g.fill();
      g.strokeStyle = grey(v + 0.14);
      g.lineWidth = Math.max(1, s / 200);
      g.beginPath();
      g.moveTo(px + pts[2]![0], py + pts[2]![1]);
      g.lineTo(px + pts[3]![0], py + pts[3]![1]);
      g.lineTo(px + pts[4]![0], py + pts[4]![1]);
      g.stroke();
    });
  }
  for (let i = 0; i < 6; i++) crack(g, s, rnd, 0.32);
  for (let i = 0; i < 14; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = s * (0.008 + rnd() * 0.012);
    wrapped(s, x, y, r * 2, (px, py) => blob(g, px, py, r, r * 0.8, grey(0.7, 0.8)));
  }
};

/** Dirt paths and ground: worn soft tracks and scattered pebbles, each lit on top. */
const ground: Painter = (g, s, rnd) => {
  patches(g, s, rnd, 8, 0.2);
  for (let i = 0; i < Math.round(s * 0.12); i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = s * (0.006 + rnd() * 0.012);
    wrapped(s, x, y, r * 2, (px, py) => {
      blob(g, px, py + r * 0.35, r * 1.1, r * 0.75, grey(0.36, 0.8));
      blob(g, px, py, r, r * 0.7, grey(0.58 + rnd() * 0.08));
      blob(g, px - r * 0.3, py - r * 0.25, r * 0.4, r * 0.25, grey(0.72));
    });
  }
};

/** Sand: soft wind ripples and a few shell flecks. */
const sand: Painter = (g, s, rnd) => {
  patches(g, s, rnd, 6, 0.12);
  g.lineCap = 'round';
  for (let r = 0; r < 9; r++) {
    const y0 = (r / 9) * s + rnd() * s * 0.03;
    const amp = s * 0.02;
    for (const [dy, v] of [[0, 0.58], [s * 0.012, 0.43]] as const) {
      g.strokeStyle = grey(v, 0.8);
      g.lineWidth = Math.max(1.5, s / 170);
      g.beginPath();
      for (let x = -4; x <= s + 4; x += s / 32) {
        const y = y0 + dy + Math.sin((x / s) * Math.PI * 4 + r) * amp;
        x < 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  for (let i = 0; i < 30; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    wrapped(s, x, y, 4, (px, py) => blob(g, px, py, s / 220, s / 260, grey(0.7)));
  }
};

/** Cliff strata: horizontal bands of varied thickness with lit ledges and vertical cracks. */
const cliff: Painter = (g, s, rnd) => {
  let y = 0;
  while (y < s) {
    const h = s * (0.07 + rnd() * 0.08);
    const v = 0.44 + rnd() * 0.14;
    g.fillStyle = grey(v);
    g.fillRect(0, y, s, h);
    g.fillStyle = grey(v + 0.12);
    g.fillRect(0, y, s, h * 0.14);
    g.fillStyle = grey(v - 0.12);
    g.fillRect(0, y + h * 0.86, s, h * 0.14);
    for (let k = 0; k < 4; k++) {
      const x = rnd() * s;
      g.fillStyle = grey(v - 0.15, 0.8);
      g.fillRect(x, y + h * 0.2, Math.max(2, s / 200), h * 0.6);
    }
    y += h;
  }
  g.fillStyle = grey(0.5);
  g.fillRect(0, s - 1, s, 1);
};

/** Bark: wavy vertical ridges split by dark fissures, lit on one side, a knot or two and moss tufts (accent). */
const bark: Painter = (g, s, rnd, accent) => {
  g.fillStyle = grey(0.42);
  g.fillRect(0, 0, s, s);
  let x = 0;
  while (x < s) {
    const w = s * (0.06 + rnd() * 0.07);
    const v = 0.5 + rnd() * 0.12;
    const ph = rnd() * Math.PI * 2;
    const seg = s / 16;
    for (const dx of [0, -s]) {
      for (const [l, r, val] of [[0.1, 0.92, v], [0.16, 0.34, v + 0.13]] as const) {
        g.fillStyle = grey(val);
        g.beginPath();
        for (let y = -seg; y <= s + seg; y += seg) g.lineTo(dx + x + w * l + Math.sin((y / s) * Math.PI * 4 + ph) * w * 0.12, y);
        for (let y = s + seg; y >= -seg; y -= seg) g.lineTo(dx + x + w * r + Math.sin((y / s) * Math.PI * 4 + ph + 0.7) * w * 0.12, y);
        g.fill();
      }
    }
    x += w;
  }
  for (let i = 0; i < 2; i++) knot(g, rnd() * s, rnd() * s, s * 0.035, 0.5);
  const greens = ['rgba(118,160,64,', 'rgba(96,140,58,', 'rgba(140,176,78,'];
  for (let i = 0; i < 7; i++) {
    const x0 = rnd() * s;
    const y0 = rnd() * s;
    const r = s * (0.025 + rnd() * 0.04);
    const c = greens[Math.floor(rnd() * greens.length)]!;
    wrapped(s, x0, y0, r * 2, (px, py) => {
      for (let k = 0; k < 6; k++) blob(accent, px + (rnd() - 0.5) * r * 1.6, py + (rnd() - 0.5) * r, r * (0.35 + rnd() * 0.3), r * (0.25 + rnd() * 0.2), `${c}0.7)`);
    });
  }
};

/** Clipped hedge: sprigs of a few leaves fanned from a dark heart, lit tips up, packed tight with dark gaps between. */
const hedge: Painter = (g, s, rnd) => {
  g.fillStyle = grey(0.34);
  g.fillRect(0, 0, s, s);
  patches(g, s, rnd, 6, 0.25);
  const n = Math.round(s * 0.9);
  for (let i = 0; i < n; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = s * (0.02 + rnd() * 0.012);
    const v = 0.46 + rnd() * 0.16;
    const turn = rnd() * Math.PI * 2;
    wrapped(s, x, y, r * 2.2, (px, py) => {
      blob(g, px, py + r * 0.3, r * 1.2, r, grey(0.3, 0.6));
      for (let k = 0; k < 5; k++) {
        const a = turn + (k / 5) * Math.PI * 2;
        const lit = Math.sin(a) < 0 ? 0.08 : -0.05;
        leaf(g, px + Math.cos(a) * r * 0.6, py + Math.sin(a) * r * 0.6, r * 0.7, a, grey(v + lit), 0.6);
      }
      blob(g, px - r * 0.2, py - r * 0.35, r * 0.35, r * 0.2, grey(v + 0.16));
    });
  }
};

/** One pointed leaf (a lens) of length `r` and relative `width` at angle `a`. */
function leaf(g: Ctx, x: number, y: number, r: number, a: number, fill: string, width = 0.42): void {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, r, r * width, a, 0, Math.PI * 2);
  g.fill();
}

/** A knot: a dark eye in light rings. */
function knot(g: Ctx, x: number, y: number, r: number, v: number): void {
  blob(g, x, y, r * 1.6, r, grey(v + 0.08, 0.8));
  blob(g, x, y, r * 1.1, r * 0.7, grey(v - 0.12));
  blob(g, x, y, r * 0.5, r * 0.32, grey(v - 0.24));
}

/** Worn spot: a few light scuffs in one patch. */
function wear(g: Ctx, x: number, y: number, rx: number, ry: number, rnd: () => number): void {
  for (let k = 0; k < 3; k++) blob(g, x + (rnd() - 0.5) * rx, y + (rnd() - 0.5) * ry, rx * (0.15 + rnd() * 0.2), ry * (0.08 + rnd() * 0.1), grey(0.62, 0.45));
}

/** A hairline crack wandering from a random point. */
function crack(g: Ctx, s: number, rnd: () => number, v: number): void {
  let x = rnd() * s;
  let y = rnd() * s;
  g.strokeStyle = grey(v, 0.8);
  g.lineWidth = Math.max(1, s / 300);
  g.beginPath();
  g.moveTo(x, y);
  for (let k = 0; k < 4; k++) {
    x += (rnd() - 0.5) * s * 0.08;
    y += s * (0.02 + rnd() * 0.04);
    g.lineTo(x, y);
  }
  g.stroke();
}

/** Moss in the joints of a slab grid of cell `c`: green sprigs along a few cell edges (accent, partly transparent). */
function jointMoss(accent: Ctx, s: number, rnd: () => number, c: number, alpha: number): void {
  for (let i = 0; i < 9; i++) {
    const vertical = rnd() < 0.5;
    const row = Math.floor(rnd() * (s / c));
    const along = rnd() * s;
    const len = c * (0.2 + rnd() * 0.4);
    for (let k = 0; k < 10; k++) {
      const t = along + (k / 10) * len;
      const off = (rnd() - 0.5) * c * 0.03;
      const x = vertical ? row * c + (Math.floor(t / c) % 2) * c * 0.5 + off : t;
      const y = vertical ? t : row * c + off;
      wrapped(s, x % s, y % s, c * 0.05, (px, py) => blob(accent, px, py, c * (0.03 + rnd() * 0.025), c * (0.02 + rnd() * 0.015), `rgba(${100 + Math.floor(rnd() * 40)},${145 + Math.floor(rnd() * 30)},64,${alpha})`));
    }
  }
}

const PAINTERS: Record<number, Painter> = {
  [Surface.grass]: grass,
  [Surface.foliage]: foliage,
  [Surface.wood]: wood,
  [Surface.rock]: rock,
  [Surface.roof]: roof,
  [Surface.plaster]: plaster,
  [Surface.brick]: brick,
  [Surface.ground]: ground,
  [Surface.sand]: sand,
  [Surface.paving]: paving,
  [Surface.meadow]: meadow,
  [Surface.cliff]: cliff,
  [Surface.bark]: bark,
  [Surface.hedge]: hedge,
};
