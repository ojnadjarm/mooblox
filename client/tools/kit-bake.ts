import { readFileSync } from 'node:fs';
import { NodeIO, type Material } from '@gltf-transform/core';
import { ALL_EXTENSIONS, type Transform } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { Box3, BufferAttribute, BufferGeometry, Color, Matrix4, SRGBColorSpace } from 'three';
import { furnishHouse } from '../src/world/house-detail';
import { tagModel, type BakedModel } from '../src/world/model-library';

/** One kit model baked in Node as `ModelLibrary` bakes it in the page, plus the source material name of each vertex. */
export interface KitModel {
  readonly model: BakedModel;
  readonly materials: readonly string[];
}

/** Every model of a packed kit (`public/assets/kit.glb`), keyed `pack/name`: vertex colours = material colour x colormap texel. */
export async function bakeKit(path: string): Promise<Map<string, KitModel>> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(readFileSync(path)));
  const images = new Map<string, { data: Buffer; w: number; h: number }>();
  for (const t of doc.getRoot().listTextures()) {
    const { data, info } = await sharp(Buffer.from(t.getImage()!)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    images.set(t.getName() + t.getURI() + doc.getRoot().listTextures().indexOf(t), { data, w: info.width, h: info.height });
  }
  const texels = (m: Material) => {
    const t = m.getBaseColorTexture();
    return t ? images.get(t.getName() + t.getURI() + doc.getRoot().listTextures().indexOf(t))! : null;
  };
  const out = new Map<string, KitModel>();
  for (const wrapper of doc.getRoot().listScenes()[0]!.listChildren()) {
    const parts: { pos: number[]; nor: number[] | null; col: number[]; mat: string }[] = [];
    wrapper.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      const world = new Matrix4().fromArray(node.getWorldMatrix());
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial()!;
        const pos = prim.getAttribute('POSITION')!;
        const nor = prim.getAttribute('NORMAL');
        const uv = prim.getAttribute('TEXCOORD_0');
        const idx = prim.getIndices();
        const px = texels(mat);
        const tt = mat.getBaseColorTextureInfo()?.getExtension<Transform>('KHR_texture_transform');
        const [ox, oy] = (tt?.getOffset() ?? [0, 0]) as [number, number];
        const [sx, sy] = (tt?.getScale() ?? [1, 1]) as [number, number];
        const rot = tt?.getRotation() ?? 0;
        const base = mat.getBaseColorFactor();
        const n = idx ? idx.getCount() : pos.getCount();
        const g = { pos: [] as number[], nor: nor ? ([] as number[]) : null, col: [] as number[], mat: mat.getName() };
        const v: number[] = [];
        const c = new Color();
        const t = new Color();
        for (let k = 0; k < n; k++) {
          const i = idx ? idx.getScalar(k) : k;
          g.pos.push(...pos.getElement(i, v));
          if (nor) g.nor!.push(...nor.getElement(i, v));
          c.setRGB(base[0]!, base[1]!, base[2]!);
          if (px && uv) {
            const [u0, v0] = uv.getElement(i, v) as [number, number];
            const su = sx * Math.cos(rot) * u0 + sx * Math.sin(rot) * v0 + ox;
            const sv = -sy * Math.sin(rot) * u0 + sy * Math.cos(rot) * v0 + oy;
            const x = Math.min(px.w - 1, Math.floor((((su % 1) + 1) % 1) * px.w));
            const y = Math.min(px.h - 1, Math.floor((((sv % 1) + 1) % 1) * px.h));
            const o = (y * px.w + x) * 4;
            c.multiply(t.setRGB(px.data[o]! / 255, px.data[o + 1]! / 255, px.data[o + 2]! / 255, SRGBColorSpace));
          }
          g.col.push(c.r, c.g, c.b);
        }
        const geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(new Float32Array(g.pos), 3));
        if (g.nor) geo.setAttribute('normal', new BufferAttribute(new Float32Array(g.nor), 3));
        geo.applyMatrix4(world);
        if (!g.nor) geo.computeVertexNormals();
        parts.push({ pos: Array.from(geo.getAttribute('position').array), nor: Array.from(geo.getAttribute('normal').array), col: g.col, mat: g.mat });
      }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(parts.flatMap((p) => p.pos)), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(parts.flatMap((p) => p.col)), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(parts.flatMap((p) => p.nor!)), 3));
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as BufferAttribute);
    geometry.translate(0, -box.min.y, 0);
    const id = wrapper.getName().replace('__', '/');
    const furnished = furnishHouse(id, geometry, parts.flatMap((p) => Array<string>(p.pos.length / 3).fill(p.mat)));
    const materials = furnished.materials;
    tagModel(furnished.geometry, id, materials);
    out.set(id, { model: { geometry: furnished.geometry, height: box.max.y - box.min.y, width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) }, materials });
  }
  return out;
}
