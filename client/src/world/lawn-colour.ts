import { BufferAttribute, BufferGeometry, Color } from 'three';

/** The island lawn's base colour at world (x, z): a soft swathe from the palette's grass towards grassLight. */
export function lawnColour(p: { readonly grass: number; readonly grassLight: number }, x: number, z: number, out = new Color()): Color {
  const t = 0.5 + 0.5 * Math.sin(x * 0.09 + z * 0.05) * Math.cos(z * 0.08 - x * 0.03);
  return out.set(p.grass).lerp(new Color(p.grassLight), t * 0.85);
}

/**
 * A flat ground blob facing up, centre at the origin: `controls` rim radii drawn at 0.75-1.15 r (one `random()` each), eased
 * round the rim through `per` points between each pair, so the outline wobbles softly instead of breaking into straight edges.
 */
export function softBlob(r: number, random: () => number, controls = 9, per = 3): BufferGeometry {
  const k = Array.from({ length: controls }, () => r * (0.75 + random() * 0.4));
  const n = controls * per;
  const rim = Array.from({ length: n }, (_, j) => {
    const i = Math.floor(j / per);
    const w = (1 - Math.cos((Math.PI * (j % per)) / per)) / 2;
    const d = k[i]! * (1 - w) + k[(i + 1) % controls]! * w;
    const a = (j / n) * Math.PI * 2;
    return [Math.cos(a) * d, Math.sin(a) * d] as const;
  });
  const pos: number[] = [];
  for (let j = 0; j < n; j++) {
    const [ax, az] = rim[j]!;
    const [bx, bz] = rim[(j + 1) % n]!;
    pos.push(0, 0, 0, bx, 0, bz, ax, 0, az);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** Colours a world-space ground blob from `ground(x, z)` at its rim to `centre` times that at its middle (vertex-colour fade). */
export function fadeBlob(g: BufferGeometry, cx: number, cz: number, centre: number, ground: (x: number, z: number, out: Color) => Color): BufferGeometry {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    ground(x, z, c);
    if (Math.hypot(x - cx, z - cz) < 1e-3) c.multiplyScalar(centre);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}
