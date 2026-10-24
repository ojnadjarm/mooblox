import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { Look } from './look';
import type { MaterialKit } from './material-kit';
import { PostChain } from './post';
import { Sky } from './sky';

export interface StageOptions {
  readonly antialias: boolean;
  readonly shadowMapSize: number;
  readonly post: boolean;
  /** Ambient occlusion in the post chain and softer sun shadows (xhigh). */
  readonly ao?: boolean;
}

const SUN_DISTANCE = 80;

/** Seed of the cloud layer: one designed sky for every course. */
const SKY_SEED = 7;

/** One WebGL2 renderer, scene, camera and the fixed light set (sky, sun with one shadow, fog). */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, 0.1, 900);
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly sky: Sky;
  private post: PostChain | null;
  private readonly sunDir: { x: number; y: number; z: number };
  private readonly vignetteStrength: number;

  constructor(
    readonly canvasHost: HTMLElement,
    _kit: MaterialKit,
    options: StageOptions,
    look: Look,
  ) {
    this.sun = new DirectionalLight(look.sun.color, look.sun.intensity);
    this.hemi = new HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity);
    const [sx, sy, sz] = look.sun.dir;
    this.sunDir = { x: sx, y: sy, z: sz };
    this.renderer = new WebGLRenderer({ antialias: options.antialias && !options.post, powerPreference: 'high-performance' });
    // Neutral keeps the palette's hue and saturation (ACES greyed the sky and the cream horizon).
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = look.exposure;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    canvasHost.appendChild(this.renderer.domElement);

    this.scene.background = new Color(look.sky.horizon);
    this.scene.fog = new Fog(look.fog.color, look.fog.near, look.fog.far);
    this.sky = new Sky(look, SKY_SEED);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.sky.mesh);
    this.post = options.post ? new PostChain(this.renderer, this.scene, this.camera, look, options.ao === true) : null;
    this.vignetteStrength = look.post.vignette;
    if (!this.post) vignette(this.renderer.domElement, look.post.vignette);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(options.shadowMapSize, options.shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    if (options.ao) {
      this.renderer.shadowMap.type = PCFShadowMap;
      this.sun.shadow.radius = 3;
      this.sun.shadow.blurSamples = 16;
    }
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = SUN_DISTANCE * 2.5;
  }

  add(object: Object3D): void {
    // The island builder's static cloud bank is replaced by the sky's drifting layer.
    const old = object.getObjectByName('clouds');
    if (old) old.visible = false;
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

  /** Renders straight to the canvas from now on (a tier step-down); the grade's vignette moves to a CSS overlay. */
  dropPost(): void {
    if (!this.post) return;
    this.post = null;
    vignette(this.renderer.domElement, this.vignetteStrength);
  }

  render(): void {
    this.sky.update();
    this.renderer.info.reset();
    if (this.post) {
      this.post.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose(): void {
    this.sky.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** The post grade's vignette as a free CSS overlay over the canvas (tiers without post). */
function vignette(canvas: HTMLElement, strength: number): void {
  if (strength <= 0 || canvas.parentElement?.querySelector('.mooblox-vignette')) return;
  const v = document.createElement('div');
  v.className = 'mooblox-vignette';
  v.setAttribute('aria-hidden', 'true');
  Object.assign(v.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(20,10,0,${(strength * 0.9).toFixed(3)}) 100%)`,
  });
  canvas.after(v);
}
