import { Box3, BufferAttribute, BufferGeometry, Color, Matrix4, Mesh, SRGBColorSpace, Vector2, type MeshStandardMaterial, type Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** One CC0 model baked to a single vertex-coloured, non-indexed geometry standing on y = 0. */
export interface BakedModel {
  readonly geometry: BufferGeometry;
  readonly height: number;
  readonly width: number;
}

/** Loads CC0 pack models (`pack/name`) and bakes material colours and colormap texels into vertex colours. */
export class ModelLibrary {
  private readonly models = new Map<string, BakedModel>();
  private readonly pixels = new Map<Texture, { data: Uint8ClampedArray; w: number; h: number }>();

  /** Loads `kit.glb` (one node per model, `tools/pack-kit.mjs`); `hd` loads the bevelled `kit-hd/` variants (xhigh) where there are some. */
  static async load(base: string, ids: readonly string[], hd = false): Promise<ModelLibrary> {
    const lib = new ModelLibrary();
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const kit = (await loader.loadAsync(`${base}kit.glb`)).scene;
    await Promise.all(
      ids.map(async (id) => {
        const bevelled = hd ? await loader.loadAsync(`${base}kit-hd/${id}.glb`).catch(() => null) : null;
        const node = bevelled?.scene ?? kit.getObjectByName(id.replace('/', '__'));
        if (!node) throw new Error(`mooblox: model ${id} is not in kit.glb`);
        node.removeFromParent();
        lib.models.set(id, lib.bake(node));
      }),
    );
    return lib;
  }

  /** Every loaded model id. */
  get ids(): string[] {
    return [...this.models.keys()];
  }

  get(id: string): BakedModel {
    const m = this.models.get(id);
    if (!m) {
      throw new Error(`mooblox: model ${id} not loaded`);
    }
    return m;
  }

  private bake(root: import('three').Object3D): BakedModel {
    root.updateMatrixWorld(true);
    const parts: BufferGeometry[] = [];
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as MeshStandardMaterial[];
      const src = floats(mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone());
      src.applyMatrix4(mesh.matrixWorld as Matrix4);
      const pos = src.getAttribute('position');
      const uv = src.getAttribute('uv');
      const colors = new Float32Array(pos.count * 3);
      const groups = src.groups.length ? src.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
      const c = new Color();
      for (const g of groups) {
        const mat = mats[g.materialIndex ?? 0] ?? mats[0]!;
        const px = mat.map ? this.texels(mat.map) : null;
        mat.map?.updateMatrix();
        const st = new Vector2();
        for (let i = g.start; i < Math.min(pos.count, g.start + g.count); i++) {
          c.copy(mat.color);
          if (px && uv) {
            st.set(uv.getX(i), uv.getY(i)).applyMatrix3(mat.map!.matrix);
            const u = ((st.x % 1) + 1) % 1;
            const v = ((st.y % 1) + 1) % 1;
            const x = Math.min(px.w - 1, Math.floor(u * px.w));
            const y = Math.min(px.h - 1, Math.floor(v * px.h));
            const k = (y * px.w + x) * 4;
            const t = new Color().setRGB(px.data[k]! / 255, px.data[k + 1]! / 255, px.data[k + 2]! / 255, SRGBColorSpace);
            c.multiply(t);
          }
          colors.set([c.r, c.g, c.b], i * 3);
        }
      }
      const out = new BufferGeometry();
      out.setAttribute('position', pos);
      out.setAttribute('color', new BufferAttribute(colors, 3));
      const normal = src.getAttribute('normal');
      if (normal) out.setAttribute('normal', normal);
      else out.computeVertexNormals();
      parts.push(out);
    });
    const merged = parts.length === 1 ? parts[0]! : mergeAll(parts);
    const box = new Box3().setFromBufferAttribute(merged.getAttribute('position') as BufferAttribute);
    merged.translate(0, -box.min.y, 0);
    return { geometry: merged, height: box.max.y - box.min.y, width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) };
  }

  private texels(map: Texture): { data: Uint8ClampedArray; w: number; h: number } {
    let px = this.pixels.get(map);
    if (!px) {
      const img = map.image as CanvasImageSource & { width: number; height: number };
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      px = { data: ctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
      this.pixels.set(map, px);
    }
    return px;
  }
}

function mergeAll(parts: BufferGeometry[]): BufferGeometry {
  const total = parts.reduce((n, p) => n + p.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    const a = p.getAttribute('position');
    const b = p.getAttribute('color');
    const n = p.getAttribute('normal');
    for (let i = 0; i < a.count; i++, o++) {
      pos.set([a.getX(i), a.getY(i), a.getZ(i)], o * 3);
      col.set([b.getX(i), b.getY(i), b.getZ(i)], o * 3);
      nor.set([n.getX(i), n.getY(i), n.getZ(i)], o * 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  return g;
}

/** Replaces quantized (meshopt) attributes with plain Float32 ones, so baked models merge with built geometry. */
function floats(g: BufferGeometry): BufferGeometry {
  for (const [name, attr] of Object.entries(g.attributes)) {
    if (attr.array instanceof Float32Array && !('isInterleavedBufferAttribute' in attr)) continue;
    const out = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) {
      for (let k = 0; k < attr.itemSize; k++) out[i * attr.itemSize + k] = attr.getComponent(i, k);
    }
    g.setAttribute(name, new BufferAttribute(out, attr.itemSize));
  }
  return g;
}
