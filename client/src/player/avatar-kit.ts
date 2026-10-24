import {
  CanvasTexture,
  MeshStandardMaterial,
  SRGBColorSpace,
  type AnimationClip,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Avatar } from './avatar';
import { jumpClip } from './clips';
import { KENNEY_SHIRT, recolorClothes } from './recolor';

/** Preset look: a Kenney skin letter (a..r) and an optional shirt tint (sRGB hex). */
export interface AvatarLook {
  readonly skin: string;
  readonly tint: number | null;
}

export const SKINS = 'abcdefghijklmnopqr'.split('');

/** Loads the blocky character once and builds tinted avatars from it. */
export class AvatarKit {
  private readonly skins = new Map<string, Promise<ImageBitmap>>();

  private readonly uvTransform: Texture | null;

  private constructor(
    private readonly template: Object3D,
    readonly clips: readonly AnimationClip[],
    private readonly assetBase: string,
  ) {
    let map: Texture | null = null;
    template.traverse((o) => {
      map ??= ((o as Mesh).material as MeshBasicMaterial | undefined)?.map ?? null;
    });
    this.uvTransform = map;
  }

  static async load(assetBase: string): Promise<AvatarKit> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(`${assetBase}kenney-blocky.glb`);
    return new AvatarKit(gltf.scene, [...gltf.animations, jumpClip()], assetBase);
  }

  async create(look: AvatarLook): Promise<Avatar> {
    const skin = SKINS.includes(look.skin) ? look.skin : 'a';
    const material = new MeshStandardMaterial({ map: await this.texture(skin, look.tint), roughness: 0.65, metalness: 0 });
    const root = this.template.clone(true);
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const m = o as Mesh;
        m.material = material;
        m.castShadow = true;
      }
    });
    return new Avatar(root, this.clips);
  }

  private async texture(skin: string, tint: number | null): Promise<CanvasTexture> {
    let image = this.skins.get(skin);
    if (!image) {
      image = fetch(`${this.assetBase}skins/texture-${skin}.png`)
        .then((r) => r.blob())
        .then((b) => createImageBitmap(b));
      this.skins.set(skin, image);
    }
    const bitmap = await image;
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    if (tint !== null) {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      recolorClothes(img.data, canvas.width, canvas.height, tint, KENNEY_SHIRT);
      ctx.putImageData(img, 0, 0);
    }
    const texture = new CanvasTexture(canvas);
    texture.flipY = false;
    if (this.uvTransform) {
      texture.offset.copy(this.uvTransform.offset);
      texture.repeat.copy(this.uvTransform.repeat);
      texture.rotation = this.uvTransform.rotation;
      texture.center.copy(this.uvTransform.center);
      texture.wrapS = this.uvTransform.wrapS;
      texture.wrapT = this.uvTransform.wrapT;
      texture.minFilter = this.uvTransform.minFilter;
      texture.magFilter = this.uvTransform.magFilter;
    }
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }
}
