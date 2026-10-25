import {
  BufferAttribute,
  Color,
  DoubleSide,
  IcosahedronGeometry,
  Mesh,
  ShaderMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cloudPuffs, overviewPuffs, type CloudPuff } from './sky-data';
import type { Look, SkyScript } from './look';

type Vec = { x: number; y: number; z: number };
const vec = (): Vec => ({ x: 0, y: 0, z: 0 });

/**
 * The colour script's background, shared by reference with every fogged program (three clones its own math types when it
 * copies uniforms, plain objects are shared), so the haze always fades to exactly what the dome draws behind it.
 */
export const SKY_UNIFORMS = {
  skyZenith: { value: vec() },
  skyUpper: { value: vec() },
  skyHorizon: { value: vec() },
  skyGlow: { value: vec() },
  skyLine: { value: vec() },
  skySeaHorizon: { value: vec() },
  skySea: { value: vec() },
  skySun: { value: vec() },
};

/** GLSL: `skyColour(dir)`, the background along a world direction in sRGB (sky above the horizon, far sea below). */
export const SKY_GLSL = /* glsl */ `
uniform vec3 skyZenith, skyUpper, skyHorizon, skyGlow, skyLine, skySeaHorizon, skySea, skySun;
vec3 skyColour(vec3 dir) {
  float e = dir.y;
  vec2 fl = normalize(dir.xz + vec2(1e-5));
  float toSun = max(dot(fl, normalize(skySun.xz)), 0.0);
  vec3 horizon = mix(skyHorizon, skyGlow, pow(toSun, 5.0) * 0.8);
  vec3 c = mix(horizon, skyUpper, smoothstep(0.0, 0.2, e));
  c = mix(c, skyZenith, smoothstep(0.18, 0.8, e));
  vec3 sea = mix(skySeaHorizon, skySea, 1.0 - exp(e * 22.0));
  c = e >= 0.0 ? c : mix(skyLine, sea, smoothstep(0.0, 0.006, -e));
  float s = max(dot(dir, skySun), 0.0);
  return c + skyGlow * (pow(s, 24.0) * 0.22 * step(-0.02, e));
}`;

const srgb = (hex: number, out: Vec): void => {
  const c = new Color(hex).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
  out.x = c.r;
  out.y = c.g;
  out.z = c.b;
};

/** Writes a look's colour script and sun into the shared sky uniforms (before or after programs compile). */
export function setSkyScript(sky: SkyScript, sun: readonly [number, number, number]): void {
  const u = SKY_UNIFORMS;
  srgb(sky.zenith, u.skyZenith.value);
  srgb(sky.upper, u.skyUpper.value);
  srgb(sky.horizon, u.skyHorizon.value);
  srgb(sky.glow, u.skyGlow.value);
  srgb(sky.line, u.skyLine.value);
  srgb(sky.seaHorizon, u.skySeaHorizon.value);
  srgb(sky.sea, u.skySea.value);
  const d = new Vector3(...sun).normalize();
  Object.assign(u.skySun.value, { x: d.x, y: d.y, z: d.z });
}

/** Radians per second the cloud layer turns round the camera (a slow drift across the sky). */
const DRIFT = 0.0045;
/** Dome radius (m), inside the camera's far plane. */
const DOME = 800;
/** Lowest and highest camera (m) the ring clouds are seen from: faces turned away from both are never drawn. */
const EYE_HEIGHTS = [-5, 200] as const;

/**
 * Designed sky: gradient dome with sun disc and halo plus soft cumulus, centred on the camera. One mesh, one draw and one
 * program: `sky` = 0 the camera's cloud ring, 1 dome (colour from `skyColour`), 2 the overview's composed clouds; the draw
 * range holds the ring and dome at eye level, the dome and overview clouds while the map camera frames the archipelago.
 */
export class Sky {
  readonly mesh: Mesh;
  private readonly drift = { value: 0 };
  private readonly map = { value: { x: 0, y: 0, z: 0 } };
  /** Vertex counts of the ring, dome and overview clouds, in geometry order. */
  private readonly counts: readonly number[];

