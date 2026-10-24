import {
  BufferAttribute,
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  TextureLoader,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';

/** Rendering tier the kit builds its materials for; `rich` adds world-space detail textures (xhigh). */
export type MaterialTier = 'standard' | 'low' | 'rich';

/** Flyweight: the few shared materials of the whole world; parts carry colour as vertex colours. */
export class MaterialKit {
  /** Smooth plastic for every part. */
  readonly plastic: Material;
  /** Plastic with the stud normal map, for baseplate tops (uv in studs). */
  readonly studs: Material;
  /** Unlit, over-bright vertex colour for lamps and lanterns (bloom source on the high tier). */
  readonly glow: Material;
  /** Kit-model dressing: vertex colours plus a wind sway in the vertex shader, weighted by the `sway` attribute. */
  readonly scenery: Material;
  /** The scenery material for instanced meshes: its own program state, so draws do not switch programs every frame. */
  readonly sceneryInstanced: Material;
  /** Seconds the sway runs on; the frame loop advances it. */
  readonly time = { value: 0 };
  /** Packed greyscale detail atlases (rich tier); grey until `loadDetail` swaps the real ones in. */
  private readonly detail = { a: { value: flatDetail() as Texture }, b: { value: flatDetail() as Texture } };

  constructor(private readonly tier: MaterialTier = 'standard') {
    this.plastic = plasticMaterial(tier, null);
    this.studs = plasticMaterial(tier, studNormalMap());
    if (tier === 'rich') withDetail(this.studs as MeshStandardMaterial, this.detail, 'mooblox-studs-rich', false);
    this.glow = new MeshBasicMaterial({ vertexColors: true, color: new Color().setScalar(tier === 'low' ? 1 : 2.5) });
    this.scenery = swayMaterial(tier, this.time);
    if (tier === 'rich') withDetail(this.scenery as MeshStandardMaterial, this.detail, 'mooblox-sway-rich', true);
    this.sceneryInstanced = swayMaterial(tier, this.time);
    if (tier === 'rich') withDetail(this.sceneryInstanced as MeshStandardMaterial, this.detail, 'mooblox-sway-rich', true);
  }

  /** Loads the detail atlases (`<base>detail/detail-a.png`, `-b.png`) for the rich tier; a no-op on other tiers. */
  async loadDetail(base: string): Promise<void> {
    if (this.tier !== 'rich') return;
    const loader = new TextureLoader();
    const [a, b] = await Promise.all(['a', 'b'].map((k) => loader.loadAsync(`${base}detail/detail-${k}.png`)));
    for (const [slot, t] of [[this.detail.a, a!], [this.detail.b, b!]] as const) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.colorSpace = NoColorSpace;
      t.anisotropy = 8;
      t.premultiplyAlpha = false;
      slot.value.dispose();
      slot.value = t;
    }
  }

  /** A material for one painted texture (signs), lit like the plastic. */
  textured(map: Texture): Material {
    if (this.tier === 'low') {
      return new MeshLambertMaterial({ map });
    }
    return new MeshStandardMaterial({ map, roughness: 0.7, metalness: 0 });
  }

  /** Vertex-coloured plastic times one painted atlas (the trophy hall). */
  paintedPlastic(map: Texture): Material {
    if (this.tier === 'low') {
      return new MeshLambertMaterial({ map, vertexColors: true });
    }
    return new MeshStandardMaterial({ map, vertexColors: true, roughness: 0.6, metalness: 0 });
  }

  dispose(): void {
    for (const m of [this.plastic, this.studs, this.glow, this.scenery, this.sceneryInstanced]) {
      m.dispose();
    }
  }
}

function swayMaterial(tier: MaterialTier, time: { value: number }): Material {
  const m = tier === 'low' ? new MeshLambertMaterial({ vertexColors: true }) : new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvec4 wp = modelMatrix * vec4(position, 1.0);\nfloat ph = uTime * 1.7 + wp.x * 0.35 + wp.z * 0.27;\ntransformed.x += sin(ph) * sway * 0.12;\ntransformed.z += cos(ph * 0.8) * sway * 0.08;',
      );
  };
  m.customProgramCacheKey = () => 'mooblox-sway';
  return m;
}

/** Paints every vertex of a geometry one palette colour (sRGB hex). */
export function paint(geometry: BufferGeometry, hex: number): BufferGeometry {
  const c = new Color(hex);
  const count = geometry.getAttribute('position').count;
  const existing = geometry.getAttribute('color');
  const attr = existing?.count === count && existing instanceof BufferAttribute ? existing : new BufferAttribute(new Float32Array(count * 3), 3);
  for (let i = 0; i < count; i++) {
    attr.setXYZ(i, c.r, c.g, c.b);
  }
  attr.needsUpdate = true;
  geometry.setAttribute('color', attr);
  return geometry;
}

