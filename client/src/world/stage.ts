import {
  BufferAttribute,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { MaterialKit } from './material-kit';
import { Palette } from './palette';

export interface StageOptions {
  readonly antialias: boolean;
  readonly shadowMapSize: number;
}

const SUN_DIRECTION = { x: 0.55, y: 1, z: 0.35 };
const SUN_DISTANCE = 80;

/** One WebGL2 renderer, scene, camera and the fixed light set (sky, sun with one shadow, fog). */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, 0.1, 900);
  readonly sun = new DirectionalLight(0xfff4e0, 2.4);
  readonly hemi = new HemisphereLight(Palette.skyHorizon, 0x7a9a5a, 1.5);

  constructor(
    readonly canvasHost: HTMLElement,
    kit: MaterialKit,
    options: StageOptions,
  ) {
    this.renderer = new WebGLRenderer({ antialias: options.antialias, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    canvasHost.appendChild(this.renderer.domElement);

    this.scene.background = new Color(Palette.skyHorizon);
    this.scene.fog = new Fog(Palette.skyHorizon, 70, 240);
    this.scene.add(this.hemi, this.sun, this.sun.target, skyDome(kit));

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
    this.sun.position.set(x + SUN_DIRECTION.x * SUN_DISTANCE, SUN_DIRECTION.y * SUN_DISTANCE, z + SUN_DIRECTION.z * SUN_DISTANCE);
  }

  /** Matches the drawing buffer to the host size at the given pixel ratio. */
  resize(pixelRatio: number): void {
    const w = Math.max(1, this.canvasHost.clientWidth);
    const h = Math.max(1, this.canvasHost.clientHeight);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Unlit gradient dome, horizon to zenith. */
function skyDome(kit: MaterialKit): Mesh {
  const g = new SphereGeometry(800, 24, 12);
  const top = new Color(Palette.skyTop);
  const horizon = new Color(Palette.skyHorizon);
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
