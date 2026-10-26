import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Water codes in the scenery `sway` attribute, past wind (0 to 1.5) and cloth (below 0): the scenery shader animates them
 * (`material-kit.ts`) on every tier but low. Ripple = RIPPLE + metres from where its rings start; stream = STREAM + the
 * fraction along its flow; splash = SPLASH + the fraction of its crown's height.
 */
export const WATER_CODE = 1.75;
export const RIPPLE = 2;
export const RIPPLE_REACH = 5.4;
export const STREAM = 8;
export const SPLASH = 10;

/** Codes a pool's flat water with its distance from a ring of radius `from` round (cx, cz): rings run outward from there and inward inside it. */
export function rippleCode(g: BufferGeometry, cx: number, cz: number, from: number): BufferGeometry {
  const pos = g.getAttribute('position');
  const w = swayOf(g);
  for (let i = 0; i < pos.count; i++) w.setX(i, RIPPLE + Math.min(RIPPLE_REACH, Math.abs(Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz) - from)));
  return g;
}

/** Codes a stream flowing from height `y0` to `y1` (down for a fall, up for a jet). */
export function streamCode(g: BufferGeometry, y0: number, y1: number): BufferGeometry {
  return codeBy(g, STREAM, y0, y1);
}

/** Codes a splash crown standing from `y0` to `y1`. */
export function splashCode(g: BufferGeometry, y0: number, y1: number): BufferGeometry {
  return codeBy(g, SPLASH, y0, y1);
}

/** Re-centres the ripples of a placed model's pools on (cx, cz), rings starting `from` metres out (its own-built pools are radial fans). */
export function aimRipples(g: BufferGeometry, cx: number, cz: number, from: number): void {
  const w = g.getAttribute('sway');
  if (!w) return;
  const pos = g.getAttribute('position');
  for (let i = 0; i < w.count; i++) {
    const v = w.getX(i);
    if (v >= RIPPLE && v < STREAM) w.setX(i, RIPPLE + Math.min(RIPPLE_REACH, from + Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz)));
  }
}

/**
 * A kit model's flat water (non-indexed; `water(i)` true for its vertices) rebuilt as radial fans, one per water level,
 * coded as ripples round the model's axis; the rest is kept as it was. Returns the geometry unchanged when it has no water.
 */
export function kitPools(g: BufferGeometry, water: (vertex: number) => boolean, sides = 24): BufferGeometry {
  const pos = g.getAttribute('position');
  const levels = new Map<number, { r: number; vertex: number }>();
  const keep: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    if (!(water(t) && water(t + 1) && water(t + 2))) {
      keep.push(t);
      continue;
    }
    const y = Math.round(pos.getY(t) * 100) / 100;
    const level = levels.get(y) ?? { r: 0, vertex: t };
    for (let k = t; k < t + 3; k++) level.r = Math.max(level.r, Math.hypot(pos.getX(k), pos.getZ(k)));
    levels.set(y, level);
  }
  if (!levels.size) return g;
  const n = keep.length * 3 + levels.size * sides * 3;
  const out = new BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const size = a.itemSize;
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const t of keep) for (let k = t; k < t + 3; k++) for (let c = 0; c < size; c++) arr[o++] = a.getComponent(k, c);
    for (const [y, level] of levels) {
      for (let s = 0; s < sides; s++) {
        const a0 = (s / sides) * Math.PI * 2;
        const a1 = ((s + 1) / sides) * Math.PI * 2;
        const corners: [number, number][] = [[0, 0], [Math.cos(a1) * level.r, Math.sin(a1) * level.r], [Math.cos(a0) * level.r, Math.sin(a0) * level.r]];
        for (const [x, z] of corners) {
          for (let c = 0; c < size; c++) {
            if (name === 'position') arr[o++] = [x, y, z][c]!;
            else if (name === 'normal') arr[o++] = c === 1 ? 1 : 0;
            else arr[o++] = a.getComponent(level.vertex, c);
          }
        }
      }
    }
    out.setAttribute(name, new BufferAttribute(arr, size));
  }
  const w = swayOf(out);
  const p = out.getAttribute('position');
  for (let i = keep.length * 3; i < n; i++) w.setX(i, RIPPLE + Math.min(RIPPLE_REACH, Math.hypot(p.getX(i), p.getZ(i))));
  return out;
}

