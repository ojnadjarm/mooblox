import { DirectionalLight, HemisphereLight, NeutralToneMapping, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Avatar } from '../../player/avatar';
import type { AvatarFactory } from '../../player/avatar-kit';
import type { CharacterLook } from '../../player/character/look';
import { CAMPUS } from '../../world/look';

const SPIN = 0.6;
const MAX_DPR = 1.5;

/** Turntable preview of one character in its own small renderer; drag to turn, idles otherwise. */
export class CreatorPreview {
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(28, 1, 0.5, 40);
  private avatar: Avatar | null = null;
  private handle: number | null = null;
  private last = 0;
  private yaw = 0.35;
  private drag: { x: number; yaw: number } | null = null;
  private ticket = 0;
  private resize: ResizeObserver | null = null;
  /** The avatar whose programs are ready in the current renderer; the loop draws only that one. */
  private compiled: Avatar | null = null;
  /** Callers of `rendererReady` waiting for the renderer the next frame makes. */
  private waiting: ((r: WebGLRenderer | null) => void)[] = [];
  /** Frames drawn since `start()`. */
  frames = 0;

  constructor(
    readonly host: HTMLElement,
    private readonly factory: AvatarFactory,
  ) {
    this.scene.add(new HemisphereLight(CAMPUS.hemi.sky, CAMPUS.hemi.ground, CAMPUS.hemi.intensity));
    const sun = new DirectionalLight(CAMPUS.sun.color, CAMPUS.sun.intensity);
    sun.position.set(...CAMPUS.sun.dir);
    this.scene.add(sun);
    host.addEventListener('pointerdown', (e) => {
      if (e.target !== this.renderer?.domElement) return;
      this.drag = { x: e.clientX, yaw: this.yaw };
      host.setPointerCapture(e.pointerId);
    });
    host.addEventListener('pointermove', (e) => {
      if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012;
    });
    const end = () => (this.drag = null);
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
  }

  /** Shows `look` once its programs are compiled off the main thread (the old look stays meanwhile); a newer call wins over a slower older one. */
  async show(look: CharacterLook): Promise<void> {
    const ticket = ++this.ticket;
    const next = await this.factory.create(look);
    const renderer = ticket === this.ticket ? await this.rendererReady() : null;
    if (renderer) await renderer.compileAsync(next.root, this.camera, this.scene);
    if (ticket !== this.ticket) {
      next.dispose();
      return;
    }
    this.avatar?.root.removeFromParent();
    this.avatar?.dispose();
    this.avatar = next;
    if (renderer && renderer === this.renderer) this.compiled = next;
    next.root.rotation.y = this.yaw;
    this.scene.add(next.root);
  }

  /** Makes the renderer, compiles `look` and uploads it with one 1 px draw, ahead of the next open (at boot, then on each close). */
  warm(look: CharacterLook): void {
    if (!this.renderer) this.create();
    void this.show(look).then(() => {
      if (this.handle === null) this.renderer?.render(this.scene, this.camera);
    });
  }

  /** Starts the loop; without `warm` the renderer is made in its first frame, so the frame that opens the creator only lays out the page. */
  start(): void {
    if (this.handle !== null) return;
    this.frames = 0;
    this.last = performance.now();
    const frame = (t: number) => {
      this.handle = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      if (!this.renderer) {
        this.create();
        return;
      }
      if (!this.resize) this.observe();
      if (!this.drag) this.yaw += SPIN * dt;
      if (this.avatar && this.avatar === this.compiled) {
        this.avatar.root.rotation.y = this.yaw;
        this.avatar.update(dt);
        this.renderer.render(this.scene, this.camera);
        this.frames++;
      }
    };
    this.handle = requestAnimationFrame(frame);
  }

  private create(): void {
    const r = new WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR));
    r.toneMapping = NeutralToneMapping;
    r.toneMappingExposure = CAMPUS.exposure;
    this.host.appendChild(r.domElement);
    this.renderer = r;
    if (this.handle !== null) this.observe();
    else r.setSize(1, 1);
    for (const resolve of this.waiting.splice(0)) resolve(r);
  }

  private observe(): void {
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(this.host);
    this.fit();
  }

  /** The renderer, once made; null while stopped and never warmed. */
  private rendererReady(): Promise<WebGLRenderer | null> {
    if (this.renderer || this.handle === null) return Promise.resolve(this.renderer);
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /** Stops the loop and shrinks the canvas to 1 px; the context and its compiled programs stay for the next open. */
  stop(): void {
    if (this.handle !== null) cancelAnimationFrame(this.handle);
    this.handle = null;
    this.resize?.disconnect();
    this.resize = null;
    this.renderer?.setSize(1, 1);
    this.compiled = null;
    for (const resolve of this.waiting.splice(0)) resolve(null);
  }

  /** Draw calls of the last frame (one per character). */
  get calls(): number {
    return this.renderer?.info.render.calls ?? 0;
  }

  private fit(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer?.setSize(w, h);
    this.camera.aspect = w / h;
    const tall = h / w;
    this.camera.position.set(0, 1.75, tall > 1.1 ? 7.4 * Math.min(tall, 1.6) : 7.6);
    this.camera.lookAt(0, 1.45, 0);
    this.camera.updateProjectionMatrix();
  }
}
