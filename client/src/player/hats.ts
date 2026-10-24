import { Mesh, type BufferGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MeshPart } from './character/parts';
import { BODY } from './character/parts';

const HEAD_TOP = BODY.head.max[1];

/** The designed hats of `cosmetics/hats.glb` (built by tools/hats.py) as head-bone mesh parts, by catalog id. */
export class HatLibrary {
  private constructor(private readonly parts: ReadonlyMap<string, MeshPart>) {}

  static async load(assetBase: string): Promise<HatLibrary> {
    const gltf = await new GLTFLoader().loadAsync(`${assetBase}cosmetics/hats.glb`);
    const parts = new Map<string, MeshPart>();
    gltf.scene.traverse((o) => {
      if (o instanceof Mesh) parts.set(o.name, toPart(o.geometry as BufferGeometry));
    });
    return new HatLibrary(parts);
  }

  /** The mesh part of `id`, null when the library has no such model. */
  part(id: string): MeshPart | null {
    return this.parts.get(id) ?? null;
  }

  get ids(): string[] {
    return [...this.parts.keys()];
  }
}

/** Unrolls an indexed glTF geometry (origin = top of the head) into bind-space triangles on the head bone. */
export function toPart(geometry: BufferGeometry): MeshPart {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = flat.getAttribute('position');
  const col = flat.getAttribute('color');
  const positions = new Float32Array(pos.count * 3);
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    positions.set([pos.getX(i), pos.getY(i) + HEAD_TOP, pos.getZ(i)], i * 3);
    colours.set(col ? [col.getX(i), col.getY(i), col.getZ(i)] : [1, 1, 1], i * 3);
  }
  return { kind: 'mesh', bone: 'head', positions, colours };
}