  constructor(look: Look, seed: number) {
    setSkyScript(look.sky, look.sun.dir);
    const parts = [cloudGeometry(cloudPuffs(seed), look, EYE_HEIGHTS), domeGeometry(), cloudGeometry(overviewPuffs(seed), look, null)];
    this.counts = parts.map((g) => g.getAttribute('position').count);
    const domeCount = parts[1]!.getAttribute('position').count;
    parts[1]!.setAttribute('color', new BufferAttribute(new Float32Array(domeCount * 3), 3));
    for (const [i, g] of parts.entries()) {
      if (g.getAttribute('normal')) g.deleteAttribute('normal');
      g.setAttribute('sky', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(i), 1));
    }
    const geometry = mergeGeometries(parts, false)!;
    for (const g of parts) g.dispose();
    this.mesh = new Mesh(geometry, skyMaterial(look.sky.disc, this.drift, this.map));
    this.mesh.name = 'sky';
    // Drawn after every opaque part: depth test rejects the covered pixels before shading.
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.overview(null);
  }

  /** Shows the overview's clouds round the archipelago (centre, half-extent in m) instead of the ring; null = eye level. */
  overview(frame: { x: number; z: number; extent: number } | null): void {
    if (frame) Object.assign(this.map.value, { x: frame.x, y: frame.z, z: frame.extent });
    const [ring, dome, map] = this.counts as [number, number, number];
    this.mesh.geometry.setDrawRange(frame ? ring : 0, frame ? dome + map : ring + dome);
  }

  /** Turns the cloud layer by the wall clock (drifts on, whatever the frame rate). */
  update(): void {
    this.drift.value = (performance.now() / 1000) * DRIFT;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}

/** Elevations (degrees) of the dome's rings: dense round the horizon line, where the colour script changes fastest. */
const RINGS = [-90, -40, -16, -7, -3, -1.2, -0.4, 0, 0.6, 2, 5, 9, 15, 23, 33, 46, 62, 78, 90];
const SEGMENTS = 40;

