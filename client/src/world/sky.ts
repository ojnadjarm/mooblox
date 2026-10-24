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
import { cloudPuffs, type CloudPuff } from './sky-data';
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
  vec3 sea = mix(skySeaHorizon, skySea, smoothstep(0.004, 0.14, -e));
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

/**
 * Designed sky: gradient dome with sun disc and halo plus one layer of faceted clouds, centred on the camera. One mesh, one
 * draw and one program: dome vertices carry `sky` = 1 (colour from `skyColour`), cloud vertices their painted colour.
 */
export class Sky {
  readonly mesh: Mesh;
  private readonly drift = { value: 0 };

  constructor(look: Look, seed: number) {
    setSkyScript(look.sky, look.sun.dir);
    const parts = [domeGeometry(), cloudGeometry(cloudPuffs(seed), look)];
    const domeCount = parts[0]!.getAttribute('position').count;
    parts[0]!.setAttribute('color', new BufferAttribute(new Float32Array(domeCount * 3), 3));
    for (const [i, g] of parts.entries()) {
      g.deleteAttribute('normal');
      g.setAttribute('sky', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(i === 0 ? 1 : 0), 1));
    }
    const geometry = mergeGeometries(parts, false)!;
    for (const g of parts) g.dispose();
    this.mesh = new Mesh(geometry, skyMaterial(look.sky.disc, this.drift));
    this.mesh.name = 'sky';
    // Drawn after every opaque part: depth test rejects the covered pixels before shading.
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
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
function skyMaterial(disc: number, drift: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...SKY_UNIFORMS, uDisc: { value: new Color(disc) }, uDrift: drift },
    side: DoubleSide,
    fog: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      ${SKY_GLSL}
      attribute vec3 color;
      attribute float sky;
      uniform float uDrift;
      varying vec3 vDir;
      varying vec3 vColor;
      varying float vSky;
      void main() {
        vDir = position;
        vSky = sky;
        // The gradient per vertex (rings dense at the horizon); only the sun disc is per pixel.
        vColor = sky > 0.5 ? pow(skyColour(normalize(position)), vec3(2.2)) : color;
        float c = cos(uDrift), s = sin(uDrift);
        vec3 cloud = vec3(cameraPosition.x, 0.0, cameraPosition.z) + vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);
        vec3 world = sky > 0.5 ? cameraPosition + position * ${DOME}.0 : cloud;
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

/** Every cloud as faceted lumps with flat bottoms, painted lit on top, warm on the sun side and lavender underneath. */
function cloudGeometry(puffs: readonly CloudPuff[], look: Look): BufferGeometry {
  const sun = new Vector3(...look.sun.dir).normalize();
  const lit = new Color(look.sky.cloudLit);
  const warm = new Color(look.sky.cloudWarm);
  const shade = new Color(look.sky.cloudShade);
  const parts: BufferGeometry[] = [];
  const n = new Vector3();
  const c = new Color();
  for (const p of puffs) {
    for (const [i, lump] of p.lumps.entries()) {
      // The main lump rounder, the shoulders as plain facets (they sit in front of it).
      const g = new IcosahedronGeometry(lump.r, i === 0 ? 1 : 0);
      g.deleteAttribute('uv');
      const pos = g.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) * 0.62;
        pos.setXYZ(i, pos.getX(i) * 1.15 + lump.dx, Math.max(y, -lump.r * 0.22) + lump.dy, pos.getZ(i) + lump.dz);
      }
      g.rotateY(p.yaw);
      g.translate(p.x, p.y, p.z);
      g.computeVertexNormals();
      const nor = g.getAttribute('normal') as BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        n.fromBufferAttribute(nor, i);
        const up = n.y;
        const s = n.dot(sun);
        c.copy(shade).lerp(lit, Math.min(1, Math.max(0, 0.55 + up * 0.5)));
        c.lerp(warm, Math.max(0, s) * 0.35);
        col.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new BufferAttribute(col, 3));
      parts.push(g);
    }
  }
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return merged;
}
