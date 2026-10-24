import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Avatar } from '../../player/avatar';
import type { AvatarFactory } from '../../player/avatar-kit';
import type { CharacterLook } from '../../player/character/look';

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
  /** Frames drawn since `start()`. */
  frames = 0;

  constructor(
    readonly host: HTMLElement,
    private readonly factory: AvatarFactory,
  ) {
    this.scene.add(new HemisphereLight(0xffffff, 0x9fb7d0, 2.4));
    const sun = new DirectionalLight(0xffffff, 1.5);
    sun.position.set(2, 4, 6);
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

  /** Shows `look`; a newer call wins over a slower older one. */
  async show(look: CharacterLook): Promise<void> {
    const ticket = ++this.ticket;
    const next = await this.factory.create(look);
    if (ticket !== this.ticket) {
      next.dispose();
      return;
    }
    this.avatar?.root.removeFromParent();
    this.avatar?.dispose();
    this.avatar = next;
    next.root.rotation.y = this.yaw;
    this.scene.add(next.root);
  }

  /** Creates the renderer and starts the loop. */
  start(): void {
    if (!this.renderer) {
      this.renderer = new WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR));
      this.host.appendChild(this.renderer.domElement);
      this.resize = new ResizeObserver(() => this.fit());
      this.resize.observe(this.host);
    }
    this.fit();
    this.frames = 0;
    this.last = performance.now();
    const frame = (t: number) => {
      this.handle = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      if (!this.drag) this.yaw += SPIN * dt;
      if (this.avatar) {
        this.avatar.root.rotation.y = this.yaw;
        this.avatar.update(dt);
      }
      this.renderer!.render(this.scene, this.camera);
      this.frames++;
    };
    this.handle = requestAnimationFrame(frame);
  }

  /** Stops the loop and frees the GPU context (the world keeps the only one while playing). */
  stop(): void {
    if (this.handle !== null) cancelAnimationFrame(this.handle);
    this.handle = null;
    this.resize?.disconnect();
    this.resize = null;
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer?.domElement.remove();
    this.renderer = null;
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