/** Unit dome as rings of latitude (non-indexed triangles, position only). */
function domeGeometry(): BufferGeometry {
  const ring = (deg: number, k: number): number[] => {
    const e = (deg * Math.PI) / 180;
    const a = (k / SEGMENTS) * Math.PI * 2;
    return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
  };
  const pos: number[] = [];
  for (let r = 0; r < RINGS.length - 1; r++) {
    for (let k = 0; k < SEGMENTS; k++) {
      const a = ring(RINGS[r]!, k);
      const b = ring(RINGS[r]!, k + 1);
      const c = ring(RINGS[r + 1]!, k);
      const d = ring(RINGS[r + 1]!, k + 1);
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

/** The sky's one material (no fog, no tone mapping): dome = `skyColour` plus a soft sun disc, clouds = their paint. */
function skyMaterial(disc: number, drift: { value: number }, map: { value: Vec }): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...SKY_UNIFORMS, uDisc: { value: new Color(disc) }, uDrift: drift, uMap: map },
    side: DoubleSide,
    fog: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      ${SKY_GLSL}
      attribute vec3 color;
      attribute float sky;
      uniform float uDrift;
      uniform vec3 uMap;
      varying vec3 vDir;
      varying vec3 vColor;
      varying float vSky;
      vec3 turn(vec3 p, float a) {
        float c = cos(a), s = sin(a);
        return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
      }
      void main() {
        vDir = position;
        bool dome = abs(sky - 1.0) < 0.5;
        vSky = dome ? 1.0 : 0.0;
        // The gradient per vertex (rings dense at the horizon); only the sun disc is per pixel.
        vColor = dome ? pow(skyColour(normalize(position)), vec3(2.2)) : color;
        vec3 world = cameraPosition + position * ${DOME}.0;
        if (sky < 0.5) world = vec3(cameraPosition.x, 0.0, cameraPosition.z) + turn(position, uDrift);
        if (sky > 1.5) world = vec3(uMap.x, 0.0, uMap.y) + turn(position, uDrift * 0.3) * uMap.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 skySun;
      uniform vec3 uDisc;
      varying vec3 vDir;
      varying vec3 vColor;
      varying float vSky;
      void main() {
        float disc = vSky > 0.5 ? smoothstep(0.9988, 0.9993, dot(normalize(vDir), skySun)) : 0.0;
        gl_FragColor = vec4(mix(vColor, uDisc, disc), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Billows are spheres squashed to this height, so a cumulus reads round, not flat. */
const SQUASH = 0.8;

/**
 * Every cloud as smooth-shaded billows on one flat base: bright where they face up and high in the cloud, warm on the sun
 * side, cool blue-grey at the base and underneath (the concepts' soft cumulus). With `eye` (camera heights over the ring's
 * centre) the faces turned away from every such camera are left out: a closed billow always hides them behind its front.
 */
function cloudGeometry(puffs: readonly CloudPuff[], look: Look, eye: readonly [number, number] | null): BufferGeometry {
  const sun = new Vector3(...look.sun.dir).normalize();
  const lit = new Color(look.sky.cloudLit);
  const warm = new Color(look.sky.cloudWarm);
  const shade = new Color(look.sky.cloudShade);
  const parts: BufferGeometry[] = [];
  const n = new Vector3();
  const c = new Color();
  for (const p of puffs) {
    const top = Math.max(...p.lumps.map((l) => l.dy + l.r * SQUASH));
    for (const lump of p.lumps) {
      const g = new IcosahedronGeometry(1, 1);
      g.deleteAttribute('uv');
      const pos = g.getAttribute('position') as BufferAttribute;
      const nor = g.getAttribute('normal') as BufferAttribute;
      const height = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        n.fromBufferAttribute(pos, i);
        const y = n.y * lump.r * SQUASH + lump.dy;
        height[i] = Math.max(y, 0) / top;
        pos.setXYZ(i, n.x * lump.r + lump.dx, Math.max(y, 0), n.z * lump.r + lump.dz);
        if (y < 0) nor.setXYZ(i, 0, -1, 0);
        else nor.setXYZ(i, n.x, n.y / SQUASH, n.z);
      }
      g.rotateY(p.yaw);
      g.translate(p.x, p.y, p.z);
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        n.fromBufferAttribute(nor, i).normalize();
        const h = height[i]!;
        c.copy(shade).lerp(lit, Math.min(1, Math.max(0, 0.45 + 0.45 * h + 0.35 * n.y)));
        c.lerp(warm, Math.max(0, n.dot(sun)) * 0.3 * h);
        col.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new BufferAttribute(col, 3));
      parts.push(eye ? facing(g, eye) : g);
    }
  }
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return merged;
}

/** The faces of a non-indexed geometry that face a camera at (0, y, 0) for some y in `eye` (front-facing at either end). */
export function facing(g: BufferGeometry, eye: readonly [number, number]): BufferGeometry {
  const pos = g.getAttribute('position');
  const keep: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let f = 0; f < pos.count / 3; f++) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1).sub(a);
    c.fromBufferAttribute(pos, f * 3 + 2).sub(a);
    const n = b.cross(c);
    // n . (a - camera) < 0 is front-facing; linear in the camera height, so both ends of the range decide.
    if (eye.some((y) => n.x * a.x + n.y * (a.y - y) + n.z * a.z < 0)) keep.push(f);
  }
  const out = new BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const k = attr.itemSize;
    const src = attr.array as Float32Array;
    const dst = new Float32Array(keep.length * 3 * k);
    keep.forEach((f, i) => dst.set(src.subarray(f * 3 * k, (f + 1) * 3 * k), i * 3 * k));
    out.setAttribute(name, new BufferAttribute(dst, k));
  }
  g.dispose();
  return out;
}
