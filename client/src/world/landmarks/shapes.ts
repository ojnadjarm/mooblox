import { BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, LatheGeometry, SphereGeometry, Vector2, type BufferGeometry } from 'three';

/** Shadow tint of the art bible: baked AO and shade lean towards it, never towards black. */
export const SHADOW_TINT = 0x4b5a8c;

const tint = new Color(SHADOW_TINT);

/** Non-indexed, flat-normal, one-colour geometry moved to (x, y, z): the faceted look. */
export function facet(g: BufferGeometry, colour: number, x = 0, y = 0, z = 0): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  flat.deleteAttribute('uv');
  flat.translate(x, y, z);
  paint(flat, colour);
  flat.computeVertexNormals();
  return flat;
}

function paint(g: BufferGeometry, colour: number): void {
  const c = new Color(colour);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(col, 3));
}

/**
 * A solid of revolution standing on y from `profile` ([radius, height] bottom to top): soft (smooth normals) for domes,
 * bulging roofs and tents, else faceted; `turn` and `sweep` set the start angle and arc (canopies).
 */
export function lathe(profile: readonly (readonly [number, number])[], sides: number, colour: number, x = 0, y = 0, z = 0, soft = true, turn = 0, sweep = Math.PI * 2): BufferGeometry {
  const g = new LatheGeometry(profile.map(([r, h]) => new Vector2(r, h)), sides, turn, sweep);
  if (!soft) return facet(g, colour, x, y, z);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.deleteAttribute('uv');
  flat.translate(x, y, z);
  paint(flat, colour);
  return flat;
}

/** Triangles per lathe gore (one `sides` step of a profile with `points` points): the run that stripes a lathe per gore. */
export const gore = (points: number): number => 2 * (points - 1);

/** A pillowy hip roof w x d, `h` high on y: four slopes that bulge out, soft-shaded. */
export const hipRoof = (w: number, d: number, h: number, colour: number, x = 0, y = 0, z = 0): BufferGeometry =>
  lathe([[1, 0], [0.93, 0.3], [0.74, 0.62], [0.44, 0.88], [0, 1]], 4, colour, 0, 0, 0, true, Math.PI / 4).scale(w / Math.SQRT2, h, d / Math.SQRT2).translate(x, y, z);

export const box = (w: number, h: number, d: number, colour: number, x = 0, y = 0, z = 0): BufferGeometry =>
  facet(new BoxGeometry(w, h, d), colour, x, y + h / 2, z);

/** An n-sided prism or frustum standing on y, `rows` faces high (bands need more than one). */
export const prism = (rTop: number, rBottom: number, h: number, sides: number, colour: number, x = 0, y = 0, z = 0, open = false, rows = 1): BufferGeometry =>
  facet(new CylinderGeometry(rTop, rBottom, h, sides, rows, open), colour, x, y + h / 2, z);

/** The inside of an open frustum (seat tiers, basins): faces turned inwards so they show from above. */
export const bowl = (rTop: number, rBottom: number, h: number, sides: number, colour: number, y = 0): BufferGeometry =>
  facet(new CylinderGeometry(rTop, rBottom, h, sides, 1, true).scale(-1, 1, 1), colour, 0, y + h / 2, 0);

/** A triangular gable along x (pediments, roofs): `depth` along z, apex `h` above y. */
export const gable = (w: number, depth: number, h: number, colour: number, x = 0, y = 0, z = 0): BufferGeometry =>
  facet(new CylinderGeometry(1, 1, w, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, h / 1.5, depth / 2 / 0.866), colour, x, y + (0.5 * h) / 1.5, z);

/** An n-sided pyramid standing on y; `turn` rotates it round its axis (pi/4 squares a 4-sided roof). */
export const cone = (r: number, h: number, sides: number, colour: number, x = 0, y = 0, z = 0, turn = 0): BufferGeometry =>
  facet(new ConeGeometry(r, h, sides).rotateY(turn), colour, x, y + h / 2, z);

/** A faceted half dome sitting on y. */
export const dome = (r: number, sides: number, rings: number, colour: number, x = 0, y = 0, z = 0): BufferGeometry =>
  facet(new SphereGeometry(r, sides, rings, 0, Math.PI * 2, 0, Math.PI / 2), colour, x, y, z);

/** An angular rock chunk centred on (x, y, z). */
export const rock = (r: number, colour: number, x = 0, y = 0, z = 0, sy = 0.7): BufferGeometry =>
  facet(new DodecahedronGeometry(r, 0).scale(1, sy, 1), colour, x, y, z);

/** A flat disc or panel facing +z (clock faces, windows), centred on (x, y, z). */
export const disc = (r: number, depth: number, sides: number, colour: number, x = 0, y = 0, z = 0): BufferGeometry =>
  facet(new CylinderGeometry(r, r, depth, sides).rotateX(Math.PI / 2), colour, x, y, z);

/** Repaints every other face group (`run` triangles each) with `b`: stripes on tents, panes on glass. */
export function alternate(g: BufferGeometry, b: number, run: number): BufferGeometry {
  const c = new Color(b);
  const col = g.getAttribute('color');
  for (let t = 0; t < col.count / 3; t++) {
    if (Math.floor(t / run) % 2 === 0) continue;
    for (let k = 0; k < 3; k++) col.setXYZ(t * 3 + k, c.r, c.g, c.b);
  }
  return g;
}

/** Repaints the faces whose centre lies below each band's top with the band colour (bottom up): striped towers, banded cliffs. */
export function bands(g: BufferGeometry, stops: readonly (readonly [number, number])[]): BufferGeometry {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const c = new Color();
  for (let t = 0; t < pos.count / 3; t++) {
    const y = (pos.getY(t * 3) + pos.getY(t * 3 + 1) + pos.getY(t * 3 + 2)) / 3;
    const band = stops.find(([top]) => y <= top);
    if (!band) continue;
    c.set(band[1]);
    for (let k = 0; k < 3; k++) col.setXYZ(t * 3 + k, c.r, c.g, c.b);
  }
  return g;
}

/** Baked ambient occlusion: vertices within `depth` above `y0` darken towards the shadow tint (strength 0..1). */
export function bakeAo(g: BufferGeometry, y0: number, depth: number, strength = 0.3): BufferGeometry {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / depth));
    const k = strength * (1 - t * t * (3 - 2 * t));
    col.setXYZ(i, col.getX(i) * (1 - k) + tint.r * k * 0.6, col.getY(i) * (1 - k) + tint.g * k * 0.6, col.getZ(i) * (1 - k) + tint.b * k * 0.6);
  }
  return g;
}
