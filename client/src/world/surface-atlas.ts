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
      });
    }
  }
}

const brick: Painter = (g, s, rnd) => bricks(g, s, rnd, 8, 4, 0.7);

/** Flagstones: irregular slabs with soft edges, worn light rims and a few hairline cracks. */
const paving: Painter = (g, s, rnd) => {
  g.fillStyle = grey(0.36);
  g.fillRect(0, 0, s, s);
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
      });
    }
  }
};

/** Plaster: broad soft trowel patches, a few chipped spots showing brick beneath. */
const plaster: Painter = (g, s, rnd) => {
  patches(g, s, rnd, 9, 0.18);
  for (let i = 0; i < 3; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const w = s * 0.05;
    wrapped(s, x, y, w * 3, (px, py) => {
      for (let k = 0; k < 3; k++) {
        g.fillStyle = grey(0.4);
        g.fillRect(px + (k % 2) * w * 0.55, py + k * w * 0.42, w, w * 0.36);
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
};