function plasticMaterial(tier: MaterialTier, normalMap: DataTexture | null): Material {
  if (tier === 'low') {
    return new MeshLambertMaterial({ vertexColors: true });
  }
  return new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, normalMap });
}

/** One stud per texel tile: a raised round bump as a tangent-space normal map. */
function studNormalMap(size = 32): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const r = size * 0.3;
  const rim = size * 0.06;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - size / 2;
      const dy = y + 0.5 - size / 2;
      const d = Math.hypot(dx, dy);
      let nx = 0;
      let ny = 0;
      if (d > r - rim && d < r + rim) {
        const k = Math.cos(((d - r) / rim) * (Math.PI / 2)) * 0.8;
        nx = (dx / d) * k;
        ny = (dy / d) * k;
      }
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      data.set([(nx * 0.5 + 0.5) * 255, (-ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255, 255], (y * size + x) * 4);
    }
  }
  const t = new DataTexture(data, size, size, RGBAFormat);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function flatDetail(): DataTexture {
  const t = new DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

/**
 * Rich tier: world-space detail textures by surface (dominant-axis planar mapping), albedo and roughness variation and
 * a bump from the detail's screen-space slope. `fromAttribute` reads the `surface` attribute; otherwise green parts
 * count as grass. Channels: a = grass, foliage, wood, rock; b = roof, plaster, brick, ground (surfaces 1 to 8).
 */
function withDetail(m: MeshStandardMaterial, detail: { a: { value: Texture }; b: { value: Texture } }, key: string, fromAttribute: boolean): void {
  const before = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms['uDetailA'] = detail.a;
    shader.uniforms['uDetailB'] = detail.b;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${fromAttribute ? 'attribute float surface;' : ''}\nflat varying float vSurface;\nvarying vec3 vDetailPos;\nvarying vec3 vDetailNormal;`)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvDetailPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDetailNormal = normalize(mat3(modelMatrix) * objectNormal);\nvSurface = ${fromAttribute ? 'surface' : '-1.0'};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uDetailA;
uniform sampler2D uDetailB;
flat varying float vSurface;
varying vec3 vDetailPos;
varying vec3 vDetailNormal;
const float SCALE[10] = float[10](0.0, 0.32, 0.9, 0.85, 0.45, 0.7, 0.55, 0.6, 0.4, 0.0);
const float STRENGTH[10] = float[10](0.0, 0.55, 0.6, 0.6, 0.65, 0.7, 0.35, 0.6, 0.5, 0.0);
const float BUMP[10] = float[10](0.0, 1.2, 1.4, 1.6, 2.2, 2.4, 0.8, 2.0, 1.2, 0.0);
const float ROUGH[10] = float[10](0.62, 0.85, 0.72, 0.7, 0.88, 0.55, 0.9, 0.86, 0.95, 0.38);
vec3 mbPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = normalize(dFdx(surfPos));
  vec3 sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
int mbS = int(vSurface + 0.5);
if (vSurface < -0.5) mbS = (vColor.g > vColor.r * 1.08 && vColor.g > vColor.b) ? 1 : 0;
vec3 mbN = abs(vDetailNormal);
vec2 mbUv = mbN.y >= max(mbN.x, mbN.z) ? vDetailPos.xz : (mbN.x >= mbN.z ? vDetailPos.zy : vDetailPos.xy);
mbUv *= SCALE[mbS];
vec4 mbA = texture2D(uDetailA, mbUv);
vec4 mbB = texture2D(uDetailB, mbUv);
float mbD = 0.5;
if (mbS == 1) mbD = mbA.r; else if (mbS == 2) mbD = mbA.g; else if (mbS == 3) mbD = mbA.b; else if (mbS == 4) mbD = mbA.a;
else if (mbS == 5) mbD = mbB.r; else if (mbS == 6) mbD = mbB.g; else if (mbS == 7) mbD = mbB.b; else if (mbS == 8) mbD = mbB.a;
float mbFade = 1.0 - smoothstep(40.0, 140.0, length(vViewPosition));
float mbK = STRENGTH[mbS] * mbFade;
diffuseColor.rgb *= 1.0 + (mbD - 0.5) * 1.3 * mbK;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(ROUGH[mbS] + (0.5 - mbD) * 0.25 * mbK, 0.05, 1.0);')
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = mbPerturb(-vViewPosition, normal, vec2(dFdx(mbD), dFdy(mbD)) * BUMP[mbS] * mbFade, faceDirection);',
      );
  };
  m.customProgramCacheKey = () => key;
}
