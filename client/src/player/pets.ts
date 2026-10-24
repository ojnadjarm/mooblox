import {
  AnimationMixer,
  Bone,
  BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  Skeleton,
  SkinnedMesh,
  type AnimationClip,
  type AnimationAction,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SKINNED_DEPTH } from '../world/depth-materials';

/** Catalog pet id → node of `cosmetics/pets.glb` (Kenney Cube Pets: 8 clips per animal, in node order). */
const NODES: Readonly<Record<string, string>> = {
  'pet-cat': 'animal-cat',
  'pet-dog': 'animal-dog',
  'pet-bunny': 'animal-bunny',
  'pet-fox': 'animal-fox',
  'pet-panda': 'animal-panda',
  'pet-penguin': 'animal-penguin',
};
const CLIPS_PER_ANIMAL = 8;
/** Pet height next to a 2.6 m kid. */
const HEIGHT = 0.95;

export type PetMotion = 'idle' | 'walk' | 'run';

/** One pet: a single skinned mesh (one draw) on the pack's node rig, with idle, walk and run clips. */
export class PetModel {
  private current: AnimationAction | null = null;

  constructor(
    readonly root: Group,
    private readonly mixer: AnimationMixer,
    private readonly clips: ReadonlyMap<string, AnimationClip>,
    readonly mesh: SkinnedMesh,
  ) {}

  play(motion: PetMotion): void {
    const clip = this.clips.get(motion);
    const next = clip ? this.mixer.clipAction(clip) : null;
    if (!next || next === this.current) return;
    next.reset().fadeIn(0.15).play();
    this.current?.fadeOut(0.15);
    this.current = next;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
  }
}

/** The six Kenney Cube Pets, loaded once (lazily, after the world is playable). */
export class PetLibrary {
  private constructor(
    private readonly scene: Object3D,
    private readonly animations: readonly AnimationClip[],
  ) {}

  static async load(assetBase: string): Promise<PetLibrary> {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${assetBase}cosmetics/pets.glb`);
    return new PetLibrary(gltf.scene, gltf.animations);
  }

  has(id: string): boolean {
    return id in NODES && !!this.scene.getObjectByName(NODES[id]!);
  }

  /** A fresh pet `id`, merged to one skinned mesh, standing on y = 0 and about knee-high to the kid. */
  create(id: string): PetModel {
    const name = NODES[id];
    const source = name ? this.scene.getObjectByName(name) : undefined;
    if (!name || !source) {
      throw new Error(`mooblox: no pet ${id}`);
    }
    const animal = source.clone(true);
    animal.position.set(0, 0, 0);
    animal.rotation.set(0, 0, 0);
    animal.updateMatrixWorld(true);
    const rootInverse = new Matrix4().copy(animal.matrixWorld).invert();
    const bones: Bone[] = [];
    const parts: BufferGeometry[] = [];
    let material: Material | null = null;
    const meshes: Mesh[] = [];
    animal.traverse((o) => {
      if (o instanceof Mesh) meshes.push(o);
    });
    for (const m of meshes) {
      const g = floats(m.geometry.clone()).applyMatrix4(new Matrix4().multiplyMatrices(rootInverse, m.matrixWorld));
      const index = bones.length;
      g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(g.attributes['position']!.count * 4).map((_, i) => (i % 4 === 0 ? index : 0)), 4));
      g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(g.attributes['position']!.count * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
      parts.push(g);
      material ??= m.material as Material;
      const bone = new Bone();
      bone.name = m.name;
      bone.position.copy(m.position);
      bone.quaternion.copy(m.quaternion);
      bone.scale.copy(m.scale);
      m.parent!.add(bone);
      for (const child of [...m.children]) bone.add(child);
      m.removeFromParent();
      bones.push(bone);
    }
    const geometry = mergeGeometries(parts, false);
    if (!geometry || !material) {
      throw new Error(`mooblox: pet ${id} has no mesh`);
    }
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const scale = HEIGHT / Math.max(0.01, box.max.y - box.min.y);
    const root = new Group();
    root.name = `pet:${id}`;
    const body = new Group();
    body.scale.setScalar(scale);
    body.position.y = -box.min.y * scale;
    body.add(animal);
    root.add(body);
    const mesh = new SkinnedMesh(geometry, material);
    mesh.customDepthMaterial = SKINNED_DEPTH;
    mesh.frustumCulled = false;
    animal.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new Skeleton(bones), mesh.matrixWorld);
    const at = Object.keys(NODES).indexOf(id) * CLIPS_PER_ANIMAL;
    const clips = new Map<string, AnimationClip>();
    for (const clip of this.animations.slice(at, at + CLIPS_PER_ANIMAL)) clips.set(clip.name, clip);
    const model = new PetModel(root, new AnimationMixer(animal), clips, mesh);
    model.play('idle');
    return model;
  }
}

/** Plain Float32 copies of quantized (meshopt) attributes, so the parts merge and transform. */
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
