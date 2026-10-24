import {
  BufferAttribute,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { MaterialKit } from './material-kit';
import type { Look } from './look';
import { PostChain } from './post';

export interface StageOptions {
  readonly antialias: boolean;
  readonly shadowMapSize: number;
  readonly post: boolean;
}

const SUN_DISTANCE = 80;

/** One WebGL2 renderer, scene, camera and the fixed light set (sky, sun with one shadow, fog). */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, 0.1, 900);
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private readonly post: PostChain | null;
  private readonly sunDir: { x: number; y: number; z: number };

  constructor(
    readonly canvasHost: HTMLElement,
    kit: MaterialKit,
    options: StageOptions,
    look: Look,
  ) {
    this.sun = new DirectionalLight(look.sun.color, look.sun.intensity);
    this.hemi = new HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity);
    const [sx, sy, sz] = look.sun.dir;
    this.sunDir = { x: sx, y: sy, z: sz };
    this.renderer = new WebGLRenderer({ antialias: options.antialias && !options.post, powerPreference: 'high-performance' });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = look.exposure;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    canvasHost.appendChild(this.renderer.domElement);

    this.scene.background = new Color(look.skyHorizon);
    this.scene.fog = new Fog(look.fog.color, look.fog.near, look.fog.far);
    this.scene.add(this.hemi, this.sun, this.sun.target, skyDome(kit, look));
    this.post = options.post ? new PostChain(this.renderer, this.scene, this.camera, look) : null;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(options.shadowMapSize, options.shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = SUN_DISTANCE * 2.5;
  }

  add(object: Object3D): void {
    this.scene.add(object);
  }

  /** Centres the one shadow map on (x, z), covering a square of half-size `radius`. */
  focusShadow(x: number, z: number, radius: number): void {
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -radius;
    cam.right = cam.top = radius;
    cam.updateProjectionMatrix();
    this.sun.target.position.set(x, 0, z);
    const d = this.sunDir;
    const k = SUN_DISTANCE / Math.hypot(d.x, d.y, d.z);
    this.sun.position.set(x + d.x * k, d.y * k, z + d.z * k);
  }

  /** Matches the drawing buffer to the host size at the given pixel ratio. */
  resize(pixelRatio: number): void {
    const w = Math.max(1, this.canvasHost.clientWidth);
    const h = Math.max(1, this.canvasHost.clientHeight);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h, pixelRatio);
  }

  render(): void {
    this.renderer.info.reset();
    if (this.post) {
      this.post.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Unlit gradient dome, horizon to zenith. */
function skyDome(kit: MaterialKit, look: Look): Mesh {
  const g = new SphereGeometry(800, 24, 12);
  const top = new Color(look.skyTop);
  const horizon = new Color(look.skyHorizon);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 800);
    c.copy(horizon).lerp(top, Math.pow(t, 0.6));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  const dome = new Mesh(g, kit.sky);
  dome.name = 'sky';
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  return dome;
}
