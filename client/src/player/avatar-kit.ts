import {
  Bone,
  CanvasTexture,
  Group,
  LinearMipmapLinearFilter,
  MeshLambertMaterial,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  type AnimationClip,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Avatar } from './avatar';
import { ATLAS_SIZE, paintAtlas } from './character/atlas';
import { composeParts, type Wearable } from './character/compose';
import { LEGACY_BODIES, type CharacterLook, type LegacyLook } from './character/look';
import { buildGeometry } from './character/mesh';
import { BONES } from './character/parts';
import { jumpClip } from './clips';
import { toCharacter } from './look';
import { SKINNED_DEPTH } from '../world/depth-materials';

/** A built character, or a T1302 preset body with a shirt tint (migrated on create). */
export type AvatarLook = CharacterLook | LegacyLook;

/** A preset body id (the T1302 Kenney letters, now character presets). */
export interface AvatarBody {
  readonly id: string;
}

/** Builds avatars from a look; the one seam a different character set plugs into. */
export interface AvatarFactory {
  readonly bodies: readonly AvatarBody[];
  create(look: AvatarLook, wearables?: readonly Wearable[]): Promise<Avatar>;
}

/** Modular blocky characters: one skinned mesh and one shared material (vertex colours + face atlas) per avatar. */
export class AvatarKit implements AvatarFactory {
  readonly bodies: readonly AvatarBody[] = LEGACY_BODIES.map((id) => ({ id }));

  private constructor(
    private readonly rig: Object3D,
    readonly clips: readonly AnimationClip[],
    readonly material: MeshLambertMaterial,
  ) {}

  /** Loads the Kenney rig and clips once and paints the face atlas. */
  static async load(assetBase: string): Promise<AvatarKit> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(`${assetBase}kenney-blocky.glb`);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ATLAS_SIZE;
    paintAtlas(canvas.getContext('2d')!);
    const atlas = new CanvasTexture(canvas);
    atlas.colorSpace = SRGBColorSpace;
    atlas.minFilter = LinearMipmapLinearFilter;
    const material = new MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
    return new AvatarKit(gltf.scene, [...gltf.animations, jumpClip()], material);
  }

  async create(look: AvatarLook, wearables: readonly Wearable[] = []): Promise<Avatar> {
    const root = new Group();
    root.name = 'character';
    const bones = this.skeletonBones();
    root.add(bones[0]!);
    root.updateMatrixWorld(true);
    const geometry = buildGeometry(composeParts(toCharacter(look), wearables));
    const mesh = new SkinnedMesh(geometry, this.material);
    mesh.castShadow = true;
    mesh.customDepthMaterial = SKINNED_DEPTH;
    root.add(mesh);
    mesh.bind(new Skeleton(bones));
    return new Avatar(root, this.clips);
  }

  /** Bones named and posed like the rig's nodes, in BONES order, parented as in the rig. */
  private skeletonBones(): Bone[] {
    const bones = BONES.map((name) => {
      const node = this.rig.getObjectByName(name);
      if (!node) {
        throw new Error(`mooblox: rig has no node ${name}`);
      }
      const bone = new Bone();
      bone.name = name;
      bone.position.copy(node.position);
      bone.quaternion.copy(node.quaternion);
      bone.scale.copy(node.scale);
      return bone;
    });
    BONES.forEach((name, i) => {
      const parent = this.rig.getObjectByName(name)!.parent!.name;
      const at = BONES.indexOf(parent as (typeof BONES)[number]);
      if (at >= 0) bones[at]!.add(bones[i]!);
    });
    return bones;
  }
}