/** Scenery vertex GLSL after `wp` (world position): streams shimmer sideways, splash crowns bob; passes the code on. */
export const WATER_VERTEX = `float wCode = sway > ${WATER_CODE.toFixed(2)} ? sway : 0.0;
vWater = vec2(wCode, dot(wp.xz, vec2(2.3, 3.1)));
if (wCode > ${(STREAM - 0.5).toFixed(1)} && wCode < ${(SPLASH - 0.5).toFixed(1)}) {
  float wF = wCode - ${STREAM.toFixed(1)};
  transformed.x += sin(uTime * 9.0 + wp.y * 7.0 + wp.z * 2.0) * 0.014 * wF;
  transformed.z += cos(uTime * 8.0 + wp.y * 6.0 + wp.x * 2.0) * 0.014 * wF;
} else if (wCode > ${(SPLASH - 0.5).toFixed(1)}) {
  float wK = wCode - ${SPLASH.toFixed(1)};
  transformed.y += wK * (0.04 + 0.07 * sin(uTime * 7.0 + wp.x * 4.1 + wp.z * 3.7));
}`;

/** Scenery fragment GLSL after the colour and atlas: ripple rings running out from their start, light bands falling down streams, flickering splashes; the foam lights itself a little. */
export const WATER_FRAGMENT = `if (vWater.x > ${WATER_CODE.toFixed(2)}) {
  vec3 wFoam = vec3(0.88, 0.98, 1.0);
  float wMix;
  float wGlow;
  if (vWater.x < ${(STREAM - 0.5).toFixed(1)}) {
    float wR = vWater.x - ${RIPPLE.toFixed(1)};
    float wK = fract(wR * 1.5 - uTime * 0.5);
    float wRing = smoothstep(0.0, 0.08, wK) * (1.0 - smoothstep(0.08, 0.32, wK));
    wMix = wRing * (0.42 - 0.22 * smoothstep(0.4, 2.0, wR)) + (1.0 - smoothstep(0.0, 0.22, wR)) * (0.3 + 0.12 * sin(uTime * 13.0 + vWater.y * 3.0));
    wMix += 0.04 * sin(vWater.y * 1.7 + uTime * 1.9) + 0.04;
    wGlow = wMix * 0.25;
  } else if (vWater.x < ${(SPLASH - 0.5).toFixed(1)}) {
    float wF = vWater.x - ${STREAM.toFixed(1)};
    float wK = fract(wF * 2.6 - uTime * 2.1 + sin(vWater.y * 2.0) * 0.2);
    wMix = 0.45 + 0.45 * smoothstep(0.0, 0.18, wK) * (1.0 - smoothstep(0.32, 0.75, wK));
    wGlow = 0.1 + wMix * 0.3;
  } else {
    wMix = 0.8 + 0.2 * sin(uTime * 11.0 + vWater.y);
    wGlow = 0.35;
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, wFoam, clamp(wMix, 0.0, 1.0));
  totalEmissiveRadiance += wFoam * wGlow;
}`;

function codeBy(g: BufferGeometry, base: number, y0: number, y1: number): BufferGeometry {
  const pos = g.getAttribute('position');
  const w = swayOf(g);
  for (let i = 0; i < pos.count; i++) w.setX(i, base + Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0))));
  return g;
}

function swayOf(g: BufferGeometry): BufferAttribute {
  const have = g.getAttribute('sway');
  if (have instanceof BufferAttribute && have.count === g.getAttribute('position').count) return have;
  const w = new BufferAttribute(new Float32Array(g.getAttribute('position').count), 1);
  g.setAttribute('sway', w);
  return w;
}
