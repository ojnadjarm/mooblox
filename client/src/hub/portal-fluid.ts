import { BufferAttribute, BufferGeometry, Color, DoubleSide, ShaderMaterial } from 'three';
import { OPENING, OPENING_CENTRE } from './portal-arch';

/** Grid of the opening: columns and rows of the rectangle, rings and segments of the round top (fine enough for vertex colours). */
const GRID = { cols: 12, rows: 14, rings: 6, segments: 24 } as const;

/**
 * The fluid filling one arch opening (local, front +z): a rectangle up to the spring plus a half disc, in the plane `OPENING.z`.
 * Attributes: `aLocal` (metres from the opening centre), `color` (tint), `aOpen` (1 = a course behind it, 0 = dormant).
 */
export function openingGeometry(): BufferGeometry {
  const { half, bottom, spring, z } = OPENING;
  const pts: number[] = [];
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => pts.push(ax, ay, bx, by, cx, cy);
  const gx = (i: number) => -half + (2 * half * i) / GRID.cols;
  const gy = (j: number) => bottom + ((spring - bottom) * j) / GRID.rows;
  for (let i = 0; i < GRID.cols; i++) {
    for (let j = 0; j < GRID.rows; j++) {
      tri(gx(i), gy(j), gx(i + 1), gy(j), gx(i + 1), gy(j + 1));
      tri(gx(i), gy(j), gx(i + 1), gy(j + 1), gx(i), gy(j + 1));
    }
  }
  const p = (r: number, k: number): [number, number] => {
    const a = (k / GRID.segments) * Math.PI;
    return [Math.cos(a) * half * r, spring + Math.sin(a) * half * r];
  };
  for (let ri = 0; ri < GRID.rings; ri++) {
    const r0 = ri / GRID.rings;
    const r1 = (ri + 1) / GRID.rings;
    for (let k = 0; k < GRID.segments; k++) {
      tri(...p(r0, k), ...p(r1, k), ...p(r1, k + 1));
      if (ri > 0) tri(...p(r0, k), ...p(r1, k + 1), ...p(r0, k + 1));
    }
  }
  const n = pts.length / 2;
  const pos = new Float32Array(n * 3);
  const local = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    pos.set([pts[i * 2]!, pts[i * 2 + 1]!, z], i * 3);
    local.set([pts[i * 2]!, pts[i * 2 + 1]! - OPENING_CENTRE], i * 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aLocal', new BufferAttribute(local, 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aOpen', new BufferAttribute(new Float32Array(n).fill(1), 1));
  return g;
}

/** Bakes a still swirl with a bright ring at the centre into the vertex colours (the low tier draws the fluid with the glow program). */
export function bakeStillFluid(g: BufferGeometry, tint: Color): void {
  const local = g.getAttribute('aLocal') as BufferAttribute;
  const col = g.getAttribute('color') as BufferAttribute;
  for (let i = 0; i < local.count; i++) {
    const x = local.getX(i);
    const y = local.getY(i);
    const r = Math.hypot(x, y);
    const arms = 0.5 + 0.5 * Math.sin(3 * Math.atan2(y, x) + 6.5 * Math.log(r + 0.25));
    const ring = Math.max(0, 1 - Math.abs(r - 0.6) / 0.15);
    const k = 0.45 + 0.55 * arms;
    col.setXYZ(i, Math.min(1, tint.r * k + ring * 0.6), Math.min(1, tint.g * k + ring * 0.6), Math.min(1, tint.b * k + ring * 0.6));
  }
  col.needsUpdate = true;
}

/** Paints vertices [start, start + count) of a merged fluid geometry with a tint and an open flag. */
export function paintOpening(g: BufferGeometry, start: number, count: number, tint: Color, open: boolean): void {
  const col = g.getAttribute('color') as BufferAttribute;
  const flag = g.getAttribute('aOpen') as BufferAttribute;
  for (let i = start; i < start + count; i++) {
    col.setXYZ(i, tint.r, tint.g, tint.b);
    flag.setX(i, open ? 1 : 0);
  }
  col.needsUpdate = true;
  flag.needsUpdate = true;
}

const VERTEX = /* glsl */ `
attribute vec2 aLocal;
attribute float aOpen;
varying vec2 vP;
varying vec3 vTint;
varying float vOpen;
void main() {
  vP = aLocal;
  vTint = color;
  vOpen = aOpen;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vP;
varying vec3 vTint;
varying float vOpen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}
void main() {
  float t = uTime * mix(0.25, 1.0, vOpen);
  float r = length(vP);
  float a0 = atan(vP.y, vP.x);
  float ang = a0 + 2.4 / (r + 0.45) - t * 0.8;
  vec2 q = vec2(cos(ang), sin(ang)) * r;
  float swirl = fbm(q * 1.7 + vec2(0.0, t * 0.3));
  float flow = fbm(vP * vec2(2.6, 1.4) + vec2(t * 0.15, -t * 0.55));
  float f = smoothstep(0.22, 0.8, mix(swirl, flow, 0.35));
  float arms = 0.5 + 0.5 * sin(3.0 * a0 + 6.5 * log(r + 0.25) - t * 2.6 + swirl * 4.0);
  float v = f * (0.55 + 0.45 * arms);
  vec2 c = vec2(cos(t * 1.3), sin(t * 1.7)) * 0.14;
  float rc = length(vP - c);
  float ringR = 0.6 + 0.08 * sin(t * 2.4);
  float ring = smoothstep(0.13, 0.0, abs(rc - ringR)) * (0.75 + 0.25 * sin(atan(vP.y - c.y, vP.x - c.x) * 3.0 - t * 4.0));
  float core = smoothstep(0.5, 0.0, rc);
  float lit = mix(0.45, 1.0, vOpen);
  vec3 col = vTint * (0.28 + 1.35 * v) + vec3(1.0) * (pow(v, 4.0) * 0.5 + ring * 0.6 + core * 0.3) * lit;
  float alpha = clamp(0.68 + 0.27 * v + ring * 0.2, 0.0, 0.95) * mix(0.8, 1.0, vOpen);
  gl_FragColor = vec4(min(col, vec3(1.3)), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The translucent swirling portal fluid (nether-portal style) with a moving ring at its centre; `time` drives it. */
export function portalFluidMaterial(time: { value: number }): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  m.name = 'portal-fluid';
  return m;
}
