import { BufferAttribute, Color, PlaneGeometry, RingGeometry, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, Vector4, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Circle } from './layout';
import type { Look } from './look';

const MAX_ISLANDS = 48;
const SHORE_PAD = 1.6;

/** Stylised water: shore-to-deep gradient, animated foam band, ripple lines, sky fresnel and sun glint. */
export function waterMaterial(look: Look, islands: readonly Circle[]): ShaderMaterial {
  const list = Array.from({ length: MAX_ISLANDS }, (_, i) => {
    const c = islands[i];
    return c ? new Vector4(c.x, c.z, c.radius + SHORE_PAD, 1) : new Vector4(0, 0, 0, 0);
  });
  const sun = new Vector3(...look.sun.dir).normalize();
  return new ShaderMaterial({
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uIslands: { value: list },
        uCount: { value: Math.min(MAX_ISLANDS, islands.length) },
        uShallow: { value: new Color(look.water.shallow) },
        uDeep: { value: new Color(look.water.deep) },
        uFoam: { value: new Color(look.water.foam) },
        uGlint: { value: new Color(look.water.glint) },
        uSky: { value: new Color(look.skyHorizon) },
        uSun: { value: sun },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec4 uIslands[${MAX_ISLANDS}];
      uniform int uCount;
      uniform vec3 uShallow, uDeep, uFoam, uGlint, uSky, uSun;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec2 p = vWorld.xz;
        float shore = 1e4;
        for (int i = 0; i < ${MAX_ISLANDS}; i++) {
          if (i >= uCount) break;
          vec4 c = uIslands[i];
          shore = min(shore, length(p - c.xy) - c.z);
        }
        float n = noise(p * 0.35 + uTime * 0.12) * 0.6 + noise(p * 1.1 - uTime * 0.2) * 0.4;
        float depth = smoothstep(0.0, 16.0, shore + (n - 0.5) * 3.0);
        vec3 col = mix(uShallow, uDeep, depth);
        float band = 0.55 + 0.35 * sin(uTime * 1.4);
        float foam = 1.0 - smoothstep(0.15, 0.6 + n * 0.5, shore - 0.05);
        float wave = smoothstep(0.08, 0.0, abs(fract(shore * 0.45 - uTime * 0.25 + n * 0.4) - 0.5) - 0.42) * (1.0 - smoothstep(1.0, 5.0, shore)) * band;
        col = mix(col, uFoam, clamp(foam + wave * 0.7, 0.0, 1.0));
        float ripple = smoothstep(0.8, 0.84, noise(p * vec2(0.9, 2.4) + vec2(uTime * 0.3, 0.0))) * smoothstep(4.0, 12.0, shore);
        col = mix(col, uFoam, ripple * 0.07);
        vec3 view = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(view.y, 0.0), 4.0);
        col = mix(col, uSky, fres * 0.35);
        vec3 h = normalize(view + uSun);
        float glint = pow(max(h.y + (n - 0.5) * 0.04, 0.0), 900.0) * 2.5;
        col += uGlint * glint;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/**
 * Low-tier water: the same shore-to-deep gradient baked into vertex colours of a grid round the islands (static, no
 * per-pixel noise), inside a deep-coloured disc; drawn with an unlit vertex-colour material.
 */
export function bakedWaterGeometry(look: Look, islands: readonly Circle[], extent: number, y: number): BufferGeometry {
  const half = extent + 24;
  const cells = Math.min(96, Math.max(24, Math.round((half * 2) / 3)));
  const step = (half * 2) / cells;
  const shallow = new Color(look.water.shallow);
  const deep = new Color(look.water.deep);
  const foam = new Color(look.water.foam);
  const c = new Color();
  const grid = new PlaneGeometry(half * 2, half * 2, cells, cells).rotateX(-Math.PI / 2).translate(0, y, 0);
  const pos = grid.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let shore = 1e4;
    for (const isl of islands) shore = Math.min(shore, Math.hypot(x - isl.x, z - isl.z) - isl.radius - SHORE_PAD);
    const t = Math.min(1, Math.max(0, shore / 16));
    c.copy(shallow).lerp(deep, t * t * (3 - 2 * t));
    if (shore < step * 0.6) c.lerp(foam, 0.35);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  grid.setAttribute('color', new BufferAttribute(colors, 3));
  grid.deleteAttribute('uv');
  const ring = new RingGeometry(half * 0.99, 1500, 48, 1).rotateX(-Math.PI / 2).translate(0, y, 0);
  ring.deleteAttribute('uv');
  const rc = new Float32Array(ring.getAttribute('position').count * 3);
  for (let i = 0; i < rc.length; i += 3) rc.set([deep.r, deep.g, deep.b], i);
  ring.setAttribute('color', new BufferAttribute(rc, 3));
  return mergeGeometries([grid, ring], false)!;
}
