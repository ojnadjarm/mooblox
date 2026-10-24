import {
  BackSide,
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
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';

/** Rendering tier the kit builds its materials for. */
export type MaterialTier = 'standard' | 'low';

/** Flyweight: the few shared materials of the whole world; parts carry colour as vertex colours. */
export class MaterialKit {
  /** Smooth plastic for every part. */
  readonly plastic: Material;
  /** Plastic with the stud normal map, for baseplate tops (uv in studs). */
  readonly studs: Material;
  /** Unlit gradient for the sky dome. */
  readonly sky: Material;
  /** Unlit, over-bright vertex colour for lamps and lanterns (bloom source on the high tier). */
  readonly glow: Material;
  /** Kit-model dressing: vertex colours plus a wind sway in the vertex shader, weighted by the `sway` attribute. */
  readonly scenery: Material;
  /** Seconds the sway runs on; the frame loop advances it. */
  readonly time = { value: 0 };

  constructor(private readonly tier: MaterialTier = 'standard') {
    this.plastic = plasticMaterial(tier, null);
    this.studs = plasticMaterial(tier, studNormalMap());
    this.sky = new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false });
    this.glow = new MeshBasicMaterial({ vertexColors: true, color: new Color().setScalar(tier === 'low' ? 1 : 2.5) });
    this.scenery = swayMaterial(tier, this.time);
  }

  /** A material for one painted texture (signs), lit like the plastic. */
  textured(map: Texture): Material {
    if (this.tier === 'low') {
      return new MeshLambertMaterial({ map });
    }
    return new MeshStandardMaterial({ map, roughness: 0.7, metalness: 0 });
  }

  dispose(): void {
    for (const m of [this.plastic, this.studs, this.sky, this.glow, this.scenery]) {
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
